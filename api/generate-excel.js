import * as XLSX from 'xlsx'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { rows, invoiceNum, dinNum, fechaSolicitud } = req.body

    const wb = XLSX.utils.book_new()
    const wsData = []

    // Row 1
    wsData.push(['FORM 131-503-001', '', '', 'Rev. 03   Jun-2025', '', '', '', '', '', '', '', '', ''])
    // Row 2
    wsData.push(['', 'SOLICITUD DE CERTIFICACIÓN DE SEGUIMIENTOS MÁS DECLARACIÓN DE CONFORMIDAD', '', '', '', '', '', '', '', '', '', '', ''])
    // Row 3
    wsData.push(['', 'Fecha Solicitud', '', fechaSolicitud, '', '', '', '', '', '', '', '', ''])
    // Row 4
    wsData.push(['', 'Razón social del solicitante', '', 'Representaciones Grantt Ltda', '', '', '', '', '', '', '', '', ''])
    // Row 5
    wsData.push(['', 'RUT del solicitante', '', '99.582.120-6', '', '', '', '', '', '', '', '', ''])
    // Row 6
    wsData.push(['', 'Nombre del representante legal', '', 'Cristobal Vigil', '', '', '', '', '', '', '', '', ''])
    // Row 7
    wsData.push(['', 'Rut del representante legal', '', '10.288.069-2', '', '', '', '', '', '', '', '', ''])
    // Row 8
    wsData.push(['', 'Lugar a realizar el muestreo', '', 'Santa Margarita #0742, San Bernardo', '', '', '', '', '', '', '', '', ''])
    // Row 9
    wsData.push(['', 'Ensayo solicitado (Seguimiento, Producción, Comercio)', '', 'Seguimiento', '', '', '', '', '', '', '', '', ''])
    // Row 10 - Column headers (exact original order)
    // A=N°Solicitud, B=Producto, C=Protocolo, D=Modelo, E=Cantidad, F=N°Muestra, G=Trazabilidad, H=QR, I=Sistema, J=Rango, K=DIN, L=Items, M=Invoice
    wsData.push([
      '\xa0\xa0 N.º de SOLICITUD\n(Llenado por organismo certificador)',
      'Producto',
      'Protocolo',
      'Modelo',
      'Cantidad del producto, tamaño del lote o partida',
      '\xa0\xa0 N.º de MUESTRA   \xa0(Llenado por organismo certificador)',
      'Identificación o trazabilidad (N° de serie o mes año)',
      'N° del código QR o N° de certificado de aprobación',
      'Sistema de certificacion',
      'Rango de control \n(Solo aplica sistema 2)',
      'Nº DIN\n (Indicar y adjuntarla en mail)',
      'ítems en DIN  ',
      'Invoice o Factura (Indicar y Adjuntarla en mail)'
    ])

    // Product rows - NOTE: original has B=Protocolo, C=Producto (description)
    // Col A = empty (N°solicitud filled by Cesmec)
    // Col B = Protocolo
    // Col C = Descripcion (nombre)
    // Col D = Modelo
    // Col E = Cantidad
    // Col F = empty (N°muestra filled by Cesmec)
    // Col G = Trazabilidad
    // Col H = QR
    // Col I = Sistema
    // Col J = empty (Rango control)
    // Col K = DIN
    // Col L = Item DIN
    // Col M = Invoice
    for (const r of rows) {
      wsData.push([
        '',           // A: N° solicitud (Cesmec)
        r.proto,      // B: Protocolo
        r.nombre,     // C: Descripción producto
        r.modelo,     // D: Modelo
        r.cantidad,   // E: Cantidad
        '',           // F: N° muestra (Cesmec)
        r.trazabilidad, // G: Trazabilidad
        r.qr,         // H: QR/Certificado
        r.sistema,    // I: Sistema certificación
        '',           // J: Rango control
        dinNum,       // K: N° DIN
        r.itemDin,    // L: Ítem DIN
        invoiceNum    // M: Invoice
      ])
    }

    // Empty rows until row 24
    const currentRows = wsData.length
    for (let i = currentRows; i < 24; i++) {
      wsData.push(['', '', '', '', '', '', '', '', '', '', '', '', ''])
    }

    // Row 25 - Important note + Cesmec section
    wsData.push([
      'IMPORTANTE: \nLos modelos individualizados en esta solicitud son los que deberán estar presentes en el momento del muestreo.',
      '', '', '', '', '', '',
      'Revisión de la Solicitud (Uso exclusivo Cesmec)', '', 'Nombre de contacto', '', '', ''
    ])
    wsData.push(['', '', '', '', '', '', '', 'Revisó', '', '', '', '', ''])
    wsData.push(['', '', '', '', '', '', '', 'Fecha revisión', '', '', '', '', ''])
    wsData.push(['', '', '', '', '', '', '', 'Veredicto (Conforme - Incompleta - Errónea)', '', '', '', '', ''])
    wsData.push(['Observaciones: ', '', '', '', '', '', '', '', '', 'Firma', '', '', ''])

    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Column widths matching original
    ws['!cols'] = [
      { wch: 28 }, // A
      { wch: 20 }, // B
      { wch: 38 }, // C
      { wch: 16 }, // D
      { wch: 12 }, // E
      { wch: 20 }, // F
      { wch: 15 }, // G
      { wch: 22 }, // H
      { wch: 22 }, // I
      { wch: 18 }, // J
      { wch: 22 }, // K
      { wch: 12 }, // L
      { wch: 22 }, // M
    ]

    // Row heights
    ws['!rows'] = Array(wsData.length).fill({ hpt: 30 })
    if (ws['!rows'][9]) ws['!rows'][9] = { hpt: 45 } // header row taller

    XLSX.utils.book_append_sheet(wb, ws, 'SOLICITUD DE INSPECCION')

    const buf = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
    return res.json({ base64: buf })

  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
