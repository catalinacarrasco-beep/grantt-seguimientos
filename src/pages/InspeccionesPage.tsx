import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Trash2, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { EmptyState, TableSkeleton } from '../components/Empty'

type Inspeccion = {
  id: string
  created_at: string
  invoice_num: string
  din_num: string
  color_lote: string
  trazabilidad: string
  fecha_inspeccion: string
  productos: unknown[]
  cumple: boolean
  user_email: string
}

export default function InspeccionesPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Inspeccion[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('inspecciones')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    setRows((data || []) as Inspeccion[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const del = async (id: string) => {
    if (!confirm('¿Eliminar este registro de inspección?')) return
    const { error } = await supabase.from('inspecciones').delete().eq('id', id)
    if (error) { alert(`Error al eliminar: ${error.message}`); return }
    setRows(prev => prev.filter(r => r.id !== id))
  }

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <div className="page-title">Inspecciones de calidad</div>
        <div className="page-sub" style={{ marginBottom: 0 }}>Historial de controles de marcado guardados</div>
      </div>

      {loading ? (
        <TableSkeleton cols={8} rows={6} />
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            kind="stack"
            title="Sin inspecciones aún"
            sub="Completá y guardá una inspección de marcado para que aparezca en esta tabla."
            action={<button className="btn btn-primary btn-sm" onClick={() => navigate('/calidad')}>Ir a inspección</button>}
          />
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Invoice</th>
                <th>DIN</th>
                <th>Color lote</th>
                <th>Productos</th>
                <th>Resultado</th>
                <th>Usuario</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.fecha_inspeccion || formatDate(r.created_at)}</td>
                  <td style={{ fontWeight: 600, color: '#e2e8f0' }}>{r.invoice_num || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.din_num || '—'}</td>
                  <td>{r.color_lote || '—'}</td>
                  <td><span className="badge badge-blue">{Array.isArray(r.productos) ? r.productos.length : '—'}</span></td>
                  <td>
                    {r.cumple
                      ? <span className="badge badge-green">✓ Cumple</span>
                      : <span className="badge badge-red">✗ No cumple</span>}
                  </td>
                  <td style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{r.user_email?.split('@')[0]}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn-icon" style={{ color: 'rgba(165,180,252,0.6)' }}
                        title="Editar inspección" onClick={() => navigate('/calidad', { state: { editInspection: { id: r.id, invoice_num: r.invoice_num, din_num: r.din_num, color_lote: r.color_lote, trazabilidad: r.trazabilidad, productos: r.productos } } })}>
                        <Pencil size={14} />
                      </button>
                      <button className="btn-icon" style={{ color: 'rgba(239,68,68,0.5)' }}
                        title="Eliminar" onClick={() => del(r.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

