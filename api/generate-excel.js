import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { rows, invoiceNum, dinNum, fechaSolicitud } = req.body

    // Read template XLS
    const templatePath = join(__dirname, 'template.xls')
    const templateBuffer = readFileSync(templatePath)

    // Use xlrd/xlutils via a Python subprocess approach won't work in Vercel
    // Instead use xlsx library to read the template and preserve structure
    const XLSX = await import('xlsx')
    
    // Read the template
    const wb = XLSX.read(templateBuffer, { type: 'buffer', cellStyles: true })
    const ws = wb.Sheets['SOLICITUD DE INSPECCION']

    // Helper to set cell value preserving existing style
    const setCell = (cellRef, value) => {
      if (!ws[cellRef]) ws[cellRef] = {}
      ws[cellRef].v = value
      ws[cellRef].t = typeof value === 'number' ? 'n' : 's'
    }

    // Fill header - fecha solicitud is at D3 (row 3, col D)
    setCell('D3', fechaSolicitud)

    // Product rows start at row 11 (index 10 = row 11 in Excel)
    // Template has rows 11-24 available for products
    const startRow = 11
    
    // First clear existing data rows 11-24
    for (let r = startRow; r <= 24; r++) {
      ['A','B','C','D','E','F','G','H','I','J','K','L','M'].forEach(col => {
        const ref = `${col}${r}`
        if (ws[ref]) {
          ws[ref].v = ''
          ws[ref].t = 's'
        }
      })
    }

    // Fill product rows
    rows.forEach((r, i) => {
      const row = startRow + i
      setCell(`B${row}`, r.proto)          // Protocolo
      setCell(`C${row}`, r.nombre)         // Descripción
      setCell(`D${row}`, r.modelo)         // Modelo
      setCell(`E${row}`, r.cantidad)       // Cantidad (number)
      ws[`E${row}`].t = 'n'
      setCell(`G${row}`, r.trazabilidad)   // Trazabilidad
      setCell(`H${row}`, String(r.qr))     // QR
      setCell(`I${row}`, r.sistema)        // Sistema
      setCell(`K${row}`, dinNum)           // DIN
      setCell(`L${row}`, r.itemDin)        // Ítem DIN
      setCell(`M${row}`, invoiceNum)       // Invoice
    })

    // Write back to buffer
    const outBuffer = XLSX.write(wb, { type: 'base64', bookType: 'xls' })
    return res.json({ base64: outBuffer })

  } catch (error) {
    console.error('Excel error:', error)
    return res.status(500).json({ error: error.message })
  }
}
