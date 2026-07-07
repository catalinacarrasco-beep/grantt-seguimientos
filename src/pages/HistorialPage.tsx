import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, FileText, Trash2, Plus } from 'lucide-react'
import { supabase, type Seguimiento } from '../lib/supabase'

export default function HistorialPage() {
  const [rows, setRows] = useState<Seguimiento[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('seguimientos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const del = async (id: string) => {
    if (!confirm('¿Eliminar este seguimiento?')) return
    await supabase.from('seguimientos').delete().eq('id', id)
    setRows(prev => prev.filter(r => r.id !== id))
  }

  const openNotaVenta = (r: Seguimiento) => {
    const notas = JSON.parse(localStorage.getItem('notas_venta') || '[]')
    if (!notas.find((n: any) => n.invoiceNum === r.invoice_num)) {
      const data = (r as any).productos_data as { modelo: string; nombre: string }[] | null
      const codes = data || []
      const quantities: Record<string, string> = {}
      codes.forEach(c => { quantities[c.modelo] = '' })
      notas.push({ invoiceNum: r.invoice_num, codes, quantities, timestamp: Date.now() })
      localStorage.setItem('notas_venta', JSON.stringify(notas))
    }
    navigate('/nota-venta')
  }

  const estadoBadge = (e: string) => {
    if (e === 'completado') return <span className="badge badge-green">Completado</span>
    if (e === 'error') return <span className="badge badge-red">Error</span>
    return <span className="badge badge-amber">Pendiente</span>
  }

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric'
  })

  return (
    <div className="page">
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <div>
          <div className="page-title">Historial</div>
          <div className="page-sub" style={{ marginBottom: 0 }}>Todos los seguimientos procesados</div>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/nuevo')}>
          <Plus size={14} /> Nuevo seguimiento
        </button>
      </div>

      {loading ? (
        <div className="card"><div className="text-muted text-sm">Cargando...</div></div>
      ) : rows.length === 0 ? (
        <div className="card">
          <div className="empty">
            <FileText size={40} className="empty-icon" />
            <div className="empty-title">Sin seguimientos aún</div>
            <div className="empty-sub">Procesa tu primer lote para verlo aquí</div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>DIN</th>
                <th>Fecha</th>
                <th>Productos</th>
                <th>Usuario</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600, color: '#e2e8f0' }}>{r.invoice_num}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.din_num}</td>
                  <td>{formatDate(r.created_at)}</td>
                  <td><span className="badge badge-blue">{r.productos_count}</span></td>
                  <td style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{r.user_email?.split('@')[0]}</td>
                  <td>{estadoBadge(r.estado)}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn-icon" title="Nota de venta"
                        onClick={() => openNotaVenta(r)}
                        style={{ color: 'rgba(165,180,252,0.6)' }}>
                        <FileText size={14} />
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
