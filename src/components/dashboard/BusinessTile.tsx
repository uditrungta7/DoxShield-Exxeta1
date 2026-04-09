import React from 'react'

function Metric({ label, value, sub, subColor = 'var(--text-secondary)' }: {
  label: string; value: string; sub: string; subColor?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span style={{ color: 'var(--text-tertiary)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize: 24, color: 'var(--text-primary)', fontWeight: 700, lineHeight: 1.2 }}>
        {value}
      </span>
      <span style={{ fontSize: 11, color: subColor, fontWeight: 500 }}>{sub}</span>
    </div>
  )
}

export function BusinessTile() {
  return (
    <div
      className="rounded-card border p-5 mb-6"
      style={{ background: 'linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary))', borderColor: 'var(--border-default)' }}
    >
      <div className="flex items-start justify-between mb-5">
        <span style={{ color: 'var(--text-tertiary)', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Organisation Overview
        </span>
        <span className="px-2 py-0.5 rounded border text-xs" style={{ color: 'var(--risk-unverified)', borderColor: 'var(--risk-unverified)', fontSize: 10 }}>
          Placeholder — live data coming soon
        </span>
      </div>
      <div className="grid grid-cols-6 gap-4">
        <Metric label="Company Risk Score"         value="67 / 100"    sub="■ MODERATE"        subColor="var(--risk-medium)" />
        <Metric label="Data Outside EU"             value="34%"         sub="▲ Above average"   subColor="var(--risk-medium)" />
        <Metric label="Legal Jurisdiction Exposure" value="US + CN"     sub="▲ Critical"        subColor="var(--risk-severe)" />
        <Metric label="High-Risk Applications"      value="12 apps"     sub="■ Review required" subColor="var(--risk-high)" />
        <Metric label="Sensitive Data Exposure"     value="8 datasets"  sub="■ HIGH"            subColor="var(--risk-high)" />
        <Metric label="Shadow IT Transfers"         value="6 detected"  sub="■ Requires audit"  subColor="var(--risk-medium)" />
      </div>
    </div>
  )
}
