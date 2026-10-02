import ExcelJS from 'exceljs'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { rows, invoiceNum, dinNum, fechaSolicitud } = req.body

    const templatePath = join(__dirname, 'template.xlsx')
    const templateBuffer = readFileSync(templatePath)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(templateBuffer)
    const ws = wb.worksheets[0]

    ws.getCell('E3').value = fechaSolicitud

    const FIRST = 13
    const SLOTS = 12
    const list = Array.isArray(rows) ? rows : []
    if (list.length > SLOTS) {
      ws.duplicateRow(FIRST, list.length - SLOTS, true)
    }
    for (let i = 0; i < list.length; i++) {
      const r = FIRST + i
      const row = list[i]
      if (!row) continue
      ws.getCell(`B${r}`).value = row.nombre
      ws.getCell(`C${r}`).value = row.proto
      ws.getCell(`D${r}`).value = row.modelo
      ws.getCell(`E${r}`).value = row.modeloCert || row.modelo
      ws.getCell(`F${r}`).value = Number(row.cantidad)
      ws.getCell(`H${r}`).value = row.trazabilidad
      ws.getCell(`I${r}`).value = String(row.qr)
      ws.getCell(`J${r}`).value = row.sistema
      ws.getCell(`L${r}`).value = dinNum
      ws.getCell(`M${r}`).value = row.itemDin
      ws.getCell(`N${r}`).value = invoiceNum
    }

    const buffer = await wb.xlsx.writeBuffer()
    const base64 = buffer.toString('base64')
    return res.json({ base64 })

  } catch (error) {
    console.error('Excel error:', error)
    return res.status(500).json({ error: error.message })
  }
}
