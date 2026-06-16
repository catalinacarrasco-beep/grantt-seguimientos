import * as XLSX from 'xlsx'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { rows, invoiceNum, dinNum, fechaSolicitud } = req.body

    const wb = XLSX.utils.book_new()
    const wsData = []

    // Header rows
    wsData.push(['FORM 131-503-001', '', '', 'Rev. 03   Jun-2025'])
    wsData.push(['', 'SOLICITUD DE CERTIFICACIÓN DE SEGUIMIENTOS MÁS DECLARACIÓN DE CONFORMIDAD'])
    wsData.push(['', 'Fecha Solicitud', '', fechaSolicitud])
    wsData.push(['', 'Razón social del solicitante', '', 'Representaciones Grantt Ltda'])
    wsData.push(['', 'RUT del solicitante', '', '99.582.120-6'])
    wsData.push(['', 'Nombre del representante legal', '', 'Cristobal Vigil'])
    wsData.push(['', 'Rut del representante legal', '', '10.288.069-2'])
    wsData.push(['', 'Lugar a realizar el muestreo', '', 'Santa Margarita #0742, San Bernardo'])
    wsData.push(['', 'Ensayo solicitado (Seguimiento, Producción, Comercio)', '', 'Seguimiento'])

    // Column headers
    wsData.push([
      'N.º de SOLICITUD (Llenado por organismo certificador)',
      'Producto',
      'Protocolo',
      'Modelo',
      'Cantidad del producto, tamaño del lote o partida',
      'N.º de MUESTRA (Llenado por organismo certificador)',
      'Identificación o trazabilidad (N° de serie o mes año)',
      'N° del código QR o N° de certificado de aprobación',
      'Sistema de certificacion',
      'Rango de control (Solo aplica sistema 2)',
      'Nº DIN (Indicar y adjuntarla en mail)',
      'ítems en DIN',
      'Invoice o Factura (Indicar y Adjuntarla en mail)'
    ])

    // Product rows
    for (const r of rows) {
      wsData.push([
        '', // N° solicitud (llenado por organismo)
        r.nombre,
        r.proto,
        r.modelo,
        r.cantidad,
        '', // N° muestra (llenado por organismo)
        r.trazabilidad,
        r.qr,
        r.sistema,
        '', // Rango control
        dinNum,
        r.itemDin,
        invoiceNum
      ])
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Set column widths
    ws['!cols'] = [
      { wch: 30 }, { wch: 35 }, { wch: 25 }, { wch: 18 },
      { wch: 12 }, { wch: 20 }, { wch: 15 }, { wch: 20 },
      { wch: 22 }, { wch: 20 }, { wch: 22 }, { wch: 12 }, { wch: 22 }
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'SOLICITUD DE INSPECCION')

    const buf = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
    return res.json({ base64: buf })

  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
