import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, CheckCircle2, AlertCircle, Circle, Loader2, X, RefreshCw, FileSearch, Ruler, Plus, Trash2, Download, Camera, Image as ImageIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { parseInvoice, todayFormatted } from '../lib/processor'
import { findCanaletaCandidates, evaluarEspesor, veredictoSugerido, CHECKLIST_DEFAULT, type CanaletaCandidate } from '../lib/canaletas'

type Phase = 'upload' | 'reading' | 'seleccion' | 'control' | 'veredicto' | 'done'
type StepState = { label: string; status: 'pending' | 'running' | 'done' | 'error'; detail?: string }

type ChecklistItem = { item: string; ok: boolean | null; nota: string }
type FotoRef = { driveId: string; name: string; webViewLink?: string }
type ProductoControl = {
  modelo: string
  nombre: string
  cantidad: number
  muestras: number
  espesor: {
    declarado: string   // input controlado en string; convierto al calcular
    tolerancia: string
    tipoTol: 'mm' | 'pct'
    unidad: string
    mediciones: string[]
  }
  resistencia: {
    deformacion: boolean
    descripcion: string
    resultado: 'cumple' | 'no_cumple' | 'pendiente'
  }
  otras: {
    checklist: ChecklistItem[]
    libre: string
  }
  observaciones: string
  fotos: FotoRef[]
}

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

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = e => res(String(e.target?.result || '').split(',')[1])
    r.onerror = rej
    r.readAsDataURL(file)
  })
}

export default function CanaletasPage() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('upload')

  // Paso 1
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [invoiceNum, setInvoiceNum] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [dinNum, setDinNum] = useState('')
  const [fechaLlegada, setFechaLlegada] = useState('')
  const [driveFolderId, setDriveFolderId] = useState('')
  const [reading, setReading] = useState(false)
  const [readSteps, setReadSteps] = useState<StepState[]>([])
  const [candidatos, setCandidatos] = useState<CanaletaCandidate[]>([])
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())

  // Paso 2 (control por producto)
  const [productos, setProductos] = useState<ProductoControl[]>([])
  const [uploading, setUploading] = useState<Record<string, boolean>>({})

  // Paso 3
  const [veredicto, setVeredicto] = useState<'aprobado' | 'observaciones' | 'rechazado' | ''>('')
  const [accionTomada, setAccionTomada] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedId, setSavedId] = useState<string | null>(null)
  const [informeUrl, setInformeUrl] = useState<string | null>(null)

  const setReadStep = (i: number, u: Partial<StepState>) =>
    setReadSteps(prev => prev.map((s, j) => j === i ? { ...s, ...u } : s))

  const reset = () => {
    setPhase('upload'); setInvoiceFile(null); setInvoiceNum(''); setProveedor(''); setDinNum(''); setFechaLlegada(''); setDriveFolderId('')
    setReadSteps([]); setCandidatos([]); setSeleccionados(new Set()); setProductos([])
    setVeredicto(''); setAccionTomada(''); setSaveError(''); setSavedId(null); setInformeUrl(null)
  }

  // ── Paso 1 → Paso "seleccion" ──────────────────────────────────────────
  const leerInvoice = async () => {
    if (!invoiceFile) return
    setReading(true); setPhase('reading')
    setReadSteps([
      { label: 'Leyendo Invoice — extrayendo códigos y descripciones', status: 'running' },
      { label: 'Detectando canaletas (no certificables)', status: 'pending' },
    ])
    try {
      const inv = await parseInvoice(invoiceFile)
      if (!invoiceNum && inv.invoiceNum) setInvoiceNum(inv.invoiceNum)
      setReadStep(0, { status: 'done', detail: `${inv.products?.length || 0} productos` })
      setReadStep(1, { status: 'running' })
      // parseInvoice actual devuelve products sin "nombre" — vamos a intentar mejorarlo:
      // usamos lo que trae; si nombre falta, mostramos el código y el usuario decide.
      const productsWithName = (inv.products || []).map((p: any) => ({
        modelo: p.modelo, altCode: p.altCode, cantidad: p.cantidad, nombre: p.nombre || p.description || '',
      }))
      const cand = findCanaletaCandidates(productsWithName)
      setCandidatos(cand)
      setSeleccionados(new Set(cand.filter(c => c.probablemente).map(c => c.modelo)))
      setReadStep(1, { status: 'done', detail: `${cand.length} candidatos, ${cand.filter(c => c.probablemente).length} pre-marcados` })
      setPhase('seleccion')
    } catch (e: any) {
      setReadSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error', detail: e?.message || 'Error' } : s))
    } finally { setReading(false) }
  }

  const toggleCandidato = (modelo: string) => {
    setSeleccionados(prev => {
      const n = new Set(prev)
      if (n.has(modelo)) n.delete(modelo); else n.add(modelo)
      return n
    })
  }

  const irAControl = () => {
    const seleccion = candidatos.filter(c => seleccionados.has(c.modelo))
    if (!seleccion.length) return
    const prods: ProductoControl[] = seleccion.map(c => ({
      modelo: c.modelo,
      nombre: c.nombre,
      cantidad: c.cantidad,
      muestras: 5,
      espesor: { declarado: '', tolerancia: '', tipoTol: 'mm', unidad: 'mm', mediciones: [''] },
      resistencia: { deformacion: false, descripcion: '', resultado: 'pendiente' },
      otras: {
        checklist: CHECKLIST_DEFAULT.map(item => ({ item, ok: null, nota: '' })),
        libre: '',
      },
      observaciones: '',
      fotos: [],
    }))
    setProductos(prods)
    setPhase('control')
  }

  // ── Paso 2 — helpers ─────────────────────────────────────────────────────
  const updateProducto = (idx: number, patch: Partial<ProductoControl>) =>
    setProductos(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p))
  const updateEspesor = (idx: number, patch: Partial<ProductoControl['espesor']>) =>
    setProductos(prev => prev.map((p, i) => i === idx ? { ...p, espesor: { ...p.espesor, ...patch } } : p))
  const updateResistencia = (idx: number, patch: Partial<ProductoControl['resistencia']>) =>
    setProductos(prev => prev.map((p, i) => i === idx ? { ...p, resistencia: { ...p.resistencia, ...patch } } : p))
  const updateOtras = (idx: number, patch: Partial<ProductoControl['otras']>) =>
    setProductos(prev => prev.map((p, i) => i === idx ? { ...p, otras: { ...p.otras, ...patch } } : p))

  const addMedicion = (idx: number) => updateEspesor(idx, { mediciones: [...productos[idx].espesor.mediciones, ''] })
  const setMedicion = (idx: number, mi: number, v: string) => {
    const arr = [...productos[idx].espesor.mediciones]; arr[mi] = v
    updateEspesor(idx, { mediciones: arr })
  }
  const delMedicion = (idx: number, mi: number) => {
    const arr = productos[idx].espesor.mediciones.filter((_, j) => j !== mi)
    updateEspesor(idx, { mediciones: arr.length ? arr : [''] })
  }

  const addChecklistItem = (idx: number) => updateOtras(idx, {
    checklist: [...productos[idx].otras.checklist, { item: '', ok: null, nota: '' }]
  })
  const setChecklist = (idx: number, ci: number, patch: Partial<ChecklistItem>) => {
    const arr = productos[idx].otras.checklist.map((c, j) => j === ci ? { ...c, ...patch } : c)
    updateOtras(idx, { checklist: arr })
  }
  const delChecklist = (idx: number, ci: number) => {
    updateOtras(idx, { checklist: productos[idx].otras.checklist.filter((_, j) => j !== ci) })
  }

  // Calcula veredicto de espesor a partir del input actual
  const espesorResult = (p: ProductoControl) => evaluarEspesor({
    declarado: parseFloat(p.espesor.declarado),
    tolerancia: parseFloat(p.espesor.tolerancia),
    tipoTol: p.espesor.tipoTol,
    mediciones: p.espesor.mediciones.map(m => parseFloat(m)).filter(m => Number.isFinite(m)),
  })

  const subirFoto = async (idx: number, file: File) => {
    if (!driveFolderId) { alert('Falta ID de carpeta Drive del embarque'); return }
    setUploading(u => ({ ...u, [`${idx}-${file.name}`]: true }))
    try {
      const b64 = await fileToBase64(file)
      const res = await fetch('/api/drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload_file', params: { name: `${productos[idx].modelo}_${Date.now()}_${file.name}`, base64: b64, mimeType: file.type || 'image/jpeg', parentId: driveFolderId } }),
      })
      if (!res.ok) throw new Error('Error subiendo foto')
      const j = await res.json()
      updateProducto(idx, { fotos: [...productos[idx].fotos, { driveId: j.id, name: file.name, webViewLink: j.webViewLink }] })
    } catch (e: any) {
      alert('No se pudo subir la foto: ' + (e?.message || 'error'))
    } finally {
      setUploading(u => { const n = { ...u }; delete n[`${idx}-${file.name}`]; return n })
    }
  }

  const delFoto = (idx: number, fi: number) =>
    updateProducto(idx, { fotos: productos[idx].fotos.filter((_, j) => j !== fi) })

  // ── Paso 3 — guardar ────────────────────────────────────────────────────
  const irAVeredicto = () => {
    // Materializar resultados de espesor antes de sugerir veredicto
    const withResults = productos.map(p => {
      const r = espesorResult(p)
      return { ...p, _espesorCalc: r } as ProductoControl & { _espesorCalc: ReturnType<typeof espesorResult> }
    })
    const sug = veredictoSugerido(withResults.map(p => ({
      modelo: p.modelo, nombre: p.nombre,
      espesor: { ...p._espesorCalc },
      resistencia: { resultado: p.resistencia.resultado },
      otras: p.otras,
      observaciones: p.observaciones,
    })))
    setVeredicto(sug)
    setPhase('veredicto')
  }

  const guardar = async () => {
    if (!veredicto) { setSaveError('Elegí un veredicto'); return }
    if (veredicto !== 'aprobado' && !accionTomada.trim()) { setSaveError('Indicá la acción tomada'); return }
    setSaving(true); setSaveError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      // Serializar productos con resultados calculados
      const productosOut = productos.map(p => {
        const r = espesorResult(p)
        return {
          modelo: p.modelo, nombre: p.nombre, cantidad: p.cantidad, muestras: p.muestras,
          espesor: {
            declarado: parseFloat(p.espesor.declarado) || null,
            tolerancia: parseFloat(p.espesor.tolerancia) || null,
            tipoTol: p.espesor.tipoTol, unidad: p.espesor.unidad,
            mediciones: p.espesor.mediciones.map(m => parseFloat(m)).filter(Number.isFinite),
            avg: r.avg, min: r.min, max: r.max, veredicto: r.veredicto,
          },
          resistencia: p.resistencia,
          otras: p.otras,
          observaciones: p.observaciones,
          fotos: p.fotos,
        }
      })

      // 1) Guardar en Supabase
      const row = {
        invoice_num: invoiceNum || '(sin invoice)',
        proveedor: proveedor || null,
        din_num: dinNum || null,
        fecha_llegada: fechaLlegada || null,
        drive_folder_id: driveFolderId || null,
        productos: productosOut,
        veredicto,
        accion_tomada: veredicto === 'aprobado' ? null : accionTomada.trim(),
        user_email: user?.email || '',
      }
      const { data: ins, error } = await supabase.from('controles_canaletas').insert(row).select('id').single()
      if (error) throw new Error(error.message)
      const id = ins.id
      setSavedId(id)

      // 2) Generar informe Excel
      const genRes = await fetch('/api/generate-canaletas-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id, invoiceNum: row.invoice_num, proveedor: row.proveedor, dinNum: row.din_num,
          fechaLlegada: row.fecha_llegada, fechaControl: todayFormatted(),
          productos: productosOut, veredicto, accionTomada: row.accion_tomada, userEmail: user?.email,
        }),
      })
      if (!genRes.ok) throw new Error('Error generando informe')
      const { base64 } = await genRes.json()

      // 3) Subir informe a Drive (si hay carpeta)
      let driveInforme: { id?: string; webViewLink?: string } = {}
      if (driveFolderId) {
        const nombre = `Control_Canaletas_${row.invoice_num}_${todayFormatted().replace(/\//g, '-')}.xlsx`
        const dr = await fetch('/api/drive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'upload_file', params: { name: nombre, base64, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', parentId: driveFolderId } }),
        })
        if (dr.ok) {
          driveInforme = await dr.json()
          await supabase.from('controles_canaletas').update({
            informe_drive_id: driveInforme.id, informe_nombre: nombre, informe_view_link: driveInforme.webViewLink,
          }).eq('id', id)
          setInformeUrl(driveInforme.webViewLink || null)
        }
      }

      // 4) Download local del informe
      const bytes = atob(base64)
      const arr = new Uint8Array(bytes.length)
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })),
        download: `Control_Canaletas_${row.invoice_num}.xlsx`,
      })
      a.click()

      setPhase('done')
    } catch (e: any) {
      setSaveError(e?.message || 'Error guardando')
    } finally { setSaving(false) }
  }

  // ── Render helpers ──────────────────────────────────────────────────────
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

  const stepPill = (key: string, label: string) => {
    const map: Record<string, boolean> = {
      subir: ['upload', 'reading', 'seleccion'].includes(phase),
      control: phase === 'control',
      cierre: phase === 'veredicto' || phase === 'done',
    }
    const done: Record<string, boolean> = {
      subir: ['control', 'veredicto', 'done'].includes(phase),
      control: ['veredicto', 'done'].includes(phase),
      cierre: phase === 'done',
    }
    const active = map[key]; const isDone = done[key]
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
          background: isDone ? 'rgba(74,222,128,0.15)' : active ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
          color: isDone ? '#4ade80' : active ? '#a5b4fc' : 'rgba(255,255,255,0.3)',
          border: `1px solid ${isDone ? 'rgba(74,222,128,0.3)' : active ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)'}`,
        }}>
          {isDone ? <CheckCircle2 size={12} /> : null}
          {label}
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <div>
          <div className="page-title">Control de calidad — Lote de canaletas</div>
          <div className="page-sub" style={{ marginBottom: 0 }}>
            {phase === 'upload' && 'Sube la Invoice para identificar el lote'}
            {phase === 'reading' && 'Leyendo Invoice...'}
            {phase === 'seleccion' && 'Marcá los modelos de canaleta del lote que vas a controlar'}
            {phase === 'control' && 'Registrá el muestreo aleatorio por modelo del lote'}
            {phase === 'veredicto' && 'Confirmá el veredicto del lote'}
            {phase === 'done' && '¡Control registrado!'}
          </div>
        </div>
        {phase !== 'upload' && (
          <button className="btn btn-secondary btn-sm" onClick={() => { if (window.confirm('¿Comenzar un nuevo control? Se perderán los datos actuales.')) reset() }}>
            <RefreshCw size={12} /> Nuevo control
          </button>
        )}
      </div>

      {/* Progress */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center' }}>
        {stepPill('subir', '1. Subir')}
        <div style={{ width: 32, height: 1, background: 'rgba(255,255,255,0.1)' }} />
        {stepPill('control', '2. Control')}
        <div style={{ width: 32, height: 1, background: 'rgba(255,255,255,0.1)' }} />
        {stepPill('cierre', '3. Cierre')}
      </div>

      {/* ── FASE 1: Upload ── */}
      {(phase === 'upload' || phase === 'reading') && (
        <div className="card">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>N° Invoice</label>
              <input className="input" value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} placeholder="Se autocompleta al leer" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Proveedor</label>
              <input className="input" value={proveedor} onChange={e => setProveedor(e.target.value)} placeholder="Ej: Línea Primmus" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>N° DIN (opcional)</label>
              <input className="input" value={dinNum} onChange={e => setDinNum(e.target.value)} placeholder="Ej: 3630760771-3" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Fecha de llegada</label>
              <input className="input" type="date" value={fechaLlegada} onChange={e => setFechaLlegada(e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>ID de carpeta Drive del embarque</label>
              <input className="input" value={driveFolderId} onChange={e => setDriveFolderId(e.target.value)} placeholder="Pegá el ID de la carpeta" />
            </div>
          </div>

          <DropZone label="Invoice (PDF)" hint="Commercial Invoice del proveedor" file={invoiceFile} onFile={setInvoiceFile} />

          {readSteps.length === 0 ? (
            <button className="btn btn-primary btn-full" style={{ marginTop: 12 }}
              disabled={!invoiceFile || reading} onClick={leerInvoice}>
              <FileSearch size={15} /> Leer Invoice
            </button>
          ) : (
            <div style={{ marginTop: 12 }}>
              <StepList steps={readSteps} />
              {readSteps.some(s => s.status === 'error') && (
                <button className="btn btn-secondary btn-full" style={{ marginTop: 10 }} onClick={() => setReadSteps([])}>
                  <RefreshCw size={13} /> Reintentar
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── FASE selección ── */}
      {phase === 'seleccion' && (
        <div className="card">
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>
            {candidatos.length} modelos no-certificables en el lote. Los <strong style={{ color: '#a5b4fc' }}>pre-marcados</strong> parecen canaletas por descripción. Ajustá si querés.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {candidatos.map(c => {
              const sel = seleccionados.has(c.modelo)
              return (
                <div key={c.modelo} onClick={() => toggleCandidato(c.modelo)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    background: sel ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${sel ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  }}>
                  <input type="checkbox" checked={sel} onChange={() => toggleCandidato(c.modelo)} style={{ accentColor: '#818cf8' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#e2e8f0' }}>{c.modelo}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{c.nombre || '(sin descripción)'} · Cantidad en lote: {c.cantidad} PCS</div>
                  </div>
                  {c.probablemente && <span className="badge badge-blue" style={{ fontSize: 10 }}>canaleta</span>}
                </div>
              )
            })}
          </div>
          <button className="btn btn-primary btn-full" style={{ marginTop: 14 }} disabled={!seleccionados.size} onClick={irAControl}>
            <Ruler size={14} /> Registrar control · {seleccionados.size} modelo{seleccionados.size !== 1 ? 's' : ''} del lote
          </button>
        </div>
      )}

      {/* ── FASE 2: Control por modelo del lote ── */}
      {phase === 'control' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Card resumen del lote — siempre visible */}
          <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: '#a5b4fc', fontWeight: 700, marginBottom: 4 }}>Lote</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
              Invoice {invoiceNum || '(sin número)'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {proveedor && <span>Proveedor: <strong style={{ color: '#e2e8f0' }}>{proveedor}</strong></span>}
              {dinNum && <span>DIN: <strong style={{ color: '#e2e8f0' }}>{dinNum}</strong></span>}
              {fechaLlegada && <span>Llegada: <strong style={{ color: '#e2e8f0' }}>{fechaLlegada}</strong></span>}
              <span>{productos.length} modelo{productos.length !== 1 ? 's' : ''} · {productos.reduce((s, p) => s + (p.muestras || 0), 0)} muestras totales</span>
            </div>
          </div>

          {productos.map((p, idx) => {
            const r = espesorResult(p)
            return (
              <div key={p.modelo} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#e2e8f0' }}>{p.modelo}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{p.nombre || '(sin descripción)'} · Cantidad en lote: {p.cantidad} PCS</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }} title="Cantidad de unidades tomadas aleatoriamente del lote para medir">Muestras al azar:</label>
                    <input className="input" style={{ width: 60, textAlign: 'center' }} type="number" min={1} value={p.muestras}
                      onChange={e => updateProducto(idx, { muestras: parseInt(e.target.value) || 1 })}
                      title="Unidades del lote tomadas al azar para muestreo" />
                  </div>
                </div>

                {/* Espesor */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#a5b4fc', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Espesor (micrómetro)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Declarado</label>
                      <input className="input" type="number" step="0.01" value={p.espesor.declarado}
                        onChange={e => updateEspesor(idx, { declarado: e.target.value })} placeholder="1.5" />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Tolerancia</label>
                      <input className="input" type="number" step="0.01" value={p.espesor.tolerancia}
                        onChange={e => updateEspesor(idx, { tolerancia: e.target.value })} placeholder="0.1" />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Tipo tol.</label>
                      <select className="input" value={p.espesor.tipoTol} onChange={e => updateEspesor(idx, { tipoTol: e.target.value as 'mm' | 'pct' })}>
                        <option value="mm">mm</option>
                        <option value="pct">%</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Unidad</label>
                      <input className="input" value={p.espesor.unidad} onChange={e => updateEspesor(idx, { unidad: e.target.value })} placeholder="mm" />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Mediciones:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {p.espesor.mediciones.map((m, mi) => (
                      <div key={mi} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input className="input" style={{ width: 70, textAlign: 'center' }} type="number" step="0.01"
                          value={m} onChange={e => setMedicion(idx, mi, e.target.value)} placeholder="0.00" />
                        <button className="btn-icon" onClick={() => delMedicion(idx, mi)} title="Eliminar"><X size={12} /></button>
                      </div>
                    ))}
                    <button className="btn btn-secondary btn-sm" onClick={() => addMedicion(idx)}><Plus size={12} /> Medición</button>
                  </div>
                  {r.veredicto !== 'pendiente' && (
                    <div style={{ fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>avg: <strong style={{ color: '#e2e8f0' }}>{r.avg.toFixed(3)}</strong></span>
                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>min: <strong style={{ color: '#e2e8f0' }}>{r.min.toFixed(3)}</strong></span>
                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>max: <strong style={{ color: '#e2e8f0' }}>{r.max.toFixed(3)}</strong></span>
                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>rango: <strong style={{ color: '#e2e8f0' }}>[{r.rango.inf.toFixed(3)}, {r.rango.sup.toFixed(3)}]</strong></span>
                      <span className={r.veredicto === 'cumple' ? 'badge badge-green' : 'badge badge-red'}>{r.veredicto === 'cumple' ? '✓ Cumple' : '✗ No cumple'}</span>
                    </div>
                  )}
                </div>

                {/* Resistencia */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#a5b4fc', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Resistencia</div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                      <input type="checkbox" checked={p.resistencia.deformacion} onChange={e => updateResistencia(idx, { deformacion: e.target.checked })} style={{ accentColor: '#818cf8' }} />
                      Presenta deformación
                    </label>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className={`btn btn-sm ${p.resistencia.resultado === 'cumple' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => updateResistencia(idx, { resultado: 'cumple' })}>Cumple</button>
                      <button className={`btn btn-sm ${p.resistencia.resultado === 'no_cumple' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => updateResistencia(idx, { resultado: 'no_cumple' })}>No cumple</button>
                    </div>
                  </div>
                  <textarea className="input" style={{ width: '100%', minHeight: 60 }} placeholder="Descripción del ensayo, hasta dónde resistió, cómo se comportó..."
                    value={p.resistencia.descripcion} onChange={e => updateResistencia(idx, { descripcion: e.target.value })} />
                </div>

                {/* Otras verificaciones */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#a5b4fc', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Otras verificaciones</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                    {p.otras.checklist.map((c, ci) => (
                      <div key={ci} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input className="input" style={{ flex: 1 }} value={c.item}
                          onChange={e => setChecklist(idx, ci, { item: e.target.value })} placeholder="Nombre del check" />
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button className={`btn btn-sm ${c.ok === true ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setChecklist(idx, ci, { ok: c.ok === true ? null : true })}>SI</button>
                          <button className={`btn btn-sm ${c.ok === false ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setChecklist(idx, ci, { ok: c.ok === false ? null : false })}>NO</button>
                        </div>
                        <input className="input" style={{ width: 180 }} value={c.nota}
                          onChange={e => setChecklist(idx, ci, { nota: e.target.value })} placeholder="Nota (opcional)" />
                        <button className="btn-icon" onClick={() => delChecklist(idx, ci)} title="Eliminar"><Trash2 size={12} /></button>
                      </div>
                    ))}
                    <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => addChecklistItem(idx)}><Plus size={12} /> Agregar check</button>
                  </div>
                  <textarea className="input" style={{ width: '100%', minHeight: 50 }} placeholder="Observaciones libres"
                    value={p.otras.libre} onChange={e => updateOtras(idx, { libre: e.target.value })} />
                </div>

                {/* Fotos */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#a5b4fc', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Fotos de evidencia ({p.fotos.length})</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    {p.fotos.map((f, fi) => (
                      <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(74,222,128,0.1)', borderRadius: 6, fontSize: 11, border: '1px solid rgba(74,222,128,0.2)' }}>
                        <ImageIcon size={12} color="#4ade80" />
                        {f.webViewLink
                          ? <a href={f.webViewLink} target="_blank" rel="noreferrer" style={{ color: '#a5b4fc', textDecoration: 'none' }}>{f.name}</a>
                          : <span style={{ color: '#a5b4fc' }}>{f.name}</span>}
                        <button className="btn-icon" onClick={() => delFoto(idx, fi)} title="Quitar"><X size={11} /></button>
                      </div>
                    ))}
                    <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                      <Camera size={12} /> {Object.keys(uploading).some(k => k.startsWith(idx + '-')) ? 'Subiendo...' : 'Subir foto'}
                      <input type="file" accept="image/*" style={{ display: 'none' }} multiple
                        onChange={e => { const files = Array.from(e.target.files || []); files.forEach(f => subirFoto(idx, f)); e.currentTarget.value = '' }} />
                    </label>
                  </div>
                  {!driveFolderId && <div style={{ fontSize: 11, color: 'rgba(251,191,36,0.7)' }}>Falta ID de carpeta Drive para subir fotos.</div>}
                </div>

                {/* Observaciones del producto */}
                <div style={{ marginTop: 10 }}>
                  <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Observaciones del producto</label>
                  <textarea className="input" style={{ width: '100%', minHeight: 40 }} value={p.observaciones}
                    onChange={e => updateProducto(idx, { observaciones: e.target.value })} />
                </div>
              </div>
            )
          })}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setPhase('seleccion')}>← Volver a selección</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={irAVeredicto}>Ir al veredicto →</button>
          </div>
        </div>
      )}

      {/* ── FASE 3: Veredicto ── */}
      {phase === 'veredicto' && (
        <div className="card">
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>Elegí el veredicto del lote:</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
            {(['aprobado', 'observaciones', 'rechazado'] as const).map(v => (
              <button key={v} className={`btn ${veredicto === v ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '14px 8px' }} onClick={() => setVeredicto(v)}>
                {v === 'aprobado' && '✓ Aprobado'}
                {v === 'observaciones' && '⚠ Con observaciones'}
                {v === 'rechazado' && '✗ Rechazado'}
              </button>
            ))}
          </div>
          {veredicto && veredicto !== 'aprobado' && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Acción tomada <span style={{ color: '#f87171' }}>*</span></label>
              <textarea className="input" style={{ width: '100%', minHeight: 70 }} placeholder="Reclamo a proveedor, nota de crédito, devolución, uso condicionado..."
                value={accionTomada} onChange={e => setAccionTomada(e.target.value)} />
            </div>
          )}
          {saveError && <div className="alert alert-error" style={{ marginBottom: 10 }}>{saveError}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setPhase('control')}>← Editar mediciones</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={saving || !veredicto} onClick={guardar}>
              {saving ? <><Loader2 size={14} className="spin" /> Guardando...</> : <><Download size={14} /> Guardar y generar informe</>}
            </button>
          </div>
        </div>
      )}

      {/* ── FASE done ── */}
      {phase === 'done' && (
        <div className="card">
          <div className="empty">
            <CheckCircle2 size={40} color="#4ade80" style={{ marginBottom: 12 }} />
            <div className="empty-title">Control registrado</div>
            <div className="empty-sub">
              Informe descargado{informeUrl ? ' y subido a Drive' : ''}. ID: <code>{savedId?.slice(0, 8)}</code>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center' }}>
              {informeUrl && <a className="btn btn-secondary btn-sm" href={informeUrl} target="_blank" rel="noreferrer">Ver informe en Drive</a>}
              <button className="btn btn-secondary btn-sm" onClick={() => navigate('/canaletas/historial')}>Ir al historial</button>
              <button className="btn btn-primary btn-sm" onClick={reset}>Nuevo control</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
