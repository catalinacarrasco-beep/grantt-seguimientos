import ExcelJS from 'exceljs'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { rows, invoiceNum, dinNum, fechaSolicitud } = req.body

    // Load original template — preserves all formatting, logo, merges, colors
    const templatePath = join(__dirname, 'template.xlsx')
    const templateBuffer = readFileSync(templatePath)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(templateBuffer)
    const ws = wb.worksheets[0]

    // ── Row 3: Fecha Solicitud ────────────────────────────────────────────────
    ws.getCell('D3').value = fechaSolicitud

    // ── Rows 13-24: Products (template has 12 empty rows) ────────────────────
    for (let i = 0; i < 12; i++) {
      const r = 13 + i
      const row = rows[i]
      if (row) {
        ws.getCell(`B${r}`).value = row.nombre
        ws.getCell(`C${r}`).value = row.proto
        ws.getCell(`D${r}`).value = row.modelo
        ws.getCell(`E${r}`).value = Number(row.cantidad)
        ws.getCell(`G${r}`).value = row.trazabilidad
        ws.getCell(`H${r}`).value = String(row.qr)
        ws.getCell(`I${r}`).value = row.sistema
        ws.getCell(`K${r}`).value = dinNum
        ws.getCell(`L${r}`).value = row.itemDin
        ws.getCell(`M${r}`).value = invoiceNum
      }
    }

    const buffer = await wb.xlsx.writeBuffer()
    const base64 = buffer.toString('base64')
    return res.json({ base64 })

  } catch (error) {
    console.error('Excel error:', error)
    return res.status(500).json({ error: error.message })
  }
}
