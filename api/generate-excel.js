import ExcelJS from 'exceljs'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const NAVY = 'FF1F3864'
const BLUE_LIGHT = 'FFBDD7EE'
const YELLOW = 'FFFFC000'
const WHITE = 'FFFFFFFF'
const BLACK = 'FF000000'
const RED = 'FFFF0000'

const thin = { style: 'thin', color: { argb: 'FF000000' } }
const borders = { top: thin, bottom: thin, left: thin, right: thin }

function hdr(cell, text, bg = NAVY, fc = WHITE, sz = 8) {
  cell.value = text
  cell.font = { name: 'Calibri', size: sz, bold: true, color: { argb: fc } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  cell.border = borders
}

function label(cell, text) {
  cell.value = text
  cell.font = { name: 'Calibri', size: 9, bold: true }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_LIGHT } }
  cell.alignment = { horizontal: 'left', vertical: 'middle' }
  cell.border = borders
}

function val(cell, text) {
  cell.value = text
  cell.font = { name: 'Calibri', size: 9 }
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
  cell.border = borders
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { rows, invoiceNum, dinNum, fechaSolicitud } = req.body

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('SOLICITUD DE INSPECCION')

    // Column widths (matching original exactly)
    ws.columns = [
      { width: 25.1 },  // A
      { width: 27.4 },  // B
      { width: 33.6 },  // C
      { width: 19.1 },  // D
      { width: 19.1 },  // E
      { width: 19.1 },  // F
      { width: 19.1 },  // G
      { width: 23.9 },  // H
      { width: 23.1 },  // I
      { width: 19.1 },  // J
      { width: 19.1 },  // K
      { width: 19.1 },  // L
      { width: 19.1 },  // M
    ]

    // ── ROW 1: Form code + revision ──────────────────────────────────────────
    ws.getRow(1).height = 15
    ws.getCell('A1').value = 'FORM 131-503-001'
    ws.getCell('A1').font = { name: 'Calibri', size: 9, bold: true }
    ws.getCell('D1').value = 'Rev. 03   Jun-2025'
    ws.getCell('D1').font = { name: 'Calibri', size: 8 }
    ws.getCell('D1').alignment = { horizontal: 'right' }

    // ── ROW 2: Title (B2:M2 merged, A2:A9 for logo) ─────────────────────────
    ws.getRow(2).height = 42
    ws.mergeCells('B2:M2')
    const title = ws.getCell('B2')
    title.value = 'SOLICITUD DE CERTIFICACIÓN DE SEGUIMIENTOS MÁS DECLARACIÓN DE CONFORMIDAD'
    title.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } }
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    title.alignment = { horizontal: 'center', vertical: 'middle' }

    // ── LOGO (A2:A9 merged) ──────────────────────────────────────────────────
    ws.mergeCells('A2:A9')
    try {
      const logoPath = join(__dirname, 'logo.png')
      const logoBuffer = readFileSync(logoPath)
      const imageId = wb.addImage({ buffer: logoBuffer, extension: 'png' })
      ws.addImage(imageId, { tl: { col: 0, row: 1 }, ext: { width: 110, height: 120 } })
    } catch (e) { console.log('Logo not found, skipping') }

    // ── ROWS 3-9: Info fields ────────────────────────────────────────────────
    const infoRows = [
      [3, 'Fecha Solicitud',                                  fechaSolicitud],
      [4, 'Razón social del solicitante',                     'Representaciones Grantt Ltda'],
      [5, 'RUT del solicitante',                              '99.582.120-6'],
      [6, 'Nombre del representante legal',                   'Cristobal Vigil'],
      [7, 'Rut del representante legal',                      '10.288.069- 2'],
      [8, 'Lugar a realizar el muestreo',                     'Santa Margarita #0742, San Bernardo'],
      [9, 'Ensayo solicitado (Seguimiento, Producción, Comercio)', 'Seguimiento'],
    ]
    const infoHeights = { 3: 14.4, 4: 15.75, 5: 14.4, 6: 14.4, 7: 14.4, 8: 15.75, 9: 15.75 }
    for (const [r, lbl, v] of infoRows) {
      ws.getRow(r).height = infoHeights[r]
      ws.mergeCells(`B${r}:C${r}`)
      ws.mergeCells(`D${r}:M${r}`)
      label(ws.getCell(`B${r}`), lbl)
      val(ws.getCell(`D${r}`), v)
    }

    // ── ROWS 10-12: Headers (3-row merge) ────────────────────────────────────
    ws.getRow(10).height = 27
    ws.getRow(11).height = 24
    ws.getRow(12).height = 27.75

    const cols = ['A','B','C','D','E','F','G','H','I','J','K','L','M']
    cols.forEach(c => ws.mergeCells(`${c}10:${c}12`))

    const headerDefs = [
      { col: 'A', text: 'N.º de SOLICITUD\n(Llenado por organismo\ncertificador)', bg: NAVY, fc: WHITE },
      { col: 'B', text: 'Producto',                                                bg: NAVY, fc: WHITE },
      { col: 'C', text: 'Protocolo',                                               bg: NAVY, fc: WHITE },
      { col: 'D', text: 'Modelo',                                                  bg: NAVY, fc: WHITE },
      { col: 'E', text: 'Cantidad del producto,\ntamaño del lote\no partida',      bg: NAVY, fc: WHITE },
      { col: 'F', text: 'N.º de MUESTRA\n(Llenado por organismo\ncertificador)',   bg: YELLOW, fc: BLACK },
      { col: 'G', text: 'Identificación o\ntrazabilidad\n(N° de serie o mes año)', bg: NAVY, fc: WHITE },
      { col: 'H', text: 'N° del código QR o\nN° de certificado\nde aprobación',    bg: NAVY, fc: WHITE },
      { col: 'I', text: 'Sistema de\ncertificacion',                               bg: NAVY, fc: WHITE },
      { col: 'J', text: 'Rango de control\n(Solo aplica\nsistema 2)',              bg: NAVY, fc: WHITE },
      { col: 'K', text: 'Nº DIN\n(Indicar y adjuntarla\nen mail)',                 bg: NAVY, fc: WHITE },
      { col: 'L', text: 'ítems en DIN',                                            bg: NAVY, fc: WHITE },
      { col: 'M', text: 'Invoice o Factura\n(Indicar y Adjuntarla\nen mail)',      bg: NAVY, fc: WHITE },
    ]
    for (const { col, text, bg, fc } of headerDefs) {
      hdr(ws.getCell(`${col}10`), text, bg, fc, 8)
    }

    // ── ROWS 13-24: Products (12 rows) ───────────────────────────────────────
    for (let i = 0; i < 12; i++) {
      const r = 13 + i
      ws.getRow(r).height = i < 9 ? 27.75 : 15
      for (const c of cols) {
        const cell = ws.getCell(`${c}${r}`)
        cell.border = borders
        cell.font = { name: 'Calibri', size: 8 }
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      }
      const row = rows[i]
      if (row) {
        const bc = ws.getCell(`B${r}`)
        bc.value = row.proto
        bc.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
        const cc = ws.getCell(`C${r}`)
        cc.value = row.nombre
        cc.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
        ws.getCell(`D${r}`).value = row.modelo
        ws.getCell(`E${r}`).value = Number(row.cantidad)
        ws.getCell(`E${r}`).numFmt = '#,##0'
        ws.getCell(`G${r}`).value = row.trazabilidad
        ws.getCell(`H${r}`).value = String(row.qr)
        const ic = ws.getCell(`I${r}`)
        ic.value = row.sistema
        ic.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
        ws.getCell(`K${r}`).value = dinNum
        ws.getCell(`L${r}`).value = row.itemDin
        ws.getCell(`M${r}`).value = invoiceNum
      }
    }

    // ── ROWS 25-28: IMPORTANTE + DECLARACIÓN (left) + review fields (right) ─
    ws.mergeCells('A25:G28')
    const imp = ws.getCell('A25')
    imp.value = 'IMPORTANTE:\nLos modelos individualizados en esta planilla serán revisados con los antecedentes indicados en el Certificado de Aprobación.\nAnte cualquier cambio del producto en relación al tipo inicialmente aprobado, se deberá informar por escrito al Organismo de Certificación para ver el procedimiento a seguir.\n\nDECLARACIÓN:\nDeclaro que los productos que componen la producción o partida presentada para certificación mediante las solicitudes indicadas en el presente archivo, sigue siendo conformes con el tipo aprobado y que de no ser verdadera la información declarada, me someto a las correspondientes sanciones terminadas por la Superintendencia de Electricidad y combustible.'
    imp.font = { name: 'Calibri', size: 7, bold: true, color: { argb: RED } }
    imp.alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
    ws.getRow(25).height = 22.5

    // H25:I25 — Revisión de la Solicitud
    ws.mergeCells('H25:I25')
    const rev = ws.getCell('H25')
    rev.value = 'Revisión de la Solicitud (Uso exclusivo Cesmec)'
    rev.font = { name: 'Calibri', size: 8, bold: true }
    rev.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_LIGHT } }
    rev.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    rev.border = borders

    // J25:M26 — Nombre de contacto
    ws.mergeCells('J25:M26')
    const noc = ws.getCell('J25')
    noc.value = 'Nombre de contacto'
    noc.font = { name: 'Calibri', size: 8, bold: true }
    noc.alignment = { horizontal: 'center', vertical: 'middle' }
    noc.border = borders

    // Row 26 heights
    ws.getRow(26).height = 26.25

    for (const [r, lbl] of [[26, 'Revisó'], [27, 'Fecha revisión'], [28, 'Veredicto (Conforme - Incompleta - Errónea)']]) {
      const lc = ws.getCell(`H${r}`)
      lc.value = lbl
      lc.font = { name: 'Calibri', size: 8, bold: true }
      lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_LIGHT } }
      lc.alignment = { horizontal: 'left', vertical: 'middle' }
      lc.border = borders
      ws.getCell(`I${r}`).border = borders
    }
    ws.getRow(27).height = 24
    ws.getRow(28).height = 33

    // J27:M28 — blank field for contact name value
    ws.mergeCells('J27:M28')
    ws.getCell('J27').border = borders

    // ── ROWS 29-31: Observaciones (left) + Firma (right) ─────────────────────
    ws.getRow(29).height = 15
    ws.mergeCells('A29:I31')
    const obs = ws.getCell('A29')
    obs.value = 'Observaciones:'
    obs.font = { name: 'Calibri', size: 9, bold: true }
    obs.alignment = { horizontal: 'left', vertical: 'top' }
    obs.border = borders

    ws.mergeCells('J29:M29')
    const firma = ws.getCell('J29')
    firma.value = 'Firma'
    firma.font = { name: 'Calibri', size: 9, bold: true }
    firma.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_LIGHT } }
    firma.alignment = { horizontal: 'center', vertical: 'middle' }
    firma.border = borders

    ws.mergeCells('J30:M31')
    ws.getCell('J30').border = borders

    const buffer = await wb.xlsx.writeBuffer()
    const base64 = buffer.toString('base64')
    return res.json({ base64 })

  } catch (error) {
    console.error('Excel error:', error)
    return res.status(500).json({ error: error.message })
  }
}
