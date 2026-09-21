import { useState, useRef, useEffect } from 'react'
import { CheckCircle2, AlertCircle, Loader2, Database, RefreshCw, X, Clock, ChevronDown, ChevronUp, QrCode } from 'lucide-react'
import * as XLSX from 'xlsx'
import { getCertifiableCount, getNoCertCount } from '../lib/products'
import qrDBData from '../lib/qrDB.json'

type UpdateEntry = { date: string; message: string; author: string; sha: string; count: number | null }
const parseCount = (msg: string): number | null => {
  const m = msg.match(/\((\d+)\s*(?:productos?|códigos?)\)/i)
  return m ? parseInt(m[1], 10) : null
}
function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso)
  const d = Math.floor(diff / 86400000)
  if (d === 0) return 'hoy'
  if (d === 1) return 'ayer'
  if (d < 30) return `hace ${d} días`
  const mo = Math.floor(d / 30)
  return mo === 1 ? 'hace 1 mes' : `hace ${mo} meses`
}

const SISTEMA_LOOKUP: Record<string, string> = {
  'E-013-01-118357': 'Sistema 1, codigo 016',
  'E-013-01-118358': 'Sistema 1, codigo 017',
  'E-013-01-180144': 'Sistema 1, codigo 015',
}

function getSistema(cert: string): string {
  return SISTEMA_LOOKUP[cert] || 'Sistema 1, codigo 013'
}

function parseExcelDate(val: unknown): number {
  if (!val) return 0
  if (typeof val === 'number') return val
  const parts = String(val).split('/')
  if (parts.length === 3) return new Date(+parts[2], +parts[1] - 1, +parts[0]).getTime()
  return 0
}

type ProductEntry = { nombre: string; qr: string | number; cert: string; proto: string; sistema: string }

export default function BDMaestraPage() {
  // ── BD Maestra state ──
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState<Record<string, ProductEntry> | null>(null)
  const [pushing, setPushing] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [history, setHistory] = useState<UpdateEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)

  // ── QR Vigentes state ──
  const [qrFile, setQrFile] = useState<File | null>(null)
  const [qrParsing, setQrParsing] = useState(false)
  const [qrParsed, setQrParsed] = useState<Record<string, string | number> | null>(null)
  const [qrPushing, setQrPushing] = useState(false)
  const [qrResult, setQrResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const qrInputRef = useRef<HTMLInputElement>(null)
  const [qrLastUpdate, setQrLastUpdate] = useState<string | null>(null)

  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const r = await fetch('https://api.github.com/repos/catalinacarrasco-beep/grantt-seguimientos/commits?path=src/lib/productsDB.json&per_page=15')
      if (!r.ok) throw new Error()
      const data = await r.json() as any[]
      setHistory(data.map(c => ({
        date: c.commit.author.date, message: c.commit.message.split('\n')[0],
        author: c.commit.author.name, sha: c.sha.slice(0, 7),
        count: parseCount(c.commit.message),
      })))
    } catch { setHistory([]) }
    finally { setHistoryLoading(false) }
  }
  const loadQrLastUpdate = async () => {
    try {
      const r = await fetch('https://api.github.com/repos/catalinacarrasco-beep/grantt-seguimientos/commits?path=src/lib/qrDB.json&per_page=1')
      if (!r.ok) return
      const data = await r.json() as any[]
      if (data[0]) setQrLastUpdate(data[0].commit.author.date)
    } catch {}
  }
  useEffect(() => { loadHistory(); loadQrLastUpdate() }, [])

  // ── BD Maestra parser ──
  const parseFile = (f: File) => {
    setFile(f)
    setParsing(true)
    setResult(null)
    setParsed(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })

        const db: Record<string, ProductEntry & { _fecha: number }> = {}

        const ws1 = wb.Sheets['Registros importaciones']
        if (ws1) {
          const rows = XLSX.utils.sheet_to_json<unknown[]>(ws1, { header: 1 })
          for (let i = 1; i < rows.length; i++) {
            const r = rows[i] as unknown[]
            if (!r) continue
            if (String(r[11] || '').trim().toUpperCase() !== 'SI') continue
            const codigo = String(r[1] || '').trim()
            if (!codigo) continue
            const fecha = parseExcelDate(r[8])
            if (!db[codigo] || fecha > db[codigo]._fecha) {
              db[codigo] = {
                nombre: String(r[2] || '').trim(),
                qr: String(r[6] || '').trim(),
                cert: String(r[4] || '').trim(),
                proto: String(r[5] || '').trim(),
                sistema: getSistema(String(r[4] || '').trim()),
                _fecha: fecha,
              }
            }
          }
        }

        const ws2 = wb.Sheets['DB desde informe HC']
        if (ws2) {
          const rows = XLSX.utils.sheet_to_json<unknown[]>(ws2, { header: 1 })
          for (let i = 1; i < rows.length; i++) {
            const r = rows[i] as unknown[]
            if (!r) continue
            if (String(r[3] || '').trim().toLowerCase() !== 'si') continue
            const codigo = String(r[0] || '').trim()
            if (!codigo || codigo === 'undefined') continue
            if (!db[codigo]) {
              db[codigo] = {
                nombre: String(r[2] || '').trim(),
                qr: String(r[4] || '').trim(),
                cert: String(r[5] || '').trim(),
                proto: String(r[6] || '').trim(),
                sistema: getSistema(String(r[5] || '').trim()),
                _fecha: 0,
              }
            }
          }
        }

        const clean: Record<string, ProductEntry> = {}
        for (const [k, v] of Object.entries(db)) {
          const { _fecha, ...entry } = v
          clean[k] = entry
        }
        setParsed(clean)
      } catch (err) {
        setResult({ ok: false, msg: err instanceof Error ? err.message : 'Error al parsear el archivo' })
      } finally {
        setParsing(false)
      }
    }
    reader.readAsArrayBuffer(f)
  }

  const pushUpdate = async () => {
    if (!parsed) return
    setPushing(true)
    setResult(null)
    try {
      const res = await fetch('/api/update-bd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productsDB: parsed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al actualizar')
      setResult({ ok: true, msg: `BD actualizada: ${data.count} productos certificables. Se aplicará en ~1 min (redeploy automático).` })
      setTimeout(loadHistory, 3000)
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : 'Error desconocido' })
    } finally {
      setPushing(false)
    }
  }

  // ── QR Vigentes parser ──
  // Columns: PROVEEDOR | MODELO PROVEDOR | MODELO CERTIFICADO | MARCAS | DESCIPCION | CERTIFICACION | QR VIGENTE
  const parseQrFile = (f: File) => {
    setQrFile(f)
    setQrParsing(true)
    setQrResult(null)
    setQrParsed(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        if (!ws) throw new Error('Hoja vacía')

        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })
        const qr: Record<string, string | number> = {}

        for (let i = 1; i < rows.length; i++) {
          const r = rows[i] as unknown[]
          if (!r) continue
          const cert = String(r[5] || '').trim().toUpperCase()
          if (cert !== 'SI') continue
          const modeloProv = String(r[1] || '').trim()
          const modeloCert = String(r[2] || '').trim()
          const qrVal = String(r[6] || '').trim()
          if (!qrVal || qrVal === '0' || qrVal === 'undefined') continue

          const qrNum = /^\d+$/.test(qrVal) ? parseInt(qrVal, 10) : qrVal
          if (modeloProv) qr[modeloProv] = qrNum
          if (modeloCert && modeloCert !== modeloProv) qr[modeloCert] = qrNum
        }

        setQrParsed(qr)
      } catch (err) {
        setQrResult({ ok: false, msg: err instanceof Error ? err.message : 'Error al parsear' })
      } finally {
        setQrParsing(false)
      }
    }
    reader.readAsArrayBuffer(f)
  }

  const pushQrUpdate = async () => {
    if (!qrParsed) return
    setQrPushing(true)
    setQrResult(null)
    try {
      const res = await fetch('/api/update-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrDB: qrParsed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al actualizar')
      setQrResult({ ok: true, msg: `QR actualizado: ${data.count} códigos. Se aplicará en ~1 min.` })
      setTimeout(loadQrLastUpdate, 3000)
    } catch (err) {
      setQrResult({ ok: false, msg: err instanceof Error ? err.message : 'Error desconocido' })
    } finally {
      setQrPushing(false)
    }
  }

  return (
    <div className="page">
      <div className="page-title">BD Maestra</div>
      <div className="page-sub">Actualiza la base de datos de productos certificables</div>

      {/* ── BD Maestra Card ── */}
      <div className="card">
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div className="summary-card"><div className="summary-label">Certificables</div><div className="summary-val">{getCertifiableCount()}</div></div>
          <div className="summary-card"><div className="summary-label">Lista negra</div><div className="summary-val">{getNoCertCount()}</div></div>
          <div className="summary-card" style={{ flex: 1, minWidth: 200 }}>
            <div className="summary-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={11} /> Última actualización
            </div>
            {historyLoading ? (
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Cargando...</div>
            ) : history.length === 0 ? (
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Sin registro</div>
            ) : (
              <>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginTop: 2 }}>
                  {new Date(history[0].date).toLocaleDateString('es-CL')}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                  {relativeTime(history[0].date)}
                  {history[0].count !== null && ` · ${history[0].count} productos`}
                </div>
              </>
            )}
          </div>
        </div>

        {history.length > 0 && (
          <div style={{ marginBottom: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
            <button
              onClick={() => setHistoryOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={12} /> Historial de actualizaciones ({history.length})</span>
              {historyOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {historyOpen && (
              <div style={{ padding: '4px 14px 12px', maxHeight: 300, overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'rgba(255,255,255,0.4)' }}>
                      <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 500 }}>Fecha</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 500 }}>Productos</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 500 }}>Autor</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 500 }}>Cambio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => (
                      <tr key={h.sha} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '5px 6px', color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                          {new Date(h.date).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '5px 6px', color: '#a5b4fc', fontFamily: 'monospace' }}>{h.count ?? '—'}</td>
                        <td style={{ padding: '5px 6px', color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>{h.author}</td>
                        <td style={{ padding: '5px 6px', color: 'rgba(255,255,255,0.5)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div
          className={`drop-zone${file ? ' has-file' : ''}`}
          onClick={() => !file && inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('dragging') }}
          onDragLeave={e => { e.currentTarget.classList.remove('dragging') }}
          onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('dragging'); if (e.dataTransfer.files[0]) parseFile(e.dataTransfer.files[0]) }}
        >
          <input ref={inputRef} type="file" accept=".xlsb,.xlsx,.xls" style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) parseFile(e.target.files[0]); e.target.value = '' }} />
          <div className="dz-icon">
            {file ? <CheckCircle2 size={18} color="#4ade80" /> : <Database size={18} color="rgba(255,255,255,0.3)" />}
          </div>
          <div className="dz-text">
            <div className="dz-label">{file ? file.name : 'BD Maestra (.xlsb / .xlsx)'}</div>
            <div className="dz-hint">{file ? `${(file.size / 1024).toFixed(0)} KB · parseado` : 'Sube el archivo actualizado'}</div>
          </div>
          {file && <button className="btn-icon" onClick={e => { e.stopPropagation(); setFile(null); setParsed(null); setResult(null) }}><X size={14} /></button>}
        </div>

        {parsing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, color: '#a5b4fc' }}>
            <Loader2 size={14} className="spin" /> Leyendo hojas...
          </div>
        )}

        {parsed && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, color: '#4ade80', marginBottom: 4 }}>
              {Object.keys(parsed).length} productos certificables encontrados
            </div>
            {Object.keys(parsed).length !== getCertifiableCount() && (
              <div style={{ fontSize: 12, color: '#fbbf24', marginBottom: 8 }}>
                Cambio: {getCertifiableCount()} → {Object.keys(parsed).length} productos
              </div>
            )}

            <div style={{ maxHeight: 260, overflowY: 'auto', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, marginBottom: 12 }}>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, background: '#1a1d2e' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'rgba(255,255,255,0.5)' }}>Código</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'rgba(255,255,255,0.5)' }}>Nombre</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'rgba(255,255,255,0.5)' }}>QR</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'rgba(255,255,255,0.5)' }}>Protocolo</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(parsed).map(([code, p]) => (
                    <tr key={code} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '4px 8px', fontFamily: 'monospace', color: '#a5b4fc', whiteSpace: 'nowrap' }}>{code}</td>
                      <td style={{ padding: '4px 8px', color: 'rgba(255,255,255,0.7)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</td>
                      <td style={{ padding: '4px 8px', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>{String(p.qr)}</td>
                      <td style={{ padding: '4px 8px', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>{p.proto}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button className="btn btn-primary btn-full" onClick={pushUpdate} disabled={pushing}>
              {pushing
                ? <><Loader2 size={14} className="spin" /> Actualizando...</>
                : <><RefreshCw size={14} /> Actualizar BD ({Object.keys(parsed).length} productos)</>}
            </button>
          </div>
        )}

        {result && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 12,
            background: result.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${result.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            color: result.ok ? '#4ade80' : '#f87171',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {result.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {result.msg}
          </div>
        )}
      </div>

      {/* ── QR Vigentes Card ── */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header" style={{ marginBottom: 16 }}>
          <div>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <QrCode size={16} /> QR Vigentes
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              Actualiza la tabla de códigos QR vigentes por modelo
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="badge badge-blue">{Object.keys(qrDBData).length} códigos</span>
            {qrLastUpdate && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                Última carga: {new Date(qrLastUpdate).toLocaleDateString('es-CL')} · {relativeTime(qrLastUpdate)}
              </div>
            )}
          </div>
        </div>

        <div
          className={`drop-zone${qrFile ? ' has-file' : ''}`}
          onClick={() => !qrFile && qrInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('dragging') }}
          onDragLeave={e => { e.currentTarget.classList.remove('dragging') }}
          onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('dragging'); if (e.dataTransfer.files[0]) parseQrFile(e.dataTransfer.files[0]) }}
        >
          <input ref={qrInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) parseQrFile(e.target.files[0]); e.target.value = '' }} />
          <div className="dz-icon">
            {qrFile ? <CheckCircle2 size={18} color="#4ade80" /> : <QrCode size={18} color="rgba(255,255,255,0.3)" />}
          </div>
          <div className="dz-text">
            <div className="dz-label">{qrFile ? qrFile.name : "QR's Vigentes (.xlsx)"}</div>
            <div className="dz-hint">{qrFile ? `${(qrFile.size / 1024).toFixed(0)} KB · parseado` : 'Columnas: Proveedor, Modelo, Modelo Cert, Marcas, Descripción, Certificación, QR'}</div>
          </div>
          {qrFile && <button className="btn-icon" onClick={e => { e.stopPropagation(); setQrFile(null); setQrParsed(null); setQrResult(null) }}><X size={14} /></button>}
        </div>

        {qrParsing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, color: '#a5b4fc' }}>
            <Loader2 size={14} className="spin" /> Leyendo QR...
          </div>
        )}

        {qrParsed && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, color: '#4ade80', marginBottom: 4 }}>
              {Object.keys(qrParsed).length} códigos QR encontrados
            </div>
            {Object.keys(qrParsed).length !== Object.keys(qrDBData).length && (
              <div style={{ fontSize: 12, color: '#fbbf24', marginBottom: 8 }}>
                Cambio: {Object.keys(qrDBData).length} → {Object.keys(qrParsed).length} códigos
              </div>
            )}

            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, marginBottom: 12 }}>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, background: '#1a1d2e' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'rgba(255,255,255,0.5)' }}>Código</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', color: 'rgba(255,255,255,0.5)' }}>QR</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(qrParsed).map(([code, qr]) => (
                    <tr key={code} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '4px 8px', fontFamily: 'monospace', color: '#a5b4fc', whiteSpace: 'nowrap' }}>{code}</td>
                      <td style={{ padding: '4px 8px', color: 'rgba(255,255,255,0.5)' }}>{String(qr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button className="btn btn-primary btn-full" onClick={pushQrUpdate} disabled={qrPushing}>
              {qrPushing
                ? <><Loader2 size={14} className="spin" /> Actualizando...</>
                : <><RefreshCw size={14} /> Actualizar QR ({Object.keys(qrParsed).length} códigos)</>}
            </button>
          </div>
        )}

        {qrResult && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 12,
            background: qrResult.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${qrResult.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            color: qrResult.ok ? '#4ade80' : '#f87171',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {qrResult.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {qrResult.msg}
          </div>
        )}
      </div>
    </div>
  )
}
