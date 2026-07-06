import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Zap, Upload, CheckCircle2, AlertCircle, Circle, Loader2, X, Download, RefreshCw, FileSearch } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { parseInvoice, parseDIN, crossWithBD, generateExcel, todayFormatted, type ProductRow } from '../lib/processor'

type StepState = { label: string; status: 'pending' | 'running' | 'done' | 'error'; detail?: string }
type Phase = 'upload' | 'reading' | 'review' | 'generating' | 'done'

// DIN item options are built dynamically from parsed DIN data

function DropZone({ label, hint, file, onFile }: { label: string; hint: string; file: File | null; onFile: (f: File | null) => void }) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div
      className={`drop-zone${file ? ' has-file' : ''}${drag ? ' dragging' : ''}`}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]) }}
      onClick={() => !file && inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept=".pdf" style={{ display: 'none' }}
        onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
      <div className="dz-icon">
        {file ? <CheckCircle2 size={18} color="#4ade80" /> : <Upload size={18} color="rgba(255,255,255,0.3)" />}
      </div>
      <div className="dz-text">
        <div className="dz-label">{file ? file.name : label}</div>
        <div className="dz-hint">{file ? `${(file.size / 1024).toFixed(1)} KB · listo` : hint}</div>
      </div>
      {file && <button className="btn-icon" onClick={e => { e.stopPropagation(); onFile(null) }}><X size={14} /></button>}
    </div>
  )
}

export default function NuevoPage() {
  const navigate = useNavigate()
  const location = useLocation()
  // Data pre-filled from Control de Calidad module
  const fromCalidad = location.state?.fromCalidad as { invoiceNum: string; trazabilidad: string; products: { modelo: string; cantidad: number }[] } | null

  const [phase, setPhase] = useState<Phase>('upload')
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [dinFile, setDinFile] = useState<File | null>(null)

  const [readSteps, setReadSteps] = useState<StepState[]>([])
  const [reading, setReading] = useState(false)

  const [rows, setRows] = useState<ProductRow[]>([])
  const [invoiceNum, setInvoiceNum] = useState(fromCalidad?.invoiceNum || '')
  const [dinNum, setDinNum] = useState('')
  const [dinItemOptions, setDinItemOptions] = useState<string[]>([''])

  const [genSteps, setGenSteps] = useState<StepState[]>([])
  const [generating, setGenerating] = useState(false)
  const [xlsxB64, setXlsxB64] = useState('')

  const setReadStep = (i: number, u: Partial<StepState>) =>
    setReadSteps(prev => prev.map((s, j) => j === i ? { ...s, ...u } : s))

  const setGenStep = (i: number, u: Partial<StepState>) =>
    setGenSteps(prev => prev.map((s, j) => j === i ? { ...s, ...u } : s))

  const reset = () => {
    setPhase('upload'); setReading(false); setGenerating(false)
    setReadSteps([]); setGenSteps([])
    setRows([]); setInvoiceNum(fromCalidad?.invoiceNum || ''); setDinNum(''); setDinItemOptions([''])
    setXlsxB64('')
    setInvoiceFile(null); setDinFile(null)
  }

  // Enter key shortcut: trigger "Leer documentos" when files are ready
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || phase !== 'upload' || reading) return
      if ((!invoiceFile && !fromCalidad) || !dinFile) return
      readDocs()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, reading, invoiceFile, dinFile])

  const readDocs = async () => {
    if ((!invoiceFile && !fromCalidad) || !dinFile) return
    setReading(true)
    setPhase('reading')

    const initialSteps: StepState[] = fromCalidad
      ? [
          { label: `Invoice ${fromCalidad.invoiceNum} — pre-cargada desde Control de Calidad`, status: 'done', detail: `${fromCalidad.products.length} productos` },
          { label: 'Leyendo DIN — extrayendo número e ítems', status: 'pending' },
          { label: 'Cruzando con BD Maestra — filtrando certificables', status: 'pending' },
        ]
      : [
          { label: 'Leyendo Invoice — extrayendo modelos y cantidades', status: 'pending' },
          { label: 'Leyendo DIN — extrayendo número e ítems', status: 'pending' },
          { label: 'Cruzando con BD Maestra — filtrando certificables', status: 'pending' },
        ]
    setReadSteps(initialSteps)

    try {
      let parsedInvNum: string
      let parsedTraz: string
      let invProducts: { modelo: string; cantidad: number }[]

      if (fromCalidad) {
        parsedInvNum = fromCalidad.invoiceNum
        parsedTraz = fromCalidad.trazabilidad
        invProducts = fromCalidad.products
        setInvoiceNum(parsedInvNum)
      } else {
        setReadStep(0, { status: 'running' })
        const invData = await parseInvoice(invoiceFile!)
        parsedInvNum = invData.invoiceNum || ''
        parsedTraz = invData.trazabilidad || ''
        invProducts = invData.products
        setInvoiceNum(parsedInvNum)
        setReadStep(0, { status: 'done', detail: `Invoice ${parsedInvNum} · ${invProducts.length} productos` })
      }

      setReadStep(1, { status: 'running' })
      const dinData = await parseDIN(dinFile)
      const parsedDinNum = dinData.dinNum || ''
      setDinNum(parsedDinNum)
      setDinItemOptions(['', ...dinData.items.map(i => `ITEM ${i.itemNum}`)])
      const dinDetail = dinData.items.length
        ? `DIN ${parsedDinNum} · ${dinData.items.length} ítems: ${dinData.items.map(i => `ITEM ${i.itemNum}=${i.quantity}`).join(', ')}`
        : `DIN ${parsedDinNum} · 0 ítems extraídos`
      setReadStep(1, { status: 'done', detail: dinDetail })

      setReadStep(2, { status: 'running' })
      const newRows = crossWithBD(invProducts, dinData.items, parsedTraz)
      setRows(newRows)
      const missing = newRows.filter(r => !r.itemDin).length
      setReadStep(2, { status: 'done', detail: `${newRows.length} certificables de ${invProducts.length} totales${missing ? ` · ${missing} sin ítem DIN` : ''}` })
      if (!newRows.length) throw new Error('Ningún producto certificable encontrado')

      setPhase('review')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      setReadSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error', detail: msg } : s))
    } finally {
      setReading(false)
    }
  }

  const generate = async () => {
    setGenerating(true)
    setPhase('generating')
    setGenSteps([
      { label: 'Generando Excel de solicitud', status: 'pending' },
      { label: 'Guardando en historial', status: 'pending' },
    ])

    try {
      setGenStep(0, { status: 'running' })
      const b64 = await generateExcel(rows, invoiceNum, dinNum)
      setXlsxB64(b64)
      setGenStep(0, { status: 'done', detail: `${rows.length} filas generadas` })

      setGenStep(1, { status: 'running' })
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('seguimientos').insert({
        invoice_num: invoiceNum, din_num: dinNum,
        trazabilidad: rows[0]?.trazabilidad || '',
        fecha_solicitud: todayFormatted(),
        productos_count: rows.length, estado: 'completado',
        user_email: user?.email || '',
      })
      setGenStep(1, { status: 'done', detail: 'Guardado en historial' })
      setPhase('done')

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      setGenSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error', detail: msg } : s))
    } finally {
      setGenerating(false)
    }
  }

  const downloadXlsx = () => {
    if (!xlsxB64) return
    const bytes = atob(xlsxB64)
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })),
      download: `Formato_Solicitud_Seguimiento_${invoiceNum}.xlsx`,
    })
    a.click()
  }

  const StepList = ({ steps }: { steps: StepState[] }) => (
    <div className="steps">
      {steps.map((s, i) => (
        <div key={i} className={`step-row step-${s.status}`}>
          <div style={{ flexShrink: 0, marginTop: 1 }}>
            {s.status === 'done' && <CheckCircle2 size={16} color="#4ade80" />}
            {s.status === 'running' && <Loader2 size={16} color="#818cf8" className="spin" />}
            {s.status === 'error' && <AlertCircle size={16} color="#f87171" />}
            {s.status === 'pending' && <Circle size={16} color="rgba(255,255,255,0.2)" />}
          </div>
          <div>
            <div className="step-label">{s.label}</div>
            {s.detail && <div className="step-detail">{s.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="page">
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <div>
          <div className="page-title">Solicitud de seguimiento</div>
          <div className="page-sub" style={{ marginBottom: 0 }}>
            {phase === 'upload' && 'Sube la Invoice y DIN para comenzar'}
            {phase === 'reading' && 'Leyendo documentos...'}
            {phase === 'review' && 'Revisa los productos antes de generar'}
            {phase === 'generating' && 'Generando Excel...'}
            {phase === 'done' && '¡Proceso completado!'}
          </div>
        </div>
        {phase !== 'upload' && (
          <button className="btn btn-secondary btn-sm" onClick={() => { if (window.confirm('¿Comenzar un nuevo lote? Se perderán los datos actuales.')) reset() }}>
            <RefreshCw size={12} /> Nuevo lote
          </button>
        )}
      </div>

      {/* Progress indicator */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center' }}>
        {[
          { key: 'upload', label: '1. Subir' },
          { key: 'review', label: '2. Revisar' },
          { key: 'done', label: '3. Listo' },
        ].map((step, i) => {
          const isActive = phase === step.key || (step.key === 'upload' && phase === 'reading') || (step.key === 'review' && phase === 'generating')
          const isDone = (step.key === 'upload' && ['review','generating','done'].includes(phase)) ||
                        (step.key === 'review' && ['done'].includes(phase))
          return (
            <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {i > 0 && <div style={{ width: 32, height: 1, background: isDone ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.1)' }} />}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                background: isDone ? 'rgba(74,222,128,0.15)' : isActive ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                color: isDone ? '#4ade80' : isActive ? '#a5b4fc' : 'rgba(255,255,255,0.3)',
                border: `1px solid ${isDone ? 'rgba(74,222,128,0.3)' : isActive ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)'}`,
              }}>
                {isDone ? <CheckCircle2 size={12} /> : null}
                {step.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* FASE 1: Upload */}
      {(phase === 'upload' || phase === 'reading') && (
        <div className="card">
          {/* Banner when coming from Calidad */}
          {fromCalidad && (
            <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={14} />
              Invoice pre-cargada desde Control de Calidad · <strong>{fromCalidad.invoiceNum}</strong> · {fromCalidad.products.length} productos
            </div>
          )}

          {/* Invoice upload: optional if fromCalidad, required otherwise */}
          {!fromCalidad && (
            <DropZone label="Invoice (PDF)" hint="Commercial Invoice del proveedor" file={invoiceFile} onFile={setInvoiceFile} />
          )}
          <DropZone label="DIN (PDF)" hint="Declaración de Ingreso de Aduanas" file={dinFile} onFile={setDinFile} />

          {readSteps.length === 0 ? (
            <button className="btn btn-primary btn-full" style={{ marginTop: 4 }}
              disabled={(!invoiceFile && !fromCalidad) || !dinFile || reading} onClick={readDocs}>
              <FileSearch size={15} /> Leer documentos
            </button>
          ) : (
            <div style={{ marginTop: 12 }}>
              <StepList steps={readSteps} />
              {readSteps.some(s => s.status === 'error') && (
                <button className="btn btn-secondary btn-full" style={{ marginTop: 10 }}
                  onClick={() => setReadSteps([])}>
                  <RefreshCw size={13} /> Reintentar
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* FASE 2: Review */}
      {(phase === 'review' || phase === 'generating' || phase === 'done') && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">{rows.length} producto{rows.length !== 1 ? 's' : ''} certificables</div>
              <div className="text-xs text-muted">Invoice {invoiceNum} · DIN {dinNum}</div>
            </div>
            {rows.filter(r => !r.itemDin).length > 0 && (
              <span className="badge badge-amber">{rows.filter(r => !r.itemDin).length} sin ítem DIN</span>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            {rows.map(r => (
              <div key={r.id} className={`prod-row${r.itemDin ? '' : ' prod-warn'}`}>
                <span className="prod-code">{r.modelo}</span>
                <span className="prod-name">{r.nombre}</span>
                <span className="prod-qty">{r.cantidad.toLocaleString()}</span>
                <select
                  className={`din-select${r.itemDin ? '' : ' din-missing'}`}
                  value={r.itemDin}
                  disabled={phase === 'generating' || phase === 'done'}
                  onChange={e => setRows(prev => prev.map(x => x.id === r.id ? { ...x, itemDin: e.target.value } : x))}>
                  {dinItemOptions.map(o => <option key={o} value={o}>{o || '— Ítem DIN —'}</option>)}
                </select>
              </div>
            ))}
          </div>

          {phase === 'review' && (
            <button className="btn btn-primary btn-full" onClick={generate}>
              <Download size={15} /> Generar Excel
            </button>
          )}

          {(phase === 'generating' || phase === 'done') && genSteps.length > 0 && (
            <StepList steps={genSteps} />
          )}

          {phase === 'done' && (
            <>
              <hr className="divider" />
              <div className="summary-grid">
                <div className="summary-card"><div className="summary-label">Invoice</div><div className="summary-val sm">{invoiceNum}</div></div>
                <div className="summary-card"><div className="summary-label">DIN</div><div className="summary-val sm">{dinNum}</div></div>
                <div className="summary-card"><div className="summary-label">Certificables</div><div className="summary-val green">{rows.length}</div></div>
              </div>
              <div className="flex gap-2">
                {xlsxB64 && <button className="btn btn-primary" onClick={downloadXlsx}><Download size={14} /> Descargar Excel</button>}
                <button className="btn btn-secondary" onClick={() => navigate('/historial')} style={{ marginLeft: 'auto' }}>Ver historial →</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
