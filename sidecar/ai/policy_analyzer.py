"""Privacy policy fetcher and Mistral-powered analyzer."""
import hashlib
import json
import os
import re
from datetime import datetime, timedelta
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

CACHE_PATH = Path.home() / ".doxshield" / "policy_cache.json"
CACHE_TTL_DAYS = 7
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mistral")


def _load_cache() -> dict:
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text())
        except Exception:
            pass
    return {}


def _save_cache(cache: dict):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, indent=2))


def fetch_policy_text(url: str, timeout: int = 15) -> tuple[str, str]:
    """Fetch and clean privacy policy text. Returns (text, error)."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True,
                          headers=headers) as client:
            resp = client.get(url)
            resp.raise_for_status()
    except httpx.TimeoutException:
        return "", f"Timeout fetching {url}"
    except httpx.HTTPStatusError as e:
        return "", f"HTTP {e.response.status_code}"
    except Exception as e:
        return "", f"Fetch error: {e}"

    soup = BeautifulSoup(resp.text, 'lxml')
    for tag in soup.find_all(['script', 'style', 'nav', 'header', 'footer',
                               'iframe', 'noscript', 'form', 'button']):
        tag.decompose()

    main = (soup.find('main') or
            soup.find('article') or
            soup.find(id=re.compile(r'privacy|policy|content|main', re.I)) or
            soup.find(class_=re.compile(r'privacy|policy|content|main', re.I)) or
            soup.find('body'))

    text = main.get_text(separator=' ', strip=True) if main else ""
    text = re.sub(r'\s+', ' ', text).strip()

    if len(text) > 6000:
        text = text[:3500] + "\n\n[...truncated...]\n\n" + text[-2000:]
    return text, ""


async def _call_ollama(prompt: str, max_tokens: int = 800) -> str:
    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(
            f"{OLLAMA_HOST}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.1, "num_predict": max_tokens},
            }
        )
        resp.raise_for_status()
        return resp.json().get("response", "").strip()


async def _analyze_with_mistral(app_name: str, hq_country: str,
                                 policy_text: str) -> dict:
    prompt = f"""You are a data privacy legal analyst specialising in EU law, GDPR, and the US CLOUD Act.
Analyse the privacy policy for {app_name} (headquartered in {hq_country}).

Return ONLY valid JSON starting with {{. No explanation or markdown.

Required structure:
{{
  "cloud_act_exposure": true or false,
  "data_stored_outside_eu": true or false or null,
  "data_categories": ["list of 3-8 data types collected"],
  "third_party_sharing": true or false,
  "key_risks": ["3-5 risk statements, each max 20 words"],
  "risk_level": "HIGH" or "MEDIUM" or "LOW",
  "one_line_summary": "single sentence max 25 words",
  "applicable_law": ["CLOUD Act"] or ["GDPR only"] or ["FISA 702", "CLOUD Act"],
  "requires_alert": true or false
}}

Policy text:
{policy_text}"""

    try:
        raw = await _call_ollama(prompt, 800)
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            return json.loads(match.group())
    except (json.JSONDecodeError, Exception):
        pass

    # Retry with simpler prompt
    simple = f"""For {app_name} ({hq_country}) privacy policy, return ONLY JSON starting with {{:
{{"risk_level": "HIGH" or "MEDIUM" or "LOW",
  "one_line_summary": "one sentence",
  "key_risks": ["risk 1", "risk 2", "risk 3"],
  "data_categories": ["type 1", "type 2"],
  "cloud_act_exposure": true or false,
  "requires_alert": true or false}}

Policy: {policy_text[:2000]}"""
    try:
        raw2 = await _call_ollama(simple, 400)
        match2 = re.search(r'\{.*\}', raw2, re.DOTALL)
        if match2:
            return json.loads(match2.group())
    except Exception:
        pass

    # Fallback
    return {
        "cloud_act_exposure": hq_country in ("USA", "United States", "US"),
        "data_categories": ["usage data"],
        "key_risks": ["Could not analyse policy automatically"],
        "risk_level": "HIGH" if hq_country in ("USA", "United States", "US") else "MEDIUM",
        "one_line_summary": "Automated analysis failed — manual review recommended.",
        "applicable_law": ["CLOUD Act"] if hq_country in ("USA", "United States", "US") else [],
        "requires_alert": False,
        "error": "parse_failed",
    }


async def analyze_policy(app_id: str, app_name: str, policy_url: str) -> dict:
    """Legacy entry point used by existing code."""
    return await get_or_analyze_policy(app_id, app_name, "Unknown", policy_url)


async def get_or_analyze_policy(
    app_id: str,
    app_name: str,
    hq_country: str,
    policy_url: str | None = None,
) -> dict:
    """Main entry point with caching."""
    cache_key = hashlib.md5(f"{app_id}{policy_url}".encode()).hexdigest()
    cache = _load_cache()

    if cache_key in cache:
        entry = cache[cache_key]
        try:
            cached_at = datetime.fromisoformat(entry.get("cached_at", "2000-01-01"))
            if datetime.now() - cached_at < timedelta(days=CACHE_TTL_DAYS):
                return {**entry["result"], "from_cache": True,
                        "policy_url": entry.get("policy_url")}
        except Exception:
            pass

    if policy_url:
        policy_text, err = fetch_policy_text(policy_url)
        if err or not policy_text:
            policy_text = f"Policy at {policy_url} could not be fetched: {err}"
    else:
        policy_text = f"No privacy policy URL available for {app_name}."

    result = await _analyze_with_mistral(app_name, hq_country, policy_text)

    cache[cache_key] = {
        "result": result,
        "cached_at": datetime.now().isoformat(),
        "app_name": app_name,
        "policy_url": policy_url,
    }
    _save_cache(cache)

    return {**result, "from_cache": False, "policy_url": policy_url}
