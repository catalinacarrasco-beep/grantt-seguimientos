import productsRaw from './productsDB.json'
import noCertRaw from './noChertCodes.json'

type ProductEntry = { nombre: string }
const PRODUCTS_DB = productsRaw as Record<string, ProductEntry>
const NO_CERT_CODES = new Set((noCertRaw as string[]).map(c => c.trim().toUpperCase()))

// ponytail: mismas keywords que EXCLUDED_DIN_KEYWORDS + accesorios comunes.
// El nombre lo trae Claude tal cual la invoice, así que matcheamos sobre uppercase.
const CANALETA_KEYWORDS = [
  'CANALETA', 'CANALETAS', 'TRUNKING', 'DUCTO', 'DUCTOS', 'CONDUIT',
  'CARRETE', 'CARRETES', 'CANAL ', 'CANAL-',
  'TAPA', 'UNION', 'CURVA', 'TEE', 'BRACKET', 'CLIPS', 'CLIP',
  'ACCESORIO', 'ACCESORIOS',
]

function normCode(cod: unknown): string {
  let s = String(cod).trim().replace(/\.0+$/, '')
  s = s.replace(/\s*-\s*/g, '-').replace(/\s+/g, '-')
  return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s.toUpperCase()
}

const DB_INDEX = new Set(Object.keys(PRODUCTS_DB).map(normCode))

export type InvoiceProduct = { modelo: string; altCode?: string; cantidad: number; nombre?: string }
export type CanaletaCandidate = {
  modelo: string
  nombre: string
  cantidad: number
  probablemente: boolean  // true si el nombre matchea keywords de canaleta
}

// Filtra los productos que NO están en la BD Maestra y sugiere cuáles probablemente
// son canaletas por keywords. El usuario elige con checkboxes cuáles controlar.
export function findCanaletaCandidates(invoiceProducts: InvoiceProduct[]): CanaletaCandidate[] {
  const out: CanaletaCandidate[] = []
  for (const p of invoiceProducts) {
    const n = normCode(p.modelo)
    if (DB_INDEX.has(n)) continue                      // certificable, va al flujo SEC
    // los que están en lista negra tampoco certifican — son candidatos a canaleta
    const nombre = p.nombre || ''
    const upper = nombre.toUpperCase()
    const probablemente = CANALETA_KEYWORDS.some(kw => upper.includes(kw)) || NO_CERT_CODES.has(n)
    out.push({ modelo: p.modelo, nombre, cantidad: p.cantidad, probablemente })
  }
  // Ordenar: probables primero
  out.sort((a, b) => (b.probablemente ? 1 : 0) - (a.probablemente ? 1 : 0))
  return out
}

// ── Veredicto de espesor: binario cumple/no_cumple ────────────────────────
// tipoTol='mm'  → rango [declarado - tol, declarado + tol]
// tipoTol='pct' → rango [declarado*(1-tol/100), declarado*(1+tol/100)]
export type EspesorInput = {
  declarado: number
  tolerancia: number
  tipoTol: 'mm' | 'pct'
  mediciones: number[]
}
export type EspesorResult = {
  avg: number; min: number; max: number
  veredicto: 'cumple' | 'no_cumple' | 'pendiente'
  rango: { inf: number; sup: number }
}

export function evaluarEspesor(e: EspesorInput): EspesorResult {
  const meds = (e.mediciones || []).filter(m => Number.isFinite(m))
  if (!meds.length || !Number.isFinite(e.declarado) || !Number.isFinite(e.tolerancia)) {
    return { avg: 0, min: 0, max: 0, veredicto: 'pendiente', rango: { inf: 0, sup: 0 } }
  }
  const inf = e.tipoTol === 'pct'
    ? e.declarado * (1 - e.tolerancia / 100)
    : e.declarado - e.tolerancia
  const sup = e.tipoTol === 'pct'
    ? e.declarado * (1 + e.tolerancia / 100)
    : e.declarado + e.tolerancia
  const avg = meds.reduce((s, x) => s + x, 0) / meds.length
  const min = Math.min(...meds)
  const max = Math.max(...meds)
  const veredicto = (min >= inf && max <= sup) ? 'cumple' : 'no_cumple'
  return { avg, min, max, veredicto, rango: { inf, sup } }
}

// Checklist default de "otras verificaciones" — el usuario puede agregar items custom por control.
export const CHECKLIST_DEFAULT = [
  'Color uniforme',
  'Sin rebabas',
  'Corte recto',
  'Etiquetado correcto',
  'Embalaje íntegro',
]

// Deriva veredicto sugerido del lote a partir de los productos.
// Todos cumplen espesor+resistencia → aprobado
// Alguno no_cumple → rechazado
// Cualquier "otras" con item marcado no ok o descripción de observación → observaciones
export type ProductoControl = {
  modelo: string; nombre: string
  espesor: EspesorResult & { declarado?: number; tolerancia?: number }
  resistencia: { resultado: 'cumple' | 'no_cumple' | 'pendiente' }
  otras: { checklist: { item: string; ok: boolean | null; nota?: string }[]; libre: string }
  observaciones?: string
}

export function veredictoSugerido(productos: ProductoControl[]): 'aprobado' | 'observaciones' | 'rechazado' {
  if (!productos.length) return 'aprobado'
  const alguienFalla = productos.some(p =>
    p.espesor.veredicto === 'no_cumple' || p.resistencia.resultado === 'no_cumple'
  )
  if (alguienFalla) return 'rechazado'
  const alguienObserva = productos.some(p =>
    p.otras.checklist.some(c => c.ok === false) ||
    (p.otras.libre || '').trim().length > 0 ||
    (p.observaciones || '').trim().length > 0
  )
  return alguienObserva ? 'observaciones' : 'aprobado'
}

// ── Self-check inline (correlo con `node canaletas.mjs` tras un tsc rápido) ─
// ponytail: mínimo test embebido para la lógica no trivial.
if (typeof process !== 'undefined' && process.env && process.env.CANALETAS_SELFTEST === '1') {
  const cumple = evaluarEspesor({ declarado: 1.5, tolerancia: 0.1, tipoTol: 'mm', mediciones: [1.48, 1.52, 1.49, 1.50, 1.47] })
  if (cumple.veredicto !== 'cumple') throw new Error('espesor cumple: esperado cumple')
  const noCumple = evaluarEspesor({ declarado: 1.5, tolerancia: 0.1, tipoTol: 'mm', mediciones: [1.30, 1.52] })
  if (noCumple.veredicto !== 'no_cumple') throw new Error('espesor no_cumple: esperado no_cumple')
  const pct = evaluarEspesor({ declarado: 2.0, tolerancia: 5, tipoTol: 'pct', mediciones: [1.95, 2.05, 2.00] })
  if (pct.veredicto !== 'cumple') throw new Error('espesor pct: esperado cumple')
  console.log('canaletas self-test OK')
}
