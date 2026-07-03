import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Upload, CheckCircle2, Camera, Loader2, FileSearch, X, RefreshCw, ArrowRight, Smartphone, Wifi } from 'lucide-react'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import { parseInvoice } from '../lib/processor'
import { lookupProduct, lookupProductByDescCode } from '../lib/products'
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
  return (
    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
      <button className={`check-btn ${val === 'SI' ? 'check-si' : 'check-off'}`} onClick={onSI}>SI</button>
      <button className={`check-btn ${val === 'NO' ? 'check-no' : 'check-off'}`} onClick={onNO}>NO</button>
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
  const location = useLocation()
  const sessionParam = new URLSearchParams(location.search).get('s')

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

  // Cross-device session sync
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [isRemoteSession, setIsRemoteSession] = useState(false)
  const [sessionSyncing, setSessionSyncing] = useState(false)
  const lastLocalTs = useRef(0)
  const cancelledRef = useRef(false)
  const [drag, setDrag] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // ── Load session from URL param (mobile opens shared link) ──
  useEffect(() => {
    if (!sessionParam) return
    setReading(true)
    supabase.from('calidad_sessions').select('*').eq('id', sessionParam).single()
      .then(({ data }) => {
        setReading(false)
        if (data) {
          setInvoiceNum(data.invoice_num)
          setTrazabilidad(data.trazabilidad || '')
          setDinNum(data.din_num || '')
          setColorLote(data.color_lote || '')
          setProducts(data.products as ProdCheck[])
          setPhase('checklist')
          setSessionId(sessionParam)
          setIsRemoteSession(true)
        } else {
          setReadError('Sesión no encontrada o expirada. Pide que generen un nuevo QR desde el computador.')
          setReading(false)
        }
      })
  }, [sessionParam])

  // ── Restore localStorage draft on mount (skipped when loading from session URL) ──
  useEffect(() => {
    if (sessionParam) return
    const raw = localStorage.getItem('calidad_draft')
    if (!raw) return
    try {
      const d = JSON.parse(raw)
      if (d.products?.length) {
        setInvoiceNum(d.invoiceNum || ''); setTrazabilidad(d.trazabilidad || '')
        setDinNum(d.dinNum || ''); setColorLote(d.colorLote || '')
        setProducts(d.products); setPhase('checklist'); setDraftLoaded(true)
        // Create session so QR appears for mobile sharing
        supabase.from('calidad_sessions').insert({
          invoice_num: d.invoiceNum || '',
          trazabilidad: d.trazabilidad || '',
          products: d.products,
        }).select('id').single().then(({ data }) => {
          if (data?.id) setSessionId(data.id)
        })
      }
    } catch { /* ignore */ }
  }, [])

  // ── Save draft to localStorage (desktop/local only) ──
  useEffect(() => {
    if (phase !== 'checklist' || isRemoteSession) return
    localStorage.setItem('calidad_draft', JSON.stringify({ invoiceNum, trazabilidad, dinNum, colorLote, products }))
  }, [products, dinNum, colorLote, invoiceNum, trazabilidad, phase, isRemoteSession])

  // ── Sync local changes → Supabase session (debounced 600ms) ──
  useEffect(() => {
    if (!sessionId || phase !== 'checklist') return
    const timer = setTimeout(async () => {
      lastLocalTs.current = Date.now()
      setSessionSyncing(true)
      await supabase.from('calidad_sessions').update({
        products, din_num: dinNum, color_lote: colorLote,
        updated_at: new Date().toISOString(),
      }).eq('id', sessionId)
      setSessionSyncing(false)
    }, 600)
    return () => clearTimeout(timer)
  }, [products, dinNum, colorLote, sessionId, phase])

  // ── Supabase Realtime: receive changes from the other device ──
  useEffect(() => {
    if (!sessionId) return
    const ch = supabase.channel(`calidad-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calidad_sessions', filter: `id=eq.${sessionId}` },
        ({ new: d }) => {
          // Ignore updates that originated from this device (within 2s window)
          if (Date.now() - lastLocalTs.current < 2000) return
          const row = d as Record<string, unknown>
          setProducts(row.products as ProdCheck[])
          setDinNum((row.din_num as string) || '')
          setColorLote((row.color_lote as string) || '')
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sessionId])

  // ── Generate QR code image when session is created (desktop only) ──
  useEffect(() => {
    if (!sessionId || isRemoteSession) return
    QRCode.toDataURL(`${window.location.origin}/calidad?s=${sessionId}`, {
      width: 160, margin: 1,
      color: { dark: '#1e2030', light: '#eef0ff' },
    }).then(setQrDataUrl)
  }, [sessionId, isRemoteSession])

  const cancelReading = () => {
    cancelledRef.current = true
    setReading(false)
    setPhase('upload')
  }

  const refreshFromSession = async () => {
    if (!sessionId) return
    setRefreshing(true)
    const { data } = await supabase.from('calidad_sessions').select('*').eq('id', sessionId).single()
    if (data) {
      setProducts(data.products as ProdCheck[])
      setDinNum((data.din_num as string) || '')
      setColorLote((data.color_lote as string) || '')
    }
    setRefreshing(false)
  }

  // ── Read invoice and create shared session ──
  const readInvoice = async () => {
    if (!invoiceFile) return
    cancelledRef.current = false
    setReading(true); setReadError(''); setPhase('reading')
    try {
      const inv = await parseInvoice(invoiceFile)
      if (cancelledRef.current) return
      setInvoiceNum(inv.invoiceNum || '')
      setTrazabilidad(inv.trazabilidad || '')
      // Resolve each invoice code → BD model (direct or via trailing supplier code in description)
      const resolved = (inv.products || []).map(p => {
        const direct = lookupProduct(p.modelo)
        if (direct) return { modelo: p.modelo, cantidad: p.cantidad, entry: direct }
        const byDesc = lookupProductByDescCode(p.modelo)
        if (byDesc) return { modelo: byDesc.modelo, cantidad: p.cantidad, entry: byDesc.entry }
        return null
      }).filter(Boolean) as { modelo: string; cantidad: number; entry: NonNullable<ReturnType<typeof lookupProduct>> }[]

      if (!resolved.length) throw new Error('Ningún producto certificable encontrado en esta invoice. Verifica que los modelos estén en la BD Grantt.')

      const mapped: ProdCheck[] = resolved.map(r => ({
        modelo: r.modelo, nombre: r.entry.nombre, cantidad: r.cantidad,
        qrEsperado: lookupQR(r.modelo),
        envase: { modelo: null, sello_qr: null, fecha_fab: null, placa_info: null, pais_fab: null },
        cuerpo:  { modelo: null, sello_qr: null, fecha_fab: null, pais_fab: null },
      }))
      if (cancelledRef.current) return
      setProducts(mapped)
      setPhase('checklist')

      // Create shared session in Supabase for cross-device QR sync
      const { data } = await supabase.from('calidad_sessions').insert({
        invoice_num: inv.invoiceNum || '',
        trazabilidad: inv.trazabilidad || '',
        products: mapped,
      }).select('id').single()
      if (data?.id && !cancelledRef.current) setSessionId(data.id)
    } catch (e) {
      if (cancelledRef.current) return
      setReadError(e instanceof Error ? e.message : 'Error leyendo invoice')
      setPhase('upload')
    } finally { if (!cancelledRef.current) setReading(false) }
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
      if (sessionId) {
        await supabase.from('calidad_sessions').delete().eq('id', sessionId)
        setSessionId(null)
      }
    } catch { /* non-fatal */ }
    setSaving(false)
  }

  const reset = () => {
    localStorage.removeItem('calidad_draft')
    if (sessionId) supabase.from('calidad_sessions').delete().eq('id', sessionId)
    setPhase('upload'); setInvoiceFile(null); setInvoiceNum(''); setTrazabilidad('')
    setDinNum(''); setColorLote(''); setProducts([]); setSavedOk(false); setReadError('')
    setDraftLoaded(false); setSessionId(null); setQrDataUrl(''); setIsRemoteSession(false)
  }

  return (
    <div className="page">
      <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && setInvoiceFile(e.target.files[0])} />
      <input ref={qrRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onQRImage} />

      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <div>
          <div className="page-title">Control de Calidad</div>
          <div className="page-sub" style={{ marginBottom: 0 }}>
            {phase === 'upload' && 'Inspección de marcado de productos'}
            {phase === 'reading' && (sessionParam ? 'Cargando sesión compartida...' : 'Leyendo invoice...')}
            {phase === 'checklist' && `${products.length} productos certificables · ${invoiceNum}`}
          </div>
        </div>
        {phase !== 'upload' && (
          <div style={{ display: 'flex', gap: 8 }}>
            {sessionId && (
              <button className="btn btn-secondary btn-sm" onClick={refreshFromSession} disabled={refreshing} title="Actualizar cambios desde el celular">
                {refreshing ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />} Actualizar
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => { if (window.confirm('¿Cancelar esta inspección? Los datos no guardados se perderán.')) reset() }}>
              <X size={12} /> Cancelar
            </button>
          </div>
        )}
      </div>

      {/* ── Upload phase (desktop) ── */}
      {(phase === 'upload' || (phase === 'reading' && !sessionParam)) && (
        <div className="card">
          <div
            className={`drop-zone${invoiceFile ? ' has-file' : ''}${drag ? ' dragging' : ''}`}
            onClick={() => !invoiceFile && fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); if (!invoiceFile) setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f && !invoiceFile) setInvoiceFile(f) }}
          >
            <div className="dz-icon">
              {invoiceFile ? <CheckCircle2 size={18} color="#4ade80" /> : <Upload size={18} color="rgba(255,255,255,0.3)" />}
            </div>
            <div className="dz-text">
              <div className="dz-label">{invoiceFile ? invoiceFile.name : 'Invoice (PDF)'}</div>
              <div className="dz-hint">{invoiceFile ? `${(invoiceFile.size/1024).toFixed(1)} KB` : 'Arrastrá el PDF acá o hacé clic para elegir'}</div>
            </div>
            {invoiceFile && <button className="btn-icon" onClick={e => { e.stopPropagation(); setInvoiceFile(null) }}><X size={14} /></button>}
          </div>
          {readError && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>{readError}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={!invoiceFile || reading} onClick={readInvoice}>
              {reading ? <><Loader2 size={14} className="spin" /> Leyendo...</> : <><FileSearch size={14} /> Leer Invoice</>}
            </button>
            {reading && (
              <button className="btn btn-secondary" onClick={cancelReading}>
                <X size={14} /> Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Loading session from URL (mobile) ── */}
      {phase === 'reading' && sessionParam && (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <Loader2 size={24} className="spin" style={{ margin: '0 auto 12px', display: 'block', color: '#6366f1' }} />
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Cargando sesión compartida...</div>
          {readError && <div style={{ color: '#f87171', fontSize: 12, marginTop: 12 }}>{readError}</div>}
        </div>
      )}

      {/* ── Checklist ── */}
      {phase === 'checklist' && (
        <>
          {/* Remote session banner (mobile) */}
          {isRemoteSession && (
            <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Wifi size={14} color="#a5b4fc" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#a5b4fc' }}>Sesión compartida desde computador</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>
                  Tus respuestas se sincronizan en tiempo real
                  {sessionSyncing && <span style={{ color: 'rgba(99,102,241,0.7)', marginLeft: 6 }}>· guardando...</span>}
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto', flexShrink: 0 }} onClick={refreshFromSession} disabled={refreshing} title="Actualizar">
                {refreshing ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />} Actualizar
              </button>
            </div>
          )}

          {/* Draft restored banner (local) */}
          {draftLoaded && !isRemoteSession && (
            <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: 6 }}>
              ↺ Borrador restaurado — tus respuestas se guardaron automáticamente
            </div>
          )}

          {/* Header info + QR */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div className="text-xs text-muted" style={{ marginBottom: 3 }}>Invoice</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{invoiceNum || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted" style={{ marginBottom: 3 }}>Trazabilidad</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{trazabilidad || '—'}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Código de trazabilidad del envío</div>
              </div>
              <div>
                <label className="text-xs text-muted" style={{ display: 'block', marginBottom: 3 }}>N° DIN</label>
                <input className="field-input" value={dinNum} onChange={e => setDinNum(e.target.value)}
                  placeholder="Ej: 1234567" style={{ fontSize: 12 }} title="Número de Declaración de Ingreso de Aduanas" />
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Declaración de Ingreso (opcional)</div>
              </div>
              <div>
                <label className="text-xs text-muted" style={{ display: 'block', marginBottom: 3 }}>Color Lote</label>
                <input className="field-input" value={colorLote} onChange={e => setColorLote(e.target.value)}
                  placeholder="Ej: Azul" style={{ fontSize: 12 }} title="Color del lote para identificación visual del marcado" />
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Color del marcado en el lote</div>
              </div>
            </div>

            {/* QR panel (desktop only — shown when session exists and not a remote load) */}
            {qrDataUrl && !isRemoteSession && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 16 }}>
                <img src={qrDataUrl} alt="QR sesión" style={{ width: 100, height: 100, borderRadius: 8, flexShrink: 0 }} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Smartphone size={13} color="#a5b4fc" />
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#a5b4fc' }}>Inspeccionar desde el celular</span>
                    {sessionSyncing && <span style={{ fontSize: 10, color: 'rgba(99,102,241,0.6)' }}>· sincronizando...</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                    Escanea este QR con tu celular para abrir el checklist con todos los productos ya cargados.<br />
                    <span style={{ color: 'rgba(255,255,255,0.3)' }}>Los cambios se sincronizan entre dispositivos. Usa "Actualizar" arriba para traer cambios del celular.</span>
                  </div>
                </div>
              </div>
            )}
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
              <CRow label="Sello QR" val={prod.envase.sello_qr}
                onSI={() => upd(prod.modelo,'envase','sello_qr','SI')}
                onNO={() => upd(prod.modelo,'envase','sello_qr','NO')}
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

          {/* Actions inline (desktop) */}
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

      {/* Actions sticky (mobile) */}
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
