import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { rows, invoiceNum, dinNum, fechaSolicitud } = req.body

    const templatePath = join(__dirname, 'template.xls')
    const templateBuffer = readFileSync(templatePath)

    const XLSX = await import('xlsx')
    const wb = XLSX.read(templateBuffer, { type: 'buffer', cellStyles: true, bookVBA: true })
    const ws = wb.Sheets['SOLICITUD DE INSPECCION']

    const setCell = (ref, value) => {
      if (!ws[ref]) ws[ref] = {}
      if (typeof value === 'number') {
        ws[ref].v = value
        ws[ref].t = 'n'
      } else {
        ws[ref].v = value ?? ''
        ws[ref].t = 's'
      }
    }

    // Fill fecha solicitud - row 3, col D
    setCell('D3', fechaSolicitud)

    // Products start at row 13 (Excel row 13 = index 12)
    // Rows 11-12 are empty (part of template format)
    const START_ROW = 13

    // Clear rows 13-24
    for (let r = START_ROW; r <= 24; r++) {
      ['A','B','C','D','E','F','G','H','I','J','K','L','M'].forEach(col => {
        const ref = `${col}${r}`
        if (ws[ref]) { ws[ref].v = ''; ws[ref].t = 's' }
      })
    }

    // Fill each product row
    rows.forEach((r, i) => {
      const row = START_ROW + i
      setCell(`B${row}`, r.proto)
      setCell(`C${row}`, r.nombre)
      setCell(`D${row}`, r.modelo)
      setCell(`E${row}`, Number(r.cantidad))
      setCell(`G${row}`, r.trazabilidad)
      setCell(`H${row}`, String(r.qr))
      setCell(`I${row}`, r.sistema)
      setCell(`K${row}`, dinNum)
      setCell(`L${row}`, r.itemDin)
      setCell(`M${row}`, invoiceNum)
    })

    const outBuffer = XLSX.write(wb, { type: 'base64', bookType: 'xls' })
    return res.json({ base64: outBuffer })

  } catch (error) {
    console.error('Excel error:', error)
    return res.status(500).json({ error: error.message })
  }
}
