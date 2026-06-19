import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Upload, CheckCircle2, AlertCircle, Circle, Loader2, X, Download, ExternalLink, RefreshCw, FileSearch, FolderUp, FolderOpen } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { parseInvoice, parseDIN, crossWithBD, generateExcel, createDriveFolder, uploadFileToDrive, todayFormatted, toBase64, type ProductRow } from '../lib/processor'

type StepState = { label: string; status: 'pending' | 'running' | 'done' | 'error'; detail?: string }
type Phase = 'upload' | 'reading' | 'review' | 'generating' | 'done'

const DIN_ITEMS = ['', 'ITEM 1','ITEM 2','ITEM 3','ITEM 4','ITEM 5','ITEM 6','ITEM 7','ITEM 8','ITEM 9','ITEM 10','ITEM 11','ITEM 12']

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
  const [phase, setPhase] = useState<Phase>('upload')
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [dinFile, setDinFile] = useState<File | null>(null)

  // Phase 1 state
  const [readSteps, setReadSteps] = useState<StepState[]>([])
  const [reading, setReading] = useState(false)

  // Phase 2 state
  const [rows, setRows] = useState<ProductRow[]>([])
  const [invoiceNum, setInvoiceNum] = useState('')
  const [dinNum, setDinNum] = useState('')

  // Phase 3 state
  const [genSteps, setGenSteps] = useState<StepState[]>([])
  const [generating, setGenerating] = useState(false)
  const [xlsxB64, setXlsxB64] = useState('')
  const [driveLink, setDriveLink] = useState('')
  const [targetFolderId, setTargetFolderId] = useState('')

  const setReadStep = (i: number, u: Partial<StepState>) =>
    setReadSteps(prev => prev.map((s, j) => j === i ? { ...s, ...u } : s))

  const setGenStep = (i: number, u: Partial<StepState>) =>
    setGenSteps(prev => prev.map((s, j) => j === i ? { ...s, ...u } : s))

  const reset = () => {
    setPhase('upload'); setReading(false); setGenerating(false)
    setReadSteps([]); setGenSteps([])
    setRows([]); setInvoiceNum(''); setDinNum('')
    setXlsxB64(''); setDriveLink(''); setTargetFolderId('')
    setInvoiceFile(null); setDinFile(null)
  }

  // PASO 1: Leer documentos
  const readDocs = async () => {
    if (!invoiceFile || !dinFile) return
    setReading(true)
    setPhase('reading')
    setReadSteps([
      { label: 'Leyendo Invoice — extrayendo modelos y cantidades', status: 'pending' },
      { label: 'Leyendo DIN — extrayendo número e ítems', status: 'pending' },
      { label: 'Cruzando con BD Maestra — filtrando certificables', status: 'pending' },
    ])

    try {
      setReadStep(0, { status: 'running' })
      const invData = await parseInvoice(invoiceFile)
      const parsedInvNum = invData.invoiceNum || ''
      const parsedTraz = invData.trazabilidad || ''
      setInvoiceNum(parsedInvNum)
      setReadStep(0, { status: 'done', detail: `Invoice ${parsedInvNum} · ${invData.products.length} productos` })

      setReadStep(1, { status: 'running' })
      const dinData = await parseDIN(dinFile)
      const parsedDinNum = dinData.dinNum || ''
      setDinNum(parsedDinNum)
      setReadStep(1, { status: 'done', detail: `DIN ${parsedDinNum} · ${dinData.items.length} ítems` })

      setReadStep(2, { status: 'running' })
      const newRows = crossWithBD(invData.products, dinData.items, parsedTraz)
      setRows(newRows)
      const missing = newRows.filter(r => !r.itemDin).length
      setReadStep(2, { status: 'done', detail: `${newRows.length} certificables de ${invData.products.length} totales${missing ? ` · ${missing} sin ítem DIN` : ''}` })
      if (!newRows.length) throw new Error('Ningún producto certificable encontrado')

      setPhase('review')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      setReadSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error', detail: msg } : s))
    } finally {
      setReading(false)
    }
  }

  // PASO 2: Generar y subir
  const generate = async () => {
    setGenerating(true)
    setPhase('generating')
    setGenSteps([
      { label: 'Generando Excel de solicitud', status: 'pending' },
      { label: 'Preparando carpeta en Google Drive', status: 'pending' },
      { label: 'Subiendo Excel a Drive', status: 'pending' },
      { label: 'Subiendo Invoice PDF a Drive', status: 'pending' },
      { label: 'Subiendo DIN PDF a Drive', status: 'pending' },
      { label: 'Guardando en historial', status: 'pending' },
    ])

    try {
      setGenStep(0, { status: 'running' })
      const b64 = await generateExcel(rows, invoiceNum, dinNum)
      setXlsxB64(b64)
      setGenStep(0, { status: 'done', detail: `${rows.length} filas generadas` })

      setGenStep(1, { status: 'running' })
      // Use the folder ID entered by user in the form
      const newFolderId = targetFolderId.trim()
      setGenStep(1, { status: 'done', detail: newFolderId ? `Usando carpeta Drive configurada` : `Sin carpeta — subiendo a raíz` })

      setGenStep(2, { status: 'running' })
      const fname = `Formato_Solicitud_Seguimiento_${invoiceNum}.xlsx`
      const excelLink = await uploadFileToDrive(b64, fname, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', newFolderId)
      setDriveLink(excelLink)
      setGenStep(2, { status: 'done', detail: 'Excel subido' })

      setGenStep(3, { status: 'running' })
      if (invoiceFile) {
        const invB64 = await toBase64(invoiceFile)
        await uploadFileToDrive(invB64, invoiceFile.name, 'application/pdf', newFolderId)
      }
      setGenStep(3, { status: 'done', detail: 'Invoice subida' })

      setGenStep(4, { status: 'running' })
      if (dinFile) {
        const dinB64 = await toBase64(dinFile)
        await uploadFileToDrive(dinB64, dinFile.name, 'application/pdf', newFolderId)
      }
      setGenStep(4, { status: 'done', detail: 'DIN subida' })

      setGenStep(5, { status: 'running' })
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('seguimientos').insert({
        invoice_num: invoiceNum, din_num: dinNum,
        trazabilidad: rows[0]?.trazabilidad || '',
        fecha_solicitud: todayFormatted(),
        productos_count: rows.length, estado: 'completado',
        drive_link: excelLink, invoice_path: newFolderId,
        din_path: newFolderId, user_email: user?.email || '',
      })
      setGenStep(5, { status: 'done', detail: 'Guardado en historial' })
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
          <div className="page-title">Nuevo seguimiento</div>
          <div className="page-sub" style={{ marginBottom: 0 }}>
            {phase === 'upload' && 'Sube la Invoice y DIN para comenzar'}
            {phase === 'reading' && 'Leyendo documentos...'}
            {phase === 'review' && 'Revisa los productos antes de generar'}
            {phase === 'generating' && 'Generando y subiendo a Drive...'}
            {phase === 'done' && '¡Proceso completado!'}
          </div>
        </div>
        {phase !== 'upload' && (
          <button className="btn btn-secondary btn-sm" onClick={reset}>
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
          <DropZone label="Invoice (PDF)" hint="Commercial Invoice del proveedor" file={invoiceFile} onFile={setInvoiceFile} />
          <DropZone label="DIN (PDF)" hint="Declaración de Ingreso de Aduanas" file={dinFile} onFile={setDinFile} />

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <FolderOpen size={11} /> ID carpeta de destino en Google Drive
            </label>
            <input
              className="field-input"
              value={targetFolderId}
              onChange={e => setTargetFolderId(e.target.value)}
              placeholder="Pega el ID de la carpeta donde se guardarán los archivos"
              style={{ fontSize: 12 }}
            />
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>
              drive.google.com/drive/folders/<span style={{ color: 'rgba(99,102,241,0.6)' }}>ESTE_ES_EL_ID</span>
            </div>
          </div>

          {readSteps.length === 0 ? (
            <button className="btn btn-primary btn-full" style={{ marginTop: 4 }}
              disabled={!invoiceFile || !dinFile || reading} onClick={readDocs}>
              <FileSearch size={15} /> Leer documentos
            </button>
          ) : (
            <div style={{ marginTop: 12 }}>
              <StepList steps={readSteps} />
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
                  {DIN_ITEMS.map(o => <option key={o} value={o}>{o || '— Ítem DIN —'}</option>)}
                </select>
              </div>
            ))}
          </div>

          {phase === 'review' && (
            <button className="btn btn-primary btn-full" onClick={generate}>
              <FolderUp size={15} /> Generar Excel y subir a Drive
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
                {xlsxB64 && <button className="btn btn-secondary" onClick={downloadXlsx}><Download size={14} /> Descargar Excel</button>}
                {driveLink && <button className="btn btn-success" onClick={() => window.open(driveLink, '_blank')}><ExternalLink size={14} /> Abrir en Drive</button>}
                <button className="btn btn-secondary" onClick={() => navigate('/historial')} style={{ marginLeft: 'auto' }}>Ver historial →</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
