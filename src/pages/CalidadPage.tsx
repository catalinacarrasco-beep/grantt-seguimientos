import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, CheckCircle2, Camera, Loader2, FileSearch, X, RefreshCw, ArrowRight } from 'lucide-react'
import jsQR from 'jsqr'
import { parseInvoice, toBase64 } from '../lib/processor'
import { lookupProduct } from '../lib/products'
import { lookupQR, verifyQR } from '../lib/qr'
import { supabase } from '../lib/supabase'

type CheckVal = 'SI' | 'NO' | null

type ProdCheck = {
  modelo: string
  nombre: string
  cantidad: number
  qrEsperado: string | null
  envase: { modelo: CheckVal; sello_qr: CheckVal; fecha_fab: CheckVal; placa_info: CheckVal; pais_fab: CheckVal; qrScanned?: string; qrOk?: boolean }
  cuerpo:  { modelo: CheckVal; sello_qr: CheckVal; fecha_fab: CheckVal; pais_fab: CheckVal }
}

type Phase = 'upload' | 'reading' | 'checklist'

function SiNo({ val, onSI, onNO }: { val: CheckVal; onSI: () => void; onNO: () => void }) {
  const base = 'check-btn'
  return (
    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
      <button className={`${base} ${val === 'SI' ? 'check-si' : 'check-off'}`} onClick={onSI}>SI</button>
      <button className={`${base} ${val === 'NO' ? 'check-no' : 'check-off'}`} onClick={onNO}>NO</button>
    </div>
  )
}

function CRow({ label, val, onSI, onNO, extra }: { label: string; val: CheckVal; onSI: () => void; onNO: () => void; extra?: React.ReactNode }) {
  return (
    <div className="crit-row">
      <span className={`crit-label ${val === 'SI' ? 'crit-si' : val === 'NO' ? 'crit-no' : ''}`}>{label}</span>
      {extra}
      <SiNo val={val} onSI={onSI} onNO={onNO} />
    </div>
  )
}

export default function CalidadPage() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('upload')
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [invoiceNum, setInvoiceNum] = useState('')
  const [trazabilidad, setTrazabilidad] = useState('')
  const [dinNum, setDinNum] = useState('')
  const [colorLote, setColorLote] = useState('')
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState('')
  const [products, setProducts] = useState<ProdCheck[]>([])
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const qrRef = useRef<HTMLInputElement>(null)
  const [pendingQr, setPendingQr] = useState<{ modelo: string; section: 'envase' | 'cuerpo' } | null>(null)
  const [draftLoaded, setDraftLoaded] = useState(false)

  // Restore draft on mount (survives refreshes and accidental navigation)
  useEffect(() => {
    const raw = localStorage.getItem('calidad_draft')
    if (!raw) return
    try {
      const d = JSON.parse(raw)
      if (d.products?.length) {
        setInvoiceNum(d.invoiceNum || ''); setTrazabilidad(d.trazabilidad || '')
        setDinNum(d.dinNum || ''); setColorLote(d.colorLote || '')
        setProducts(d.products); setPhase('checklist'); setDraftLoaded(true)
      }
    } catch { /* ignore malformed draft */ }
  }, [])

  // Save draft whenever checklist state changes
  useEffect(() => {
    if (phase !== 'checklist') return
    localStorage.setItem('calidad_draft', JSON.stringify({ invoiceNum, trazabilidad, dinNum, colorLote, products }))
  }, [products, dinNum, colorLote, invoiceNum, trazabilidad, phase])

  const readInvoice = async () => {
    if (!invoiceFile) return
    setReading(true); setReadError(''); setPhase('reading')
    try {
      const inv = await parseInvoice(invoiceFile)
      setInvoiceNum(inv.invoiceNum || '')
      setTrazabilidad(inv.trazabilidad || '')
      const cert = (inv.products || []).filter(p => lookupProduct(p.modelo) !== null)
      if (!cert.length) throw new Error('Ningún producto certificable encontrado en esta invoice. Verifica que los modelos estén en la BD Grantt.')
      setProducts(cert.map(p => {
        const entry = lookupProduct(p.modelo)!
        return {
          modelo: p.modelo, nombre: entry.nombre, cantidad: p.cantidad,
          qrEsperado: lookupQR(p.modelo),
          envase: { modelo: null, sello_qr: null, fecha_fab: null, placa_info: null, pais_fab: null },
          cuerpo:  { modelo: null, sello_qr: null, fecha_fab: null, pais_fab: null },
        }
      }))
      setPhase('checklist')
    } catch (e) {
      setReadError(e instanceof Error ? e.message : 'Error leyendo invoice')
      setPhase('upload')
    } finally { setReading(false) }
  }

  const upd = (modelo: string, section: 'envase' | 'cuerpo', field: string, val: CheckVal) =>
    setProducts(prev => prev.map(p => p.modelo === modelo ? { ...p, [section]: { ...p[section], [field]: val } } : p))

  const scanQR = (modelo: string, section: 'envase' | 'cuerpo') => {
    setPendingQr({ modelo, section })
    qrRef.current?.click()
  }

  const onQRImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const pending = pendingQr
    if (!file || !pending) return
    e.target.value = ''; setPendingQr(null)
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width; canvas.height = img.height
      canvas.getContext('2d')!.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      const imageData = canvas.getContext('2d')!.getImageData(0, 0, img.width, img.height)
      const result = jsQR(imageData.data, imageData.width, imageData.height)
      if (result) {
        const ok = verifyQR(pending.modelo, result.data)
        setProducts(prev => prev.map(p => p.modelo === pending.modelo ? {
          ...p,
          [pending.section]: { ...p[pending.section], sello_qr: ok ? 'SI' : p[pending.section].sello_qr, qrScanned: result.data, qrOk: ok },
        } : p))
      }
    }
    img.onerror = () => URL.revokeObjectURL(url)
    img.src = url
  }

  const allAnswered = products.every(p =>
    p.envase.modelo !== null && p.envase.sello_qr !== null && p.envase.fecha_fab !== null && p.envase.placa_info !== null && p.envase.pais_fab !== null &&
    p.cuerpo.modelo  !== null && p.cuerpo.sello_qr  !== null && p.cuerpo.fecha_fab  !== null && p.cuerpo.pais_fab  !== null
  )

  const cumple = allAnswered && products.every(p =>
    p.envase.modelo === 'SI' && p.envase.sello_qr === 'SI' && p.envase.fecha_fab === 'SI' && p.envase.placa_info === 'SI' && p.envase.pais_fab === 'SI' &&
    p.cuerpo.modelo  === 'SI' && p.cuerpo.sello_qr  === 'SI' && p.cuerpo.fecha_fab  === 'SI' && p.cuerpo.pais_fab  === 'SI'
  )

  const save = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('inspecciones').insert({
        invoice_num: invoiceNum, din_num: dinNum, color_lote: colorLote, trazabilidad,
        fecha_inspeccion: new Date().toLocaleDateString('es-CL'),
        productos: products.map(({ modelo, nombre, cantidad, envase, cuerpo }) => ({ modelo, nombre, cantidad, envase, cuerpo })),
        cumple, user_email: user?.email || '',
      })
      setSavedOk(true)
      localStorage.removeItem('calidad_draft')
    } catch { /* table may not exist yet — non-fatal */ }
    setSaving(false)
  }

  const reset = () => {
    localStorage.removeItem('calidad_draft')
    setPhase('upload'); setInvoiceFile(null); setInvoiceNum(''); setTrazabilidad('')
    setDinNum(''); setColorLote(''); setProducts([]); setSavedOk(false); setReadError('')
    setDraftLoaded(false)
  }

  return (
    <div className="page">
      {/* Hidden inputs */}
      <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && setInvoiceFile(e.target.files[0])} />
      <input ref={qrRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onQRImage} />

      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <div>
          <div className="page-title">Control de Calidad</div>
          <div className="page-sub" style={{ marginBottom: 0 }}>
            {phase === 'upload' && 'Inspección de marcado de productos'}
            {phase === 'reading' && 'Leyendo invoice...'}
            {phase === 'checklist' && `${products.length} productos certificables · ${invoiceNum}`}
          </div>
        </div>
        {phase !== 'upload' && <button className="btn btn-secondary btn-sm" onClick={() => { if (window.confirm('¿Iniciar nueva inspección? Se perderán los datos actuales.')) reset() }}><RefreshCw size={12} /> Nueva</button>}
      </div>

      {/* Upload */}
      {(phase === 'upload' || phase === 'reading') && (
        <div className="card">
          <div className={`drop-zone${invoiceFile ? ' has-file' : ''}`} onClick={() => !invoiceFile && fileRef.current?.click()}>
            <div className="dz-icon">{invoiceFile ? <CheckCircle2 size={18} color="#4ade80" /> : <Upload size={18} color="rgba(255,255,255,0.3)" />}</div>
            <div className="dz-text">
              <div className="dz-label">{invoiceFile ? invoiceFile.name : 'Invoice (PDF)'}</div>
              <div className="dz-hint">{invoiceFile ? `${(invoiceFile.size/1024).toFixed(1)} KB` : 'Commercial Invoice del proveedor'}</div>
            </div>
            {invoiceFile && <button className="btn-icon" onClick={e => { e.stopPropagation(); setInvoiceFile(null) }}><X size={14} /></button>}
          </div>
          {readError && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>{readError}</div>}
          <button className="btn btn-primary btn-full" disabled={!invoiceFile || reading} onClick={readInvoice}>
            {reading ? <><Loader2 size={14} className="spin" /> Leyendo...</> : <><FileSearch size={14} /> Leer Invoice</>}
          </button>
        </div>
      )}

      {/* Checklist */}
      {phase === 'checklist' && (
        <>
          {/* Draft restored banner */}
          {draftLoaded && (
            <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: 6 }}>
              ↺ Borrador restaurado — tus respuestas se guardaron automáticamente
            </div>
          )}

          {/* Header info */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><div className="text-xs text-muted" style={{ marginBottom: 3 }}>Invoice</div><div style={{ fontWeight: 600, fontSize: 13 }}>{invoiceNum || '—'}</div></div>
              <div>
                <div className="text-xs text-muted" style={{ marginBottom: 3 }}>Trazabilidad</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{trazabilidad || '—'}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Código de trazabilidad del envío</div>
              </div>
              <div>
                <label className="text-xs text-muted" style={{ display: 'block', marginBottom: 3 }}>N° DIN</label>
                <input className="field-input" value={dinNum} onChange={e => setDinNum(e.target.value)} placeholder="Ej: 1234567" style={{ fontSize: 12 }}
                  title="Número de Declaración de Ingreso de Aduanas" />
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Declaración de Ingreso (opcional)</div>
              </div>
              <div>
                <label className="text-xs text-muted" style={{ display: 'block', marginBottom: 3 }}>Color Lote</label>
                <input className="field-input" value={colorLote} onChange={e => setColorLote(e.target.value)} placeholder="Ej: Azul" style={{ fontSize: 12 }}
                  title="Color del lote para identificación visual del marcado" />
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Color del marcado en el lote</div>
              </div>
            </div>
          </div>

          {/* Product cards */}
          {products.map(prod => (
            <div key={prod.modelo} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{prod.modelo}</div>
                  <div className="text-xs text-muted">{prod.nombre} · {prod.cantidad.toLocaleString()} PCS</div>
                </div>
                {prod.qrEsperado && <span className="badge badge-blue" style={{ flexShrink: 0, fontSize: 10 }}>QR {prod.qrEsperado}</span>}
              </div>

              <div className="crit-section">ENVASE</div>
              <CRow label="Modelo" val={prod.envase.modelo} onSI={() => upd(prod.modelo,'envase','modelo','SI')} onNO={() => upd(prod.modelo,'envase','modelo','NO')} />
              <CRow label="Sello QR" val={prod.envase.sello_qr} onSI={() => upd(prod.modelo,'envase','sello_qr','SI')} onNO={() => upd(prod.modelo,'envase','sello_qr','NO')}
                extra={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                    {prod.envase.qrScanned && (
                      <span style={{ fontSize: 10, color: prod.envase.qrOk ? '#4ade80' : '#f87171' }}>
                        {prod.envase.qrOk ? `✓ ${prod.envase.qrScanned}` : `✗ ${prod.envase.qrScanned}`}
                      </span>
                    )}
                    <button className="btn btn-secondary btn-sm" style={{ padding: '3px 8px', fontSize: 10, marginLeft: 'auto' }} onClick={() => scanQR(prod.modelo, 'envase')}>
                      <Camera size={10} /> Escanear
                    </button>
                  </div>
                }
              />
              <CRow label="Fecha fabricación" val={prod.envase.fecha_fab} onSI={() => upd(prod.modelo,'envase','fecha_fab','SI')} onNO={() => upd(prod.modelo,'envase','fecha_fab','NO')} />
              <CRow label="Placa informativa" val={prod.envase.placa_info} onSI={() => upd(prod.modelo,'envase','placa_info','SI')} onNO={() => upd(prod.modelo,'envase','placa_info','NO')} />
              <CRow label="País fabricación" val={prod.envase.pais_fab} onSI={() => upd(prod.modelo,'envase','pais_fab','SI')} onNO={() => upd(prod.modelo,'envase','pais_fab','NO')} />

              <div className="crit-section" style={{ marginTop: 14 }}>CUERPO</div>
              <CRow label="Modelo" val={prod.cuerpo.modelo} onSI={() => upd(prod.modelo,'cuerpo','modelo','SI')} onNO={() => upd(prod.modelo,'cuerpo','modelo','NO')} />
              <CRow label="Sello QR" val={prod.cuerpo.sello_qr} onSI={() => upd(prod.modelo,'cuerpo','sello_qr','SI')} onNO={() => upd(prod.modelo,'cuerpo','sello_qr','NO')} />
              <CRow label="Fecha fabricación" val={prod.cuerpo.fecha_fab} onSI={() => upd(prod.modelo,'cuerpo','fecha_fab','SI')} onNO={() => upd(prod.modelo,'cuerpo','fecha_fab','NO')} />
              <CRow label="País fabricación" val={prod.cuerpo.pais_fab} onSI={() => upd(prod.modelo,'cuerpo','pais_fab','SI')} onNO={() => upd(prod.modelo,'cuerpo','pais_fab','NO')} />
            </div>
          ))}

          {/* Actions — inline (desktop) */}
          <div className="card action-bar-inline" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
            {allAnswered && (
              <span className={`badge ${cumple ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 13, padding: '6px 16px' }}>
                {cumple ? '✓ CUMPLE' : '✗ NO CUMPLE'}
              </span>
            )}
            <button className="btn btn-secondary" disabled={saving || !allAnswered} onClick={save}>
              {saving && <Loader2 size={13} className="spin" />}
              {savedOk ? '✓ Guardado' : 'Guardar inspección'}
            </button>
            <button className="btn btn-primary" onClick={() => navigate('/nuevo', { state: { fromCalidad: { invoiceNum, trazabilidad, products: products.map(p => ({ modelo: p.modelo, cantidad: p.cantidad })) } } })}>
              Ir a Solicitud <ArrowRight size={14} />
            </button>
          </div>
        </>
      )}

      {/* Actions — sticky bottom bar (mobile only, shown during checklist) */}
      {phase === 'checklist' && (
        <div className="action-bar-sticky">
          <button className="btn btn-secondary" disabled={saving || !allAnswered} onClick={save}>
            {saving ? <Loader2 size={13} className="spin" /> : null}
            {savedOk ? '✓ Guardado' : 'Guardar'}
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/nuevo', { state: { fromCalidad: { invoiceNum, trazabilidad, products: products.map(p => ({ modelo: p.modelo, cantidad: p.cantidad })) } } })}>
            Ir a Solicitud <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
