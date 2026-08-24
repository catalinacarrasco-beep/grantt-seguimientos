import ExcelJS from 'exceljs'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { id, invoiceNum, proveedor, dinNum, fechaLlegada, fechaControl, productos, veredicto, accionTomada, userEmail } = req.body

    const wb = new ExcelJS.Workbook()
    wb.creator = 'Grantt AutoSeguimiento'
    wb.created = new Date()

    // ── Hoja 1: Resumen ────────────────────────────────────────────────
    const ws = wb.addWorksheet('Control de Calidad', {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
    })

    ws.columns = [
      { width: 24 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 },
    ]

    const title = ws.addRow(['CONTROL DE CALIDAD — CANALETAS'])
    ws.mergeCells('A1:F1')
    title.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
    title.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } }
    title.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
    title.height = 26

    ws.addRow([])
    ws.addRow(['Invoice', invoiceNum || '—', '', 'Fecha control', fechaControl || '', ''])
    ws.addRow(['Proveedor', proveedor || '—', '', 'DIN', dinNum || '—', ''])
    ws.addRow(['Fecha llegada', fechaLlegada || '—', '', 'Ejecutado por', userEmail || '—', ''])
    ws.addRow(['ID interno', id || '—', '', '', '', ''])
    for (let r = 3; r <= 6; r++) {
      ws.getCell(`A${r}`).font = { bold: true, color: { argb: 'FF64748B' } }
      ws.getCell(`D${r}`).font = { bold: true, color: { argb: 'FF64748B' } }
    }

    ws.addRow([])
    const veredictoRow = ws.addRow(['VEREDICTO', String(veredicto || '').toUpperCase()])
    ws.mergeCells(`B${veredictoRow.number}:F${veredictoRow.number}`)
    veredictoRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF1E293B' } }
    veredictoRow.getCell(2).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
    const veredictoColor = veredicto === 'aprobado' ? 'FF16A34A' : veredicto === 'observaciones' ? 'FFEAB308' : 'FFDC2626'
    veredictoRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: veredictoColor } }
    veredictoRow.getCell(2).alignment = { horizontal: 'center' }
    veredictoRow.height = 24

    if (accionTomada) {
      const arow = ws.addRow(['Acción tomada', accionTomada])
      ws.mergeCells(`B${arow.number}:F${arow.number}`)
      arow.getCell(1).font = { bold: true, color: { argb: 'FF64748B' } }
      arow.getCell(2).alignment = { wrapText: true, vertical: 'top' }
      arow.height = 40
    }

    ws.addRow([])

    // ── Sección: Productos controlados ────────────────────────────────
    const header = ws.addRow(['MEDICIONES POR PRODUCTO'])
    ws.mergeCells(`A${header.number}:F${header.number}`)
    header.getCell(1).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
    header.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
    header.getCell(1).alignment = { horizontal: 'center' }

    for (const p of (productos || [])) {
      ws.addRow([])
      const prodTitle = ws.addRow([p.modelo, p.nombre])
      ws.mergeCells(`B${prodTitle.number}:F${prodTitle.number}`)
      prodTitle.getCell(1).font = { bold: true, size: 12 }
      prodTitle.getCell(2).font = { italic: true, color: { argb: 'FF64748B' } }

      ws.addRow(['Cantidad lote', p.cantidad || '', '', 'Muestras', p.muestras || '', ''])

      // Espesor
      const eh = ws.addRow(['Espesor'])
      eh.getCell(1).font = { bold: true, color: { argb: 'FF4338CA' } }
      const e = p.espesor || {}
      const tolStr = e.tipoTol === 'pct' ? `${e.tolerancia}%` : `${e.tolerancia} ${e.unidad || 'mm'}`
      ws.addRow(['Declarado', `${e.declarado ?? '—'} ${e.unidad || ''}`, 'Tolerancia', tolStr, 'Veredicto', String(e.veredicto || '').toUpperCase()])
      ws.addRow(['Mediciones', (e.mediciones || []).join(', '), '', '', '', ''])
      ws.addRow(['Promedio', e.avg?.toFixed?.(3) ?? '—', 'Mínimo', e.min?.toFixed?.(3) ?? '—', 'Máximo', e.max?.toFixed?.(3) ?? '—'])
      const vColor = e.veredicto === 'cumple' ? 'FF16A34A' : e.veredicto === 'no_cumple' ? 'FFDC2626' : 'FF64748B'
      const espHeaderRow = eh.number + 1
      ws.getCell(`F${espHeaderRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      ws.getCell(`F${espHeaderRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: vColor } }
      ws.getCell(`F${espHeaderRow}`).alignment = { horizontal: 'center' }

      // Resistencia
      const rh = ws.addRow(['Resistencia'])
      rh.getCell(1).font = { bold: true, color: { argb: 'FF4338CA' } }
      const r = p.resistencia || {}
      ws.addRow(['Deformación', r.deformacion ? 'SÍ' : 'NO', '', 'Resultado', String(r.resultado || '').toUpperCase(), ''])
      const rResRow = rh.number + 1
      const rColor = r.resultado === 'cumple' ? 'FF16A34A' : r.resultado === 'no_cumple' ? 'FFDC2626' : 'FF64748B'
      ws.getCell(`E${rResRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      ws.getCell(`E${rResRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rColor } }
      ws.getCell(`E${rResRow}`).alignment = { horizontal: 'center' }
      if (r.descripcion) {
        const drow = ws.addRow(['Descripción', r.descripcion])
        ws.mergeCells(`B${drow.number}:F${drow.number}`)
        drow.getCell(2).alignment = { wrapText: true, vertical: 'top' }
        drow.height = Math.min(80, Math.max(20, Math.ceil(String(r.descripcion).length / 80) * 15))
      }

      // Otras verificaciones
      const oh = ws.addRow(['Otras verificaciones'])
      oh.getCell(1).font = { bold: true, color: { argb: 'FF4338CA' } }
      const checklist = (p.otras && p.otras.checklist) || []
      for (const c of checklist) {
        const okStr = c.ok === true ? 'SÍ' : c.ok === false ? 'NO' : '—'
        const okColor = c.ok === true ? 'FF16A34A' : c.ok === false ? 'FFDC2626' : 'FF64748B'
        const cr = ws.addRow(['', c.item, okStr, c.nota || '', '', ''])
        cr.getCell(3).font = { bold: true, color: { argb: 'FFFFFFFF' } }
        cr.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: okColor } }
        cr.getCell(3).alignment = { horizontal: 'center' }
      }
      if (p.otras && p.otras.libre) {
        const lr = ws.addRow(['Observaciones', p.otras.libre])
        ws.mergeCells(`B${lr.number}:F${lr.number}`)
        lr.getCell(2).alignment = { wrapText: true, vertical: 'top' }
      }

      // Observaciones del producto
      if (p.observaciones) {
        const obs = ws.addRow(['Observaciones', p.observaciones])
        ws.mergeCells(`B${obs.number}:F${obs.number}`)
        obs.getCell(2).alignment = { wrapText: true, vertical: 'top' }
      }

      // Fotos
      const fotos = p.fotos || []
      if (fotos.length) {
        const fh = ws.addRow(['Fotos', `${fotos.length} archivo(s) en Drive`])
        fh.getCell(1).font = { bold: true, color: { argb: 'FF4338CA' } }
        for (const f of fotos) {
          const fr = ws.addRow(['', f.name, f.webViewLink || f.driveId || ''])
          ws.mergeCells(`C${fr.number}:F${fr.number}`)
          if (f.webViewLink) {
            fr.getCell(3).value = { text: f.webViewLink, hyperlink: f.webViewLink }
            fr.getCell(3).font = { color: { argb: 'FF4338CA' }, underline: true }
          }
        }
      }
    }

    // Borde final en todo el rango usado
    const totalRows = ws.rowCount
    for (let r = 1; r <= totalRows; r++) {
      for (let c = 1; c <= 6; c++) {
        const cell = ws.getCell(r, c)
        if (!cell.border) cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        }
      }
    }

    const buffer = await wb.xlsx.writeBuffer()
    return res.json({ base64: Buffer.from(buffer).toString('base64') })

  } catch (error) {
    console.error('Canaletas report error:', error)
    return res.status(500).json({ error: error.message })
  }
}
