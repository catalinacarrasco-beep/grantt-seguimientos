import { useState } from 'react'
import { Send, Trash2, FileText, Plus, X } from 'lucide-react'
import { lookupProduct } from '../lib/products'

type NotaEntry = {
  invoiceNum: string
  codes: { modelo: string; nombre: string }[]
  quantities: Record<string, string>
  timestamp: number
}

const STORAGE_KEY = 'notas_venta'

function loadNotas(): NotaEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

function saveNotas(notas: NotaEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notas))
}

export default function NotaVentaPage() {
  const [notas, setNotas] = useState<NotaEntry[]>(loadNotas)
  const [newCode, setNewCode] = useState<Record<string, string>>({})

  const updateQuantity = (invoiceNum: string, modelo: string, value: string) => {
    setNotas(prev => {
      const updated = prev.map(n =>
        n.invoiceNum === invoiceNum
          ? { ...n, quantities: { ...n.quantities, [modelo]: value } }
          : n
      )
      saveNotas(updated)
      return updated
    })
  }

  const addCode = (invoiceNum: string) => {
    const raw = (newCode[invoiceNum] || '').trim()
    if (!raw) return
    const code = raw.toUpperCase().replace(/\s+/g, '-')
    setNotas(prev => {
      const updated = prev.map(n => {
        if (n.invoiceNum !== invoiceNum) return n
        if (n.codes.find(c => c.modelo === code)) return n
        let nombre = code
      try { const p = lookupProduct(code); if (p) nombre = p.nombre } catch {}
        return {
          ...n,
          codes: [...n.codes, { modelo: code, nombre }],
          quantities: { ...n.quantities, [code]: '' },
        }
      })
      saveNotas(updated)
      return updated
    })
    setNewCode(prev => ({ ...prev, [invoiceNum]: '' }))
  }

  const removeCode = (invoiceNum: string, modelo: string) => {
    setNotas(prev => {
      const updated = prev.map(n => {
        if (n.invoiceNum !== invoiceNum) return n
        const { [modelo]: _, ...rest } = n.quantities
        return { ...n, codes: n.codes.filter(c => c.modelo !== modelo), quantities: rest }
      })
      saveNotas(updated)
      return updated
    })
  }

  const sendNota = (nota: NotaEntry) => {
    const filled = nota.codes.filter(c => {
      const qty = nota.quantities[c.modelo]
      return qty && parseInt(qty) > 0
    })
    if (!filled.length) return

    const lines = filled.map((c, i) => `${i + 1}. ${c.modelo} — ${nota.quantities[c.modelo]} unidades`)
    const body = [
      'Estimada Paula,',
      '',
      'Favor su ayuda con nota de venta para muestras para certificación de seguimiento para CESMEC, los modelos son:',
      '',
      ...lines,
      '',
      'Saludos cordiales',
    ].join('\n')

    const subject = `Nota de venta para muestras ${nota.invoiceNum}`
    window.open(
      `https://mail.google.com/mail/?view=cm&to=catalina.carrasco@grantt.cl&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
      '_blank'
    )
  }

  const deleteNota = (invoiceNum: string) => {
    if (!window.confirm(`¿Eliminar nota de ${invoiceNum}?`)) return
    setNotas(prev => {
      const updated = prev.filter(n => n.invoiceNum !== invoiceNum)
      saveNotas(updated)
      return updated
    })
  }

  if (!notas.length) {
    return (
      <div className="page">
        <div className="page-title">Nota de Venta Muestras</div>
        <div className="page-sub">Sin notas pendientes</div>
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.3)' }}>
          <FileText size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
          <div style={{ fontSize: 13 }}>Procesa una Invoice en "Nuevo seguimiento" o crea una desde el Historial</div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-title">Nota de Venta Muestras</div>
      <div className="page-sub">{notas.length} nota{notas.length !== 1 ? 's' : ''} pendiente{notas.length !== 1 ? 's' : ''}</div>

      {notas.map(nota => {
        const filledCount = nota.codes.filter(c => {
          const q = nota.quantities[c.modelo]
          return q && parseInt(q) > 0
        }).length

        return (
          <div className="card" key={nota.invoiceNum} style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div>
                <div className="card-title">Invoice {nota.invoiceNum}</div>
                <div className="text-xs text-muted">
                  {nota.codes.length} código{nota.codes.length !== 1 ? 's' : ''} · {filledCount} con cantidad
                </div>
              </div>
              <span className={`badge ${filledCount > 0 && filledCount === nota.codes.length ? 'badge-green' : 'badge-amber'}`}>
                {filledCount}/{nota.codes.length}
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Código</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Producto</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontWeight: 600, width: 100 }}>Cantidad</th>
                    <th style={{ width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {nota.codes.map(c => (
                    <tr key={c.modelo} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#a5b4fc', whiteSpace: 'nowrap' }}>{c.modelo}</td>
                      <td style={{ padding: '6px 10px', color: 'rgba(255,255,255,0.6)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</td>
                      <td style={{ padding: '4px 10px', textAlign: 'center' }}>
                        <input
                          type="number"
                          className="field-input"
                          style={{ width: 80, textAlign: 'center', fontSize: 12, margin: '0 auto', display: 'block' }}
                          value={nota.quantities[c.modelo] || ''}
                          onChange={e => updateQuantity(nota.invoiceNum, c.modelo, e.target.value)}
                          placeholder="0"
                          min="0"
                        />
                      </td>
                      <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                        <button className="btn-icon" title="Quitar código"
                          onClick={() => removeCode(nota.invoiceNum, c.modelo)}
                          style={{ color: 'rgba(239,68,68,0.4)', padding: 2 }}>
                          <X size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <td colSpan={2} style={{ padding: '6px 10px' }}>
                      <input
                        className="field-input"
                        style={{ fontSize: 12, width: '100%' }}
                        value={newCode[nota.invoiceNum] || ''}
                        onChange={e => setNewCode(prev => ({ ...prev, [nota.invoiceNum]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && addCode(nota.invoiceNum)}
                        placeholder="Agregar código..."
                      />
                    </td>
                    <td colSpan={2} style={{ padding: '4px 10px', textAlign: 'center' }}>
                      <button className="btn-icon" title="Agregar"
                        onClick={() => addCode(nota.invoiceNum)}
                        style={{ color: 'rgba(165,180,252,0.6)' }}>
                        <Plus size={14} />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex gap-2" style={{ marginTop: 16 }}>
              <button className="btn btn-primary" onClick={() => sendNota(nota)} disabled={filledCount === 0}>
                <Send size={14} /> Enviar a Paula
              </button>
              <button className="btn btn-secondary" onClick={() => deleteNota(nota.invoiceNum)} style={{ marginLeft: 'auto' }}>
                <Trash2 size={14} /> Eliminar
              </button>
            </div>

            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>
              Las cantidades se guardan automáticamente
            </div>
          </div>
        )
      })}
    </div>
  )
}
