import { useEffect, useMemo, useState } from 'react'
import { Ruler, ExternalLink, AlertTriangle, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { EmptyState, TableSkeleton } from '../components/Empty'

type Foto = { driveId: string; name: string; webViewLink?: string }
type ProductoDB = {
  modelo: string; nombre: string; cantidad: number; muestras: number
  espesor: { declarado: number | null; unidad: string; mediciones: number[]; avg: number; min: number; max: number; count?: number }
  resistencia: { deformacion: boolean; descripcion: string; resultado: string }
  otras: { checklist: { item: string; ok: boolean | null; nota: string }[]; libre: string }
  observaciones: string
  fotos: Foto[]
}
type Control = {
  id: string
  created_at: string
  invoice_num: string
  proveedor: string | null
  din_num: string | null
  fecha_llegada: string | null
  drive_folder_id: string | null
  productos: ProductoDB[]
  veredicto: 'aprobado' | 'observaciones' | 'rechazado'
  accion_tomada: string | null
  informe_view_link: string | null
  informe_nombre: string | null
  user_email: string | null
}

const veredictoBadge = (v: string) => {
  if (v === 'aprobado') return <span className="badge badge-green">✓ Aprobado</span>
  if (v === 'observaciones') return <span className="badge" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>⚠ Observaciones</span>
  if (v === 'rechazado') return <span className="badge badge-red">✗ Rechazado</span>
  return <span className="badge">—</span>
}

// Mini sparkline: rechazos+observaciones por mes en los últimos 6 meses.
function RecurrentSparkline({ rows, proveedor }: { rows: Control[]; proveedor: string }) {
  const now = new Date()
  const bins: number[] = Array.from({ length: 6 }, () => 0)
  for (const r of rows) {
    if (r.proveedor !== proveedor) continue
    if (r.veredicto === 'aprobado') continue
    const d = new Date(r.created_at)
    const mDiff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
    if (mDiff >= 0 && mDiff < 6) bins[5 - mDiff]++
  }
  const max = Math.max(1, ...bins)
  const total = bins.reduce((s, x) => s + x, 0)
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <svg width="72" height="20" viewBox="0 0 72 20" style={{ verticalAlign: 'middle' }}>
        {bins.map((v, i) => {
          const h = v === 0 ? 2 : Math.max(3, (v / max) * 18)
          return <rect key={i} x={i * 12 + 1} y={20 - h} width={10} height={h} rx="1.5"
            fill={v === 0 ? 'rgba(255,255,255,0.10)' : 'var(--warn)'} opacity={v === 0 ? 0.6 : 0.85} />
        })}
      </svg>
      <span style={{ fontSize: 10, color: 'var(--ink-4)', fontVariantNumeric: 'tabular-nums' }}>{total} en 6m</span>
    </div>
  )
}

export default function CanaletasHistorialPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Control[]>([])
  const [loading, setLoading] = useState(true)
  const [filterProv, setFilterProv] = useState('')
  const [filterCode, setFilterCode] = useState('')
  const [filterVered, setFilterVered] = useState('')
  const [selected, setSelected] = useState<Control | null>(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('controles_canaletas').select('*').order('created_at', { ascending: false }).limit(200)
    setRows((data || []) as Control[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Set de proveedores para el dropdown
  const proveedores = useMemo(() => {
    const s = new Set<string>()
    rows.forEach(r => { if (r.proveedor) s.add(r.proveedor) })
    return [...s].sort()
  }, [rows])

  // Proveedores con >=2 controles no aprobados en últimos 12 meses
  const proveedoresRecurrentes = useMemo(() => {
    const cutoff = Date.now() - 365 * 24 * 3600 * 1000
    const count: Record<string, number> = {}
    for (const r of rows) {
      if (!r.proveedor) continue
      if (r.veredicto === 'aprobado') continue
      const t = Date.parse(r.created_at)
      if (t < cutoff) continue
      count[r.proveedor] = (count[r.proveedor] || 0) + 1
    }
    return new Set(Object.entries(count).filter(([, n]) => n >= 2).map(([p]) => p))
  }, [rows])

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filterProv && r.proveedor !== filterProv) return false
      if (filterVered && r.veredicto !== filterVered) return false
      if (filterCode.trim()) {
        const q = filterCode.trim().toUpperCase()
        const has = r.productos?.some(p => (p.modelo || '').toUpperCase().includes(q))
        if (!has) return false
      }
      return true
    })
  }, [rows, filterProv, filterCode, filterVered])

  const del = async (id: string) => {
    if (!window.confirm('¿Eliminar este control? No se pueden recuperar los datos.')) return
    const { error } = await supabase.from('controles_canaletas').delete().eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    setRows(prev => prev.filter(r => r.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <div className="page-title">Control canaletas — Historial de lotes</div>
        <div className="page-sub" style={{ marginBottom: 0 }}>Un lote por invoice, con muestreo aleatorio por modelo. Filtrable por proveedor, código y resultado.</div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Proveedor</label>
            <select className="input" value={filterProv} onChange={e => setFilterProv(e.target.value)}>
              <option value="">Todos</option>
              {proveedores.map(p => <option key={p} value={p}>{p}{proveedoresRecurrentes.has(p) ? ' ⚠' : ''}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Código</label>
            <input className="input" value={filterCode} onChange={e => setFilterCode(e.target.value)} placeholder="Ej: 05231" />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Resultado</label>
            <select className="input" value={filterVered} onChange={e => setFilterVered(e.target.value)}>
              <option value="">Todos</option>
              <option value="aprobado">Aprobado</option>
              <option value="observaciones">Con observaciones</option>
              <option value="rechazado">Rechazado</option>
            </select>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => { setFilterProv(''); setFilterCode(''); setFilterVered('') }}>Limpiar</button>
        </div>
        {proveedoresRecurrentes.size > 0 && (
          <div style={{ marginTop: 14, padding: 14, background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--warn)', fontWeight: 600, marginBottom: 10 }}>
              <AlertTriangle size={14} />
              Proveedores con fallos recurrentes (últimos 12 meses)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...proveedoresRecurrentes].map(prov => (
                <div key={prov} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '6px 10px', background: 'rgba(0,0,0,0.15)', borderRadius: 6 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink-1)', fontWeight: 500 }}>{prov}</div>
                  <RecurrentSparkline rows={rows} proveedor={prov} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <TableSkeleton cols={7} rows={6} />
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            kind="ruler"
            title={rows.length === 0 ? 'Sin lotes controlados' : 'Sin resultados con esos filtros'}
            sub={rows.length === 0 ? 'Cada lote (una invoice) queda registrado acá con su muestreo por modelo.' : 'Probá quitar filtros o cambiarlos.'}
            action={rows.length === 0 ? <button className="btn btn-primary btn-sm" onClick={() => navigate('/canaletas')}>Nuevo control</button> : undefined}
          />
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Lote · Invoice</th>
                <th>Proveedor</th>
                <th>Códigos</th>
                <th>Resultado</th>
                <th>Acción</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} onClick={() => setSelected(r)} style={{ cursor: 'pointer' }}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleDateString('es-CL')}</td>
                  <td style={{ fontWeight: 600, color: '#e2e8f0' }}>{r.invoice_num}</td>
                  <td>
                    {r.proveedor || '—'}
                    {r.proveedor && proveedoresRecurrentes.has(r.proveedor) && <AlertTriangle size={12} color="#fbbf24" style={{ marginLeft: 6, verticalAlign: 'middle' }} />}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(r.productos || []).slice(0, 3).map(p => <span key={p.modelo} className="badge badge-blue" style={{ fontSize: 10 }}>{p.modelo}</span>)}
                      {(r.productos || []).length > 3 && <span className="badge" style={{ fontSize: 10 }}>+{r.productos.length - 3}</span>}
                    </div>
                  </td>
                  <td>{veredictoBadge(r.veredicto)}</td>
                  <td style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.accion_tomada || '—'}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {r.informe_view_link && <a className="btn-icon" href={r.informe_view_link} target="_blank" rel="noreferrer" title="Ver informe"><ExternalLink size={12} /></a>}
                      <button className="btn-icon" style={{ color: 'rgba(239,68,68,0.5)' }} onClick={() => del(r.id)} title="Eliminar"><X size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detalle */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setSelected(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(720px, 100vw)', height: '100vh', overflowY: 'auto', background: '#0f1421', borderLeft: '1px solid rgba(255,255,255,0.08)', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: '#a5b4fc', fontWeight: 700 }}>Lote</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>Invoice {selected.invoice_num}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                  {selected.proveedor || '(sin proveedor)'} · {new Date(selected.created_at).toLocaleString('es-CL')}
                </div>
              </div>
              <button className="btn-icon" onClick={() => setSelected(null)}><X size={16} /></button>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {veredictoBadge(selected.veredicto)}
              {selected.din_num && <span className="badge" style={{ fontSize: 10 }}>DIN {selected.din_num}</span>}
              {selected.fecha_llegada && <span className="badge" style={{ fontSize: 10 }}>Llegada {selected.fecha_llegada}</span>}
              {selected.informe_view_link && <a href={selected.informe_view_link} target="_blank" rel="noreferrer" className="badge badge-blue" style={{ fontSize: 10 }}>Ver informe →</a>}
            </div>

            {selected.accion_tomada && (
              <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 6, padding: 10, marginBottom: 16, fontSize: 12 }}>
                <div style={{ color: '#fbbf24', fontWeight: 600, marginBottom: 4 }}>Acción tomada</div>
                <div style={{ color: 'rgba(255,255,255,0.8)' }}>{selected.accion_tomada}</div>
              </div>
            )}

            {(selected.productos || []).map(p => (
              <div key={p.modelo} className="card" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>{p.modelo}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>{p.nombre} · {p.cantidad} PCS · {p.muestras} muestras</div>
                <div style={{ fontSize: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>Espesor</div>
                    <div>Declarado: {p.espesor.declarado ?? '—'} {p.espesor.unidad}</div>
                    <div>Mediciones: {(p.espesor.mediciones || []).join(', ') || '—'}</div>
                    <div>avg {p.espesor.avg?.toFixed(3)} · min {p.espesor.min?.toFixed(3)} · max {p.espesor.max?.toFixed(3)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>Resistencia {veredictoBadge(p.resistencia.resultado)}</div>
                    <div>Deformación: {p.resistencia.deformacion ? 'sí' : 'no'}</div>
                    <div style={{ color: 'rgba(255,255,255,0.7)' }}>{p.resistencia.descripcion || '—'}</div>
                  </div>
                </div>
                {p.otras?.checklist?.length > 0 && (
                  <div style={{ fontSize: 12, marginBottom: 8 }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Otras verificaciones</div>
                    {p.otras.checklist.map((c, ci) => (
                      <div key={ci} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ color: c.ok === true ? '#4ade80' : c.ok === false ? '#f87171' : 'rgba(255,255,255,0.5)' }}>
                          {c.ok === true ? '✓' : c.ok === false ? '✗' : '·'}
                        </span>
                        <span>{c.item}</span>
                        {c.nota && <span style={{ color: 'rgba(255,255,255,0.5)' }}>— {c.nota}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {p.otras?.libre && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>{p.otras.libre}</div>}
                {p.observaciones && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>Obs: {p.observaciones}</div>}
                {p.fotos?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {p.fotos.map((f, fi) => (
                      f.webViewLink
                        ? <a key={fi} href={f.webViewLink} target="_blank" rel="noreferrer" className="badge badge-blue" style={{ fontSize: 10 }}>{f.name}</a>
                        : <span key={fi} className="badge" style={{ fontSize: 10 }}>{f.name}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
