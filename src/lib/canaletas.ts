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

// ── Espesor: solo stats (avg/min/max). Sin veredicto automático ────────────
export type EspesorInput = {
  declarado: number
  mediciones: number[]
}
export type EspesorResult = {
  avg: number; min: number; max: number
  count: number
  veredicto: 'pendiente' | 'ok'  // 'ok' cuando hay mediciones; 'pendiente' si no hay
}

export function evaluarEspesor(e: EspesorInput): EspesorResult {
  const meds = (e.mediciones || []).filter(m => Number.isFinite(m))
  if (!meds.length) return { avg: 0, min: 0, max: 0, count: 0, veredicto: 'pendiente' }
  const avg = meds.reduce((s, x) => s + x, 0) / meds.length
  return { avg, min: Math.min(...meds), max: Math.max(...meds), count: meds.length, veredicto: 'ok' }
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
  espesor: EspesorResult & { declarado?: number }
  resistencia: { resultado: 'cumple' | 'no_cumple' | 'pendiente' }
  otras: { checklist: { item: string; ok: boolean | null; nota?: string }[]; libre: string }
  observaciones?: string
}

// ponytail: sin veredicto binario de espesor. El fallo del lote lo determina
// resistencia + checklist manual. Las mediciones de espesor quedan como registro.
export function veredictoSugerido(productos: ProductoControl[]): 'aprobado' | 'observaciones' | 'rechazado' {
  if (!productos.length) return 'aprobado'
  const alguienFalla = productos.some(p => p.resistencia.resultado === 'no_cumple')
  if (alguienFalla) return 'rechazado'
  const alguienObserva = productos.some(p =>
    p.otras.checklist.some(c => c.ok === false) ||
    (p.otras.libre || '').trim().length > 0 ||
    (p.observaciones || '').trim().length > 0
  )
  return alguienObserva ? 'observaciones' : 'aprobado'
}

// ponytail: self-test mínimo — solo stats, sin veredicto binario.
if (typeof process !== 'undefined' && process.env && process.env.CANALETAS_SELFTEST === '1') {
  const r = evaluarEspesor({ declarado: 1.7, mediciones: [1.68, 1.72, 1.69, 1.70, 1.67] })
  if (r.count !== 5 || Math.abs(r.avg - 1.692) > 0.01) throw new Error('avg calc failed')
  if (r.min !== 1.67 || r.max !== 1.72) throw new Error('min/max failed')
  const empty = evaluarEspesor({ declarado: 1.7, mediciones: [] })
  if (empty.veredicto !== 'pendiente') throw new Error('pendiente failed')
  console.log('canaletas self-test OK')
}
