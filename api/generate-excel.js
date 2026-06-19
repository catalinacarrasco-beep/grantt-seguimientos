import * as XLSX from 'xlsx'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { rows, invoiceNum, dinNum, fechaSolicitud } = req.body

    const wb = XLSX.utils.book_new()

    // Build worksheet data as array of arrays
    const ws = {}
    const range = { s: { c: 0, r: 0 }, e: { c: 12, r: 31 } }

    const s = (v, bold = false, bg = null, color = 'FF000000', sz = 8, wrap = true, ha = 'center', va = 'center') => ({
      v, s: {
        font: { name: 'Calibri', sz, bold, color: { rgb: color } },
        fill: bg ? { fgColor: { rgb: bg }, patternType: 'solid' } : undefined,
        alignment: { horizontal: ha, vertical: va, wrapText: wrap },
        border: {
          top: { style: 'thin', color: { rgb: 'FF000000' } },
          bottom: { style: 'thin', color: { rgb: 'FF000000' } },
          left: { style: 'thin', color: { rgb: 'FF000000' } },
          right: { style: 'thin', color: { rgb: 'FF000000' } },
        }
      }
    })

    const NAVY = '1F3864'
    const BLUE = 'BDD7EE'
    const YELLOW = 'FFC000'
    const WHITE = 'FFFFFF'
    const RED = 'FF0000'

    const setCell = (r, c, obj) => {
      const ref = XLSX.utils.encode_cell({ r, c })
      ws[ref] = obj
    }

    // Row 0: FORM number
    setCell(0, 0, { v: 'FORM 131-503-001', s: { font: { name: 'Calibri', bold: true, sz: 9 } } })
    setCell(0, 3, { v: 'Rev. 03   Jun-2025', s: { font: { name: 'Calibri', sz: 8 }, alignment: { horizontal: 'right' } } })

    // Row 1: Title
    setCell(1, 1, s('SOLICITUD DE CERTIFICACIÓN DE SEGUIMIENTOS MÁS DECLARACIÓN DE CONFORMIDAD', true, NAVY, WHITE, 11))

    // Rows 2-8: Info fields
    const info = [
      [2, 'Fecha Solicitud', fechaSolicitud],
      [3, 'Razón social del solicitante', 'Representaciones Grantt Ltda'],
      [4, 'RUT del solicitante', '99.582.120-6'],
      [5, 'Nombre del representante legal', 'Cristobal Vigil'],
      [6, 'Rut del representante legal', '10.288.069- 2'],
      [7, 'Lugar a realizar el muestreo', 'Santa Margarita #0742, San Bernardo'],
      [8, 'Ensayo solicitado (Seguimiento, Producción, Comercio)', 'Seguimiento'],
    ]
    for (const [r, label, val] of info) {
      setCell(r, 1, s(label, true, BLUE, '000000', 9, true, 'left'))
      setCell(r, 3, s(val, false, null, '000000', 9, true, 'left'))
    }

    // Row 9: Column headers
    const hdrs = [
      'N.º de SOLICITUD\n(Llenado por\norganismo\ncertificador)',
      'Producto', 'Protocolo', 'Modelo',
      'Cantidad del\nproducto,\ntamaño del\nlote o partida',
      'N.º de MUESTRA\n(Llenado por\norganismo\ncertificador)',
      'Identificación o\ntrazabilidad\n(N° de serie o\nmes año)',
      'N° del código\nQR o N° de\ncertificado de\naprobación',
      'Sistema de\ncertificacion',
      'Rango de\ncontrol\n(Solo aplica\nsistema 2)',
      'Nº DIN\n(Indicar y\nadjuntarla\nen mail)',
      'ítems\nen DIN',
      'Invoice o\nFactura\n(Indicar y\nAdjuntarla\nen mail)',
    ]
    hdrs.forEach((h, c) => {
      const bg = c === 5 ? YELLOW : NAVY
      const col = c === 5 ? '000000' : WHITE
      setCell(9, c, s(h, true, bg, col, 8))
    })

    // Rows 10-11: spacers
    for (let c = 0; c < 13; c++) {
      setCell(10, c, s('', false, null, '000000', 8))
      setCell(11, c, s('', false, null, '000000', 8))
    }

    // Rows 12-23: Product rows (start at row 12 = Excel row 13)
    for (let i = 0; i < 12; i++) {
      const r = 12 + i
      const row = rows[i]
      const vals = row
        ? ['', row.proto, row.nombre, row.modelo, row.cantidad, '', row.trazabilidad, row.qr, row.sistema, '', dinNum, row.itemDin, invoiceNum]
        : Array(13).fill('')
      vals.forEach((v, c) => setCell(r, c, s(v, false, null, '000000', 8)))
    }

    // Row 24: IMPORTANTE
    setCell(24, 0, {
      v: 'IMPORTANTE: \nLos modelos individualizados en esta planilla serán revisados con los antecedentes indicados en el Certificado de Aprobación.\nAnte cualquier cambio del producto en relación al tipo inicialmente aprobado, se deberá informar por escrito al Organismo de Certificación para ver el procedimiento a seguir.',
      s: { font: { name: 'Calibri', sz: 7, bold: true, color: { rgb: RED } }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true } }
    })
    setCell(24, 8, s('Revisión de la Solicitud (Uso exclusivo Cesmec)', true, BLUE, '000000', 8))
    setCell(24, 11, s('Nombre de contacto', true, null, '000000', 8))

    // Rows 25-27: Revisión fields
    const revFields = ['Revisó', 'Fecha revisión', 'Veredicto (Conforme - Incompleta - Errónea)']
    revFields.forEach((f, i) => {
      setCell(25 + i, 8, s(f, true, BLUE, '000000', 8, true, 'left'))
    })

    // Row 25: Declaración
    setCell(25, 0, {
      v: 'DECLARACIÓN:\nDeclaro que los productos que componen la producción o partida presentada para certificación mediante las solicitudes indicadas en el presente archivo, sigue siendo conformes con el tipo aprobado y que de no ser verdadera la información declarada, me someto a las correspondientes sanciones terminadas por la Superintendencia de Electricidad y combustible va a que se haga efectiva toda la responsabilidad civil y penal establecida en el legislación chilena.',
      s: { font: { name: 'Calibri', sz: 7, bold: true }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true } }
    })

    // Row 28: Observaciones + Firma
    setCell(28, 0, s('Observaciones:', true, null, '000000', 9, false, 'left'))
    setCell(28, 8, s('Firma', true, BLUE, '000000', 9))

    // Merges
    ws['!merges'] = [
      { s: { r: 1, c: 1 }, e: { r: 1, c: 12 } },   // Title
      ...info.map(([r]) => ({ s: { r, c: 1 }, e: { r, c: 2 } })),  // Labels
      ...info.map(([r]) => ({ s: { r, c: 3 }, e: { r, c: 12 } })), // Values
      { s: { r: 24, c: 0 }, e: { r: 24, c: 7 } },  // IMPORTANTE
      { s: { r: 24, c: 8 }, e: { r: 24, c: 10 } }, // Revisión header
      { s: { r: 24, c: 11 }, e: { r: 24, c: 12 } }, // Nombre contacto
      { s: { r: 25, c: 0 }, e: { r: 27, c: 7 } },  // Declaración
      { s: { r: 25, c: 8 }, e: { r: 25, c: 10 } },
      { s: { r: 25, c: 11 }, e: { r: 25, c: 12 } },
      { s: { r: 26, c: 8 }, e: { r: 26, c: 10 } },
      { s: { r: 26, c: 11 }, e: { r: 26, c: 12 } },
      { s: { r: 27, c: 8 }, e: { r: 27, c: 10 } },
      { s: { r: 27, c: 11 }, e: { r: 27, c: 12 } },
      { s: { r: 28, c: 0 }, e: { r: 28, c: 7 } },  // Observaciones
      { s: { r: 28, c: 8 }, e: { r: 28, c: 12 } },  // Firma
    ]

    ws['!ref'] = XLSX.utils.encode_range(range)
    ws['!cols'] = [
      { wch: 19 }, { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 10 },
      { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
      { wch: 16 }, { wch: 9 }, { wch: 16 }
    ]
    ws['!rows'] = [
      {}, {hpt:30}, {}, {}, {}, {}, {}, {}, {}, {hpt:50},
      {hpt:6}, {hpt:6},
      ...Array(12).fill({hpt:14}),
      {hpt:50}, {hpt:14}, {hpt:50}, {hpt:14}, {hpt:20}
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'SOLICITUD DE INSPECCION')
    const buf = XLSX.write(wb, { type: 'base64', bookType: 'xlsx', cellStyles: true })
    return res.json({ base64: buf })

  } catch (error) {
    console.error('Excel error:', error)
    return res.status(500).json({ error: error.message })
  }
}
