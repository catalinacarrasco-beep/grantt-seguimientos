import ExcelJS from 'exceljs'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const NAVY = '1F3864'
const BLUE_LIGHT = 'BDD7EE'
const YELLOW = 'FFC000'
const WHITE = 'FFFFFF'
const RED = 'FF0000'
const BLACK = '000000'

const thin = { style: 'thin', color: { argb: 'FF000000' } }
const borders = { top: thin, bottom: thin, left: thin, right: thin }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { rows, invoiceNum, dinNum, fechaSolicitud } = req.body

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('SOLICITUD DE INSPECCION')

    ws.columns = [
      { width: 19 }, { width: 14 }, { width: 32 }, { width: 15 },
      { width: 11 }, { width: 15 }, { width: 13 }, { width: 17 },
      { width: 17 }, { width: 15 }, { width: 17 }, { width: 10 }, { width: 17 }
    ]

    // Logo
    try {
      const logoPath = join(__dirname, 'logo.png')
      const logoBuffer = readFileSync(logoPath)
      const imageId = wb.addImage({ buffer: logoBuffer, extension: 'png' })
      ws.addImage(imageId, { tl: { col: 0, row: 1 }, ext: { width: 110, height: 120 } })
    } catch (e) { console.log('Logo not found, skipping') }

    // Row 1
    ws.getCell('A1').value = 'FORM 131-503-001'
    ws.getCell('A1').font = { name: 'Calibri', size: 9, bold: true }
    ws.getCell('D1').value = 'Rev. 03   Jun-2025'
    ws.getCell('D1').font = { name: 'Calibri', size: 8 }
    ws.getCell('D1').alignment = { horizontal: 'right' }

    // Row 2: Title
    ws.mergeCells('B2:M2')
    ws.getCell('B2').value = 'SOLICITUD DE CERTIFICACION DE SEGUIMIENTOS MAS DECLARACION DE CONFORMIDAD'
    ws.getCell('B2').font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } }
    ws.getCell('B2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    ws.getCell('B2').alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(2).height = 28

    // Rows 3-9: Info
    const info = [
      [3, 'Fecha Solicitud', fechaSolicitud],
      [4, 'Razon social del solicitante', 'Representaciones Grantt Ltda'],
      [5, 'RUT del solicitante', '99.582.120-6'],
      [6, 'Nombre del representante legal', 'Cristobal Vigil'],
      [7, 'Rut del representante legal', '10.288.069-2'],
      [8, 'Lugar a realizar el muestreo', 'Santa Margarita #0742, San Bernardo'],
      [9, 'Ensayo solicitado (Seguimiento, Produccion, Comercio)', 'Seguimiento'],
    ]
    for (const [r, label, val] of info) {
      ws.mergeCells(`B${r}:C${r}`)
      ws.mergeCells(`D${r}:M${r}`)
      const lc = ws.getCell(`B${r}`)
      lc.value = label
      lc.font = { name: 'Calibri', size: 9, bold: true }
      lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_LIGHT } }
      lc.alignment = { horizontal: 'left', vertical: 'middle' }
      lc.border = borders
      const vc = ws.getCell(`D${r}`)
      vc.value = val
      vc.font = { name: 'Calibri', size: 9 }
      vc.alignment = { horizontal: 'center', vertical: 'middle' }
      vc.border = borders
      ws.getRow(r).height = 16
    }

    // Rows 10-11: Headers
    const cols = ['A','B','C','D','E','F','G','H','I','J','K','L','M']
    const hdrs = [
      'N. de SOLICITUD\n(Llenado por organismo\ncertificador)',
      'Producto','Protocolo','Modelo',
      'Cantidad del producto,\ntamano del lote\no partida',
      'N. de MUESTRA\n(Llenado por organismo\ncertificador)',
      'Identificacion o\ntrazabilidad (N de\nserie o mes ano)',
      'N del codigo QR o\nN de certificado\nde aprobacion',
      'Sistema de\ncertificacion',
      'Rango de control\n(Solo aplica\nsistema 2)',
      'N DIN\n(Indicar y adjuntarla\nen mail)',
      'items\nen DIN',
      'Invoice o Factura\n(Indicar y Adjuntarla\nen mail)',
    ]
    cols.forEach(c => ws.mergeCells(`${c}10:${c}11`))
    hdrs.forEach((h, i) => {
      const isF = i === 5
      const cell = ws.getCell(`${cols[i]}10`)
      cell.value = h
      cell.font = { name: 'Calibri', size: 8, bold: true, color: { argb: isF ? BLACK : WHITE } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isF ? YELLOW : NAVY } }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = borders
    })
    ws.getRow(10).height = 30
    ws.getRow(11).height = 30

    // Row 12: spacer
    ws.getRow(12).height = 5

    // Rows 13-24: Products
    for (let i = 0; i < 12; i++) {
      const r = 13 + i
      ws.getRow(r).height = 15
      for (const col of cols) {
        const cell = ws.getCell(`${col}${r}`)
        cell.border = borders
        cell.font = { name: 'Calibri', size: 8 }
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      }
      const row = rows[i]
      if (row) {
        ws.getCell(`B${r}`).value = row.proto
        ws.getCell(`B${r}`).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
        ws.getCell(`C${r}`).value = row.nombre
        ws.getCell(`C${r}`).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
        ws.getCell(`D${r}`).value = row.modelo
        ws.getCell(`E${r}`).value = Number(row.cantidad)
        ws.getCell(`E${r}`).numFmt = '#,##0'
        ws.getCell(`G${r}`).value = row.trazabilidad
        ws.getCell(`H${r}`).value = String(row.qr)
        ws.getCell(`I${r}`).value = row.sistema
        ws.getCell(`I${r}`).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
        ws.getCell(`K${r}`).value = dinNum
        ws.getCell(`L${r}`).value = row.itemDin
        ws.getCell(`M${r}`).value = invoiceNum
      }
    }

    // Row 25: IMPORTANTE
    ws.mergeCells('A25:H25')
    const imp = ws.getCell('A25')
    imp.value = 'IMPORTANTE:\nLos modelos individualizados en esta planilla seran revisados con los antecedentes indicados en el Certificado de Aprobacion.\nAnte cualquier cambio del producto en relacion al tipo inicialmente aprobado, se debera informar por escrito al Organismo de Certificacion para ver el procedimiento a seguir.'
    imp.font = { name: 'Calibri', size: 7, bold: true, color: { argb: RED } }
    imp.alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
    ws.getRow(25).height = 45

    ws.mergeCells('I25:K25')
    const rev = ws.getCell('I25')
    rev.value = 'Revision de la Solicitud (Uso exclusivo Cesmec)'
    rev.font = { name: 'Calibri', size: 8, bold: true }
    rev.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_LIGHT } }
    rev.alignment = { horizontal: 'center', vertical: 'middle' }
    rev.border = borders

    ws.mergeCells('L25:M25')
    ws.getCell('L25').value = 'Nombre de contacto'
    ws.getCell('L25').font = { name: 'Calibri', size: 8, bold: true }
    ws.getCell('L25').alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getCell('L25').border = borders

    // Rows 26-28: Declaracion + Rev fields
    ws.mergeCells('A26:H28')
    const dec = ws.getCell('A26')
    dec.value = 'DECLARACION:\nDeclaro que los productos que componen la produccion o partida presentada para certificacion mediante las solicitudes indicadas en el presente archivo, sigue siendo conformes con el tipo aprobado y que de no ser verdadera la informacion declarada, me someto a las correspondientes sanciones terminadas por la Superintendencia de Electricidad y combustible.'
    dec.font = { name: 'Calibri', size: 7, bold: true }
    dec.alignment = { horizontal: 'left', vertical: 'top', wrapText: true }

    for (const [r, label] of [[26,'Reviso'],[27,'Fecha revision'],[28,'Veredicto (Conforme - Incompleta - Erronea)']]) {
      ws.mergeCells(`I${r}:K${r}`)
      ws.mergeCells(`L${r}:M${r}`)
      const c = ws.getCell(`I${r}`)
      c.value = label
      c.font = { name: 'Calibri', size: 8, bold: true }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_LIGHT } }
      c.alignment = { horizontal: 'left', vertical: 'middle' }
      c.border = borders
      ws.getCell(`L${r}`).border = borders
      ws.getRow(r).height = 16
    }

    // Row 29: Observaciones + Firma
    ws.mergeCells('A29:H29')
    ws.getCell('A29').value = 'Observaciones:'
    ws.getCell('A29').font = { name: 'Calibri', size: 9, bold: true }

    ws.mergeCells('I29:M29')
    ws.getCell('I29').value = 'Firma'
    ws.getCell('I29').font = { name: 'Calibri', size: 9, bold: true }
    ws.getCell('I29').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_LIGHT } }
    ws.getCell('I29').alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getCell('I29').border = borders

    const buffer = await wb.xlsx.writeBuffer()
    const base64 = buffer.toString('base64')
    return res.json({ base64 })

  } catch (error) {
    console.error('Excel error:', error)
    return res.status(500).json({ error: error.message })
  }
}
