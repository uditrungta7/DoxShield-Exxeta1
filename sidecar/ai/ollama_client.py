"""Ollama client for local LLM inference."""
import os
from typing import Optional, AsyncIterator
import httpx

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mistral")


async def check_ollama_health() -> dict:
    """Check if Ollama is running and model is available."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_HOST}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                models = [m["name"] for m in data.get("models", [])]
                model_available = any(OLLAMA_MODEL in m for m in models)
                return {
                    "status": "ready" if model_available else "model_missing",
                    "models": models,
                    "model": OLLAMA_MODEL,
                    "host": OLLAMA_HOST,
                }
    except httpx.ConnectError:
        return {"status": "offline", "models": [], "model": OLLAMA_MODEL, "host": OLLAMA_HOST}
    except Exception as e:
        return {"status": "error", "error": str(e), "models": [], "model": OLLAMA_MODEL, "host": OLLAMA_HOST}
    return {"status": "offline", "models": [], "model": OLLAMA_MODEL, "host": OLLAMA_HOST}


async def generate(prompt: str, system: Optional[str] = None, model: Optional[str] = None) -> str:
    """Generate a completion using Ollama."""
    model = model or OLLAMA_MODEL
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{OLLAMA_HOST}/api/chat",
                json={"model": model, "messages": messages, "stream": False,
                      "options": {"temperature": 0.1, "num_predict": 1024}},
            )
            if resp.status_code == 200:
                return resp.json().get("message", {}).get("content", "")
    except Exception as e:
        print(f"Ollama generate error: {e}")
    return ""


async def generate_stream(
    prompt: str,
    system: Optional[str] = None,
    model: Optional[str] = None,
) -> AsyncIterator[str]:
    """Generate a streaming completion."""
    import json as _json
    model = model or OLLAMA_MODEL
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{OLLAMA_HOST}/api/chat",
                json={"model": model, "messages": messages, "stream": True},
            ) as response:
                async for line in response.aiter_lines():
                    if line:
                        try:
                            data = _json.loads(line)
                            content = data.get("message", {}).get("content", "")
                            if content:
                                yield content
                            if data.get("done"):
                                break
                        except _json.JSONDecodeError:
                            continue
    except Exception as e:
        print(f"Ollama stream error: {e}")
