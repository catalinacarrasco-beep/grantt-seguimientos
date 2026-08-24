import type { ReactNode } from 'react'

// ── Empty state con ilustración SVG mini custom ─────────────────────────
// Cinco variantes; pasás la que tenga más sentido al contexto.
type EmptyKind = 'stack' | 'ruler' | 'calipers' | 'search' | 'chart'

const svgs: Record<EmptyKind, ReactNode> = {
  stack: (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="es-stack" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00A0DF" stopOpacity="0.28" />
          <stop offset="1" stopColor="#00A0DF" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <rect x="14" y="12" width="44" height="10" rx="3" fill="url(#es-stack)" stroke="rgba(255,255,255,0.14)" />
      <rect x="10" y="26" width="52" height="10" rx="3" fill="url(#es-stack)" stroke="rgba(255,255,255,0.14)" />
      <rect x="14" y="40" width="44" height="10" rx="3" fill="url(#es-stack)" stroke="rgba(255,255,255,0.14)" />
      <rect x="18" y="54" width="36" height="6" rx="2" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.09)" />
    </svg>
  ),
  ruler: (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="es-ruler" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#00A0DF" stopOpacity="0.22" />
          <stop offset="1" stopColor="#00A0DF" stopOpacity="0.06" />
        </linearGradient>
      </defs>
      <rect x="8" y="26" width="56" height="20" rx="3" fill="url(#es-ruler)" stroke="rgba(255,255,255,0.16)" />
      {[14,20,26,32,38,44,50,56].map(x => (
        <line key={x} x1={x} y1="26" x2={x} y2={x % 12 === 2 ? 40 : 34} stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
      ))}
      <circle cx="36" cy="36" r="1.8" fill="#00B8FA" />
    </svg>
  ),
  calipers: (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 22 L24 22 L24 52 L12 52 Z" fill="rgba(0,160,223,0.14)" stroke="rgba(255,255,255,0.18)" />
      <path d="M48 22 L60 22 L60 52 L48 52 Z" fill="rgba(0,160,223,0.14)" stroke="rgba(255,255,255,0.18)" />
      <rect x="24" y="34" width="24" height="6" fill="rgba(0,160,223,0.22)" stroke="rgba(255,255,255,0.16)" />
      <line x1="24" y1="18" x2="48" y2="18" stroke="rgba(255,255,255,0.35)" strokeDasharray="2 2" />
      <circle cx="24" cy="18" r="1.5" fill="#00B8FA" />
      <circle cx="48" cy="18" r="1.5" fill="#00B8FA" />
    </svg>
  ),
  search: (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="16" fill="rgba(0,160,223,0.08)" stroke="rgba(255,255,255,0.22)" strokeWidth="2" />
      <line x1="43" y1="43" x2="56" y2="56" stroke="rgba(255,255,255,0.4)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  ),
  chart: (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="14" y="42" width="8" height="18" rx="1.5" fill="rgba(0,160,223,0.22)" />
      <rect x="26" y="30" width="8" height="30" rx="1.5" fill="rgba(0,160,223,0.32)" />
      <rect x="38" y="20" width="8" height="40" rx="1.5" fill="rgba(0,160,223,0.44)" />
      <rect x="50" y="36" width="8" height="24" rx="1.5" fill="rgba(0,160,223,0.28)" />
      <line x1="10" y1="60" x2="62" y2="60" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
    </svg>
  ),
}

export function EmptyState({ kind = 'stack', title, sub, action }: {
  kind?: EmptyKind
  title: string
  sub?: string
  action?: ReactNode
}) {
  return (
    <div className="empty" style={{ padding: '56px 24px' }}>
      <div style={{ opacity: 0.9, margin: '0 auto 18px' }}>{svgs[kind]}</div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub" style={{ maxWidth: 360, margin: '6px auto 0' }}>{sub}</div>}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  )
}

// ── Table skeleton — filas fantasma mientras carga ─────────────────────
export function TableSkeleton({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="table">
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}>
                  <div className="skeleton" style={{ height: 14, width: c === 0 ? '70%' : c === cols - 1 ? '30%' : '55%' }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
