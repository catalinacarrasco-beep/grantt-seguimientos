import * as XLSX from 'xlsx'

const LOGO_B64 = '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'

const NAVY = '1F3864'
const BLUE = 'BDD7EE'
const YELLOW = 'FFC000'
const WHITE = 'FFFFFF'
const RED = 'FF0000'

function s(v, bold=false, bg=null, color='FF000000', sz=8, wrap=true, ha='center', va='center') {
  return {
    v: v ?? '',
    t: typeof v === 'number' ? 'n' : 's',
    s: {
      font: { name: 'Calibri', sz, bold, color: { rgb: color } },
      fill: bg ? { fgColor: { rgb: bg }, patternType: 'solid' } : { patternType: 'none' },
      alignment: { horizontal: ha, vertical: va, wrapText: wrap },
      border: {
        top: { style: 'thin', color: { rgb: 'FF000000' } },
        bottom: { style: 'thin', color: { rgb: 'FF000000' } },
        left: { style: 'thin', color: { rgb: 'FF000000' } },
        right: { style: 'thin', color: { rgb: 'FF000000' } },
      }
    }
  }
}

function nb(v, bold=false, color='FF000000', sz=8, ha='left') {
  return {
    v: v ?? '', t: 's',
    s: { font: { name: 'Calibri', sz, bold, color: { rgb: color } }, alignment: { horizontal: ha, wrapText: true } }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { rows, invoiceNum, dinNum, fechaSolicitud } = req.body
    const wb = XLSX.utils.book_new()
    const ws = {}

    const set = (r, c, obj) => { ws[XLSX.utils.encode_cell({ r, c })] = obj }

    // Row 0: FORM + Rev
    set(0, 0, nb('FORM 131-503-001', true, '000000', 9))
    set(0, 3, nb('Rev. 03   Jun-2025', false, '000000', 8, 'right'))

    // Row 1: Title (merged B2:M2)
    set(1, 1, s('SOLICITUD DE CERTIFICACIÓN DE SEGUIMIENTOS MÁS DECLARACIÓN DE CONFORMIDAD', true, NAVY, WHITE, 11))

    // Rows 2-8: Info fields
    const info = [
      [2, 'Fecha Solicitud', fechaSolicitud],
      [3, 'Razón social del solicitante', 'Representaciones Grantt Ltda'],
      [4, 'RUT del solicitante', '99.582.120-6'],
      [5, 'Nombre del representante legal', 'Cristobal Vigil'],
      [6, 'Rut del representante legal', '10.288.069-2'],
      [7, 'Lugar a realizar el muestreo', 'Santa Margarita #0742, San Bernardo'],
      [8, 'Ensayo solicitado (Seguimiento, Producción, Comercio)', 'Seguimiento'],
    ]
    for (const [r, label, val] of info) {
      set(r, 1, s(label, true, BLUE, '000000', 9, true, 'left'))
      set(r, 3, s(val, false, null, '000000', 9, true, 'left'))
    }

    // Row 9: Column headers
    const hdrs = [
      'N.º de SOLICITUD\n(Llenado por\norganismo\ncertificador)',
      'Producto','Protocolo','Modelo',
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
      set(9, c, s(h, true, bg, col, 8))
    })

    // Rows 10-11: spacers
    for (let i = 10; i <= 11; i++)
      for (let c = 0; c < 13; c++) set(i, c, s(''))

    // Rows 12-23: Product rows
    for (let i = 0; i < 12; i++) {
      const r = 12 + i
      const row = rows[i]
      const vals = row
        ? ['', row.proto, row.nombre, row.modelo, row.cantidad, '', row.trazabilidad, String(row.qr), row.sistema, '', dinNum, row.itemDin, invoiceNum]
        : Array(13).fill('')
      vals.forEach((v, c) => {
        const cell = s(v, false, null, '000000', 8)
        if (typeof v === 'number') cell.t = 'n'
        set(r, c, cell)
      })
    }

    // Row 24: IMPORTANTE + Revisión
    set(24, 0, {
      v: 'IMPORTANTE: \nLos modelos individualizados en esta planilla serán revisados con los antecedentes indicados en el Certificado de Aprobación.\nAnte cualquier cambio del producto en relación al tipo inicialmente aprobado, se deberá informar por escrito al Organismo de Certificación para ver el procedimiento a seguir.',
      t: 's', s: { font: { name: 'Calibri', sz: 7, bold: true, color: { rgb: RED } }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true } }
    })
    set(24, 8, s('Revisión de la Solicitud (Uso exclusivo Cesmec)', true, BLUE, '000000', 8))
    set(24, 11, s('Nombre de contacto', true, null, '000000', 8))

    // Rows 25-27: Declaración + Revisión fields
    set(25, 0, {
      v: 'DECLARACIÓN:\nDeclaro que los productos que componen la producción o partida presentada para certificación mediante las solicitudes indicadas en el presente archivo, sigue siendo conformes con el tipo aprobado y que de no ser verdadera la información declarada, me someto a las correspondientes sanciones terminadas por la Superintendencia de Electricidad y combustible.',
      t: 's', s: { font: { name: 'Calibri', sz: 7, bold: true }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true } }
    })
    ;[['Revisó', 25], ['Fecha revisión', 26], ['Veredicto (Conforme - Incompleta - Errónea)', 27]].forEach(([label, r]) => {
      set(r, 8, s(label, true, BLUE, '000000', 8, true, 'left'))
      set(r, 11, s('', false, null, '000000', 8))
    })

    // Row 28: Observaciones + Firma
    set(28, 0, nb('Observaciones:', true, '000000', 9))
    set(28, 8, s('Firma', true, BLUE, '000000', 9))

    // Merges
    ws['!merges'] = [
      { s: {r:1,c:1}, e: {r:1,c:12} },
      ...info.map(([r]) => ({ s: {r,c:1}, e: {r,c:2} })),
      ...info.map(([r]) => ({ s: {r,c:3}, e: {r,c:12} })),
      { s: {r:9,c:0}, e: {r:10,c:0} },
      { s: {r:24,c:0}, e: {r:24,c:7} },
      { s: {r:24,c:8}, e: {r:24,c:10} },
      { s: {r:24,c:11}, e: {r:24,c:12} },
      { s: {r:25,c:0}, e: {r:27,c:7} },
      { s: {r:25,c:8}, e: {r:25,c:10} }, { s: {r:25,c:11}, e: {r:25,c:12} },
      { s: {r:26,c:8}, e: {r:26,c:10} }, { s: {r:26,c:11}, e: {r:26,c:12} },
      { s: {r:27,c:8}, e: {r:27,c:10} }, { s: {r:27,c:11}, e: {r:27,c:12} },
      { s: {r:28,c:0}, e: {r:28,c:7} },
      { s: {r:28,c:8}, e: {r:28,c:12} },
    ]

    ws['!ref'] = XLSX.utils.encode_range({ s: {r:0,c:0}, e: {r:30,c:12} })
    ws['!cols'] = [
      {wch:19},{wch:14},{wch:30},{wch:14},{wch:10},
      {wch:14},{wch:12},{wch:16},{wch:16},{wch:14},
      {wch:16},{wch:9},{wch:16}
    ]
    ws['!rows'] = [
      {hpt:14},{hpt:30},
      {hpt:14},{hpt:14},{hpt:14},{hpt:14},{hpt:14},{hpt:14},{hpt:14},
      {hpt:52},{hpt:6},{hpt:6},
      ...Array(12).fill({hpt:14}),
      {hpt:50},{hpt:14},{hpt:50},{hpt:14},{hpt:20}
    ]

    // Add logo image
    if (!ws['!images']) ws['!images'] = []
    ws['!images'].push({
      name: 'logo_cesmec.png',
      data: LOGO_B64,
      opts: { base64: true },
      position: {
        type: 'twoCellAnchor',
        attrs: { editAs: 'oneCell' },
        from: { col: 0, colOff: 20000, row: 1, rowOff: 20000 },
        to:   { col: 1, colOff: 0,     row: 9, rowOff: 0 },
      }
    })

    XLSX.utils.book_append_sheet(wb, ws, 'SOLICITUD DE INSPECCION')
    const buf = XLSX.write(wb, { type: 'base64', bookType: 'xlsx', cellStyles: true })
    return res.json({ base64: buf })

  } catch (error) {
    console.error('Excel error:', error)
    return res.status(500).json({ error: error.message })
  }
}
