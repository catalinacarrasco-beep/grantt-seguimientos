import qrDB from './qrDB.json'
import { lookupProduct } from './products'

function normalize(code: string): string {
  if (!code) return ''
  let c = code.trim().toUpperCase().replace(/\s+/g, '-')
  if (/^\d+$/.test(c)) c = c.replace(/^0+/, '') || '0'
  return c
}

export function lookupQR(modelo: string): string | null {
  if (!modelo) return null
  const n = normalize(modelo)
  const fromQR = (qrDB as Record<string, string>)[n]
  if (fromQR) return fromQR
  // ponytail: fall through to full product lookup (handles sister variant, suffix strip, etc)
  const entry = lookupProduct(modelo)
  return entry?.qr ? String(entry.qr) : null
}

// Returns true if scanned QR matches any expected code for this product
export function verifyQR(modelo: string, scanned: string): boolean {
  const expected = lookupQR(modelo)
  if (!expected || expected === 'N/A') return false
  // Strip leading zeros from scanned URL numbers so "0000000594105" matches "594105"
  const stripped = scanned.replace(/0+(\d)/g, '$1')
  return expected.split('/').map(s => s.trim()).some(q => {
    const qStripped = q.replace(/^0+/, '')
    return scanned.includes(q) || scanned.includes(qStripped) || stripped.includes(q) || stripped.includes(qStripped)
  })
}
