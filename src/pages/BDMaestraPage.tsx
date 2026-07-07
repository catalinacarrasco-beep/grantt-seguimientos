import { useState, useRef } from 'react'
import { CheckCircle2, AlertCircle, Loader2, Database, RefreshCw, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { getCertifiableCount, getNoCertCount } from '../lib/products'

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
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState<Record<string, ProductEntry> | null>(null)
  const [pushing, setPushing] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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

        // "Registros importaciones": import log with dates — most recent wins per code
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

        // "DB desde informe HC": product catalog — fill gaps not covered by imports
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

        // Strip internal _fecha field
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
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : 'Error desconocido' })
    } finally {
      setPushing(false)
    }
  }

  return (
    <div className="page">
      <div className="page-title">BD Maestra</div>
      <div className="page-sub">Actualiza la base de datos de productos certificables</div>

      <div className="card">
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div className="summary-card"><div className="summary-label">Certificables</div><div className="summary-val">{getCertifiableCount()}</div></div>
          <div className="summary-card"><div className="summary-label">Lista negra</div><div className="summary-val">{getNoCertCount()}</div></div>
        </div>

        <div
          className={`drop-zone${file ? ' has-file' : ''}`}
          onClick={() => !file && inputRef.current?.click()}
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
    </div>
  )
}
