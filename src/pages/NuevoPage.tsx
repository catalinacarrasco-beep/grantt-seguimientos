import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Upload, CheckCircle2, AlertCircle, Circle, Loader2, X, Download, ExternalLink, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { parseInvoice, parseDIN, crossWithBD, generateExcel, createDriveFolder, uploadToDrive, todayFormatted, type ProductRow } from '../lib/processor'

type StepState = { label: string; status: 'pending' | 'running' | 'done' | 'error'; detail?: string }

const DIN_ITEMS = ['', 'ITEM 1','ITEM 2','ITEM 3','ITEM 4','ITEM 5','ITEM 6','ITEM 7','ITEM 8','ITEM 9','ITEM 10','ITEM 11','ITEM 12']

export default function NuevoPage() {
  const navigate = useNavigate()
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [dinFile, setDinFile] = useState<File | null>(null)
  const [steps, setSteps] = useState<StepState[]>([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [rows, setRows] = useState<ProductRow[]>([])
  const [invoiceNum, setInvoiceNum] = useState('')
  const [dinNum, setDinNum] = useState('')
  const [xlsxB64, setXlsxB64] = useState('')
  const [driveLink, setDriveLink] = useState('')
  const invRef = useRef<HTMLInputElement>(null)
  const dinRef = useRef<HTMLInputElement>(null)

  const setStep = (i: number, u: Partial<StepState>) =>
    setSteps(prev => prev.map((s, j) => j === i ? { ...s, ...u } : s))

  const reset = () => {
    setSteps([]); setRunning(false); setDone(false)
    setRows([]); setInvoiceNum(''); setDinNum('')
    setXlsxB64(''); setDriveLink('')
    setInvoiceFile(null); setDinFile(null)
  }

  const process = async () => {
    if (!invoiceFile || !dinFile) return
    setRunning(true); setDone(false); setRows([])
    setSteps([
      { label: 'Leyendo Invoice — extrayendo modelos y cantidades', status: 'pending' },
      { label: 'Leyendo DIN — extrayendo número e ítems', status: 'pending' },
      { label: 'Cruzando con BD Maestra — filtrando certificables', status: 'pending' },
      { label: 'Generando Excel de solicitud', status: 'pending' },
      { label: 'Creando carpeta en Google Drive', status: 'pending' },
      { label: 'Subiendo Excel a Drive', status: 'pending' },
      { label: 'Guardando en historial', status: 'pending' },
    ])

    try {
      // 1. Parse Invoice
      setStep(0, { status: 'running' })
      const invData = await parseInvoice(invoiceFile)
      const parsedInvNum = invData.invoiceNum || ''
      const parsedTraz = invData.trazabilidad || ''
      setInvoiceNum(parsedInvNum)
      setStep(0, { status: 'done', detail: `Invoice ${parsedInvNum} · ${invData.products.length} productos` })

      // 2. Parse DIN
      setStep(1, { status: 'running' })
      const dinData = await parseDIN(dinFile)
      const parsedDinNum = dinData.dinNum || ''
      setDinNum(parsedDinNum)
      setStep(1, { status: 'done', detail: `DIN ${parsedDinNum} · ${dinData.items.length} ítems` })

      // 3. Cross with BD
      setStep(2, { status: 'running' })
      const newRows = crossWithBD(invData.products, dinData.items, parsedTraz)
      setRows(newRows)
      const missing = newRows.filter(r => !r.itemDin).length
      setStep(2, { status: 'done', detail: `${newRows.length} certificables de ${invData.products.length} totales${missing ? ` · ${missing} sin ítem DIN` : ''}` })
      if (!newRows.length) throw new Error('Ningún producto certificable encontrado en esta Invoice')

      // 4. Generate Excel
      setStep(3, { status: 'running' })
      const b64 = await generateExcel(newRows, parsedInvNum, parsedDinNum)
      setXlsxB64(b64)
      setStep(3, { status: 'done', detail: `Excel generado · ${newRows.length} filas` })

      // 5. Create Drive folder
      setStep(4, { status: 'running' })
      const { data: cfg } = await supabase.from('configuracion').select('drive_folder_id').single()
      const folderId = cfg?.drive_folder_id || ''
      const newFolderId = await createDriveFolder(parsedInvNum, folderId)
      setStep(4, { status: 'done', detail: `Carpeta "${parsedInvNum}" creada` })

      // 6. Upload Excel
      setStep(5, { status: 'running' })
      const fname = `Formato_Solicitud_Seguimiento_${parsedInvNum}.xlsx`
      const link = await uploadToDrive(b64, fname, newFolderId)
      setDriveLink(link)
      setStep(5, { status: 'done', detail: 'Subido correctamente' })

      // 7. Save to Supabase history
      setStep(6, { status: 'running' })
      const { data: { user } } = await supabase.auth.getUser()

      // Upload PDFs to Supabase Storage
      let invoicePath = '', dinPath = ''
      try {
        const invUp = await supabase.storage.from('documentos').upload(
          `${user?.id}/${parsedInvNum}/invoice_${Date.now()}.pdf`, invoiceFile, { upsert: true }
        )
        invoicePath = invUp.data?.path || ''

        const dinUp = await supabase.storage.from('documentos').upload(
          `${user?.id}/${parsedInvNum}/din_${Date.now()}.pdf`, dinFile, { upsert: true }
        )
        dinPath = dinUp.data?.path || ''
      } catch {}

      await supabase.from('seguimientos').insert({
        invoice_num: parsedInvNum,
        din_num: parsedDinNum,
        trazabilidad: parsedTraz,
        fecha_solicitud: todayFormatted(),
        productos_count: newRows.length,
        estado: 'completado',
        drive_link: link,
        invoice_path: invoicePath,
        din_path: dinPath,
        user_email: user?.email || '',
      })
      setStep(6, { status: 'done', detail: 'Guardado en historial' })

      setDone(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      setSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error', detail: msg } : s))
    } finally {
      setRunning(false)
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

  const DropZone = ({ type, file, setFile, ref: inputRef }: { type: string; file: File | null; setFile: (f: File | null) => void; ref: React.RefObject<HTMLInputElement | null> }) => {
    const [drag, setDrag] = useState(false)
    const isInv = type === 'invoice'
    return (
      <div
        className={`drop-zone${file ? ' has-file' : ''}${drag ? ' dragging' : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]) }}
        onClick={() => !file && inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".pdf" style={{ display: 'none' }}
          onChange={e => e.target.files?.[0] && setFile(e.target.files[0])} />
        <div className="dz-icon">
          {file ? <CheckCircle2 size={18} color="#4ade80" /> : <Upload size={18} color="rgba(255,255,255,0.3)" />}
        </div>
        <div className="dz-text">
          <div className="dz-label">{file ? file.name : isInv ? 'Invoice (PDF)' : 'DIN (PDF)'}</div>
          <div className="dz-hint">{file ? `${(file.size / 1024).toFixed(1)} KB · listo` : isInv ? 'Commercial Invoice del proveedor' : 'Declaración de Ingreso de Aduanas'}</div>
        </div>
        {file && <button className="btn-icon" onClick={e => { e.stopPropagation(); setFile(null) }}><X size={14} /></button>}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-title">Nuevo seguimiento</div>
      <div className="page-sub">Sube la Invoice y DIN — el resto lo hace la app automáticamente</div>

      {!running && !done && (
        <div className="card">
          <DropZone type="invoice" file={invoiceFile} setFile={setInvoiceFile} ref={invRef} />
          <DropZone type="din" file={dinFile} setFile={setDinFile} ref={dinRef} />
          <button className="btn btn-primary btn-full" style={{ marginTop: 4 }}
            disabled={!invoiceFile || !dinFile} onClick={process}>
            <Zap size={15} /> Procesar automáticamente
          </button>
        </div>
      )}

      {(running || done || steps.length > 0) && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              {running ? 'Procesando...' : done ? '¡Listo!' : 'Proceso interrumpido'}
            </div>
            {!running && (
              <button className="btn btn-secondary btn-sm" onClick={reset}>
                <RefreshCw size={12} /> Nuevo lote
              </button>
            )}
          </div>

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

          {rows.length > 0 && (
            <>
              <hr className="divider" />
              <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <span className="text-sm" style={{ fontWeight: 500 }}>{rows.length} producto{rows.length !== 1 ? 's' : ''} certificable{rows.length !== 1 ? 's' : ''}</span>
                {rows.filter(r => !r.itemDin).length > 0 && (
                  <span className="badge badge-amber">{rows.filter(r => !r.itemDin).length} sin ítem DIN</span>
                )}
              </div>
              {rows.map(r => (
                <div key={r.id} className={`prod-row${r.itemDin ? '' : ' prod-warn'}`}>
                  <span className="prod-code">{r.modelo}</span>
                  <span className="prod-name">{r.nombre}</span>
                  <span className="prod-qty">{r.cantidad.toLocaleString()}</span>
                  <select className={`din-select${r.itemDin ? '' : ' din-missing'}`} value={r.itemDin}
                    onChange={e => setRows(prev => prev.map(x => x.id === r.id ? { ...x, itemDin: e.target.value } : x))}>
                    {DIN_ITEMS.map(o => <option key={o} value={o}>{o || '— Ítem DIN —'}</option>)}
                  </select>
                </div>
              ))}
            </>
          )}

          {done && (
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
