import qrDB from './qrDB.json'

function normalize(code: string): string {
  let c = code.trim().toUpperCase().replace(/\s+/g, '-')
  if (/^\d+$/.test(c)) c = c.replace(/^0+/, '') || '0'
  return c
}

export function lookupQR(modelo: string): string | null {
  return (qrDB as Record<string, string>)[normalize(modelo)] || null
}

// Returns true if scanned QR matches any expected code for this product
export function verifyQR(modelo: string, scanned: string): boolean {
  const expected = lookupQR(modelo)
  if (!expected || expected === 'N/A') return false
  return expected.split('/').map(s => s.trim()).some(q => scanned.includes(q))
}
