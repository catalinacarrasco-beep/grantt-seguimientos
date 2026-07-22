export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { base64, type } = req.body
    const buffer = Buffer.from(base64, 'base64')
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
    const pdfData = await pdfParse(buffer)
    const text = pdfData.text.replace(/[^\x20-\x7E\n]/g, ' ').substring(0, 50000)

    // DINs: deterministic regex extraction (no Claude dependency).
    // Claude stops reading at page-break signatures and misses late-page items.
    if (type === 'din') {
      const items = []
      let m

      // Items 2+: "ITEM  N Nombre ... qty.000000 PCS"
      const qRe = /ITEM\s+(\d+)\s+Nombre[\s\S]{1,1000}?0*(\d+)\.000000\s*PCS/gi
      while ((m = qRe.exec(text)) !== null) {
        if (!items.find(i => i.itemNum === m[1]))
          items.push({ itemNum: m[1], quantity: parseInt(m[2], 10), description: '' })
      }

      // Item 1: header is "ITEM Nombre" (no number) — isolate its text block
      const firstItem = text.indexOf('ITEM')
      const item2pos = text.indexOf('ITEM  2')
      if (firstItem >= 0 && item2pos > firstItem && !items.find(i => i.itemNum === '1')) {
        const block = text.substring(firstItem, item2pos)
        const qm = block.match(/0*(\d+)\.000000\s*PCS/i)
        if (qm) items.unshift({ itemNum: '1', quantity: parseInt(qm[1], 10), description: '' })
      }

      // Supplier codes for items 2+: "-F; CODE"
      const cRe = /ITEM\s+(\d+)\s+Nombre[\s\S]{1,600}?(?:NINGBO(?:\s+YLK)?-F|BO-F|FEISHUN-F);\s*([A-Z0-9][A-Z0-9-]{0,9})/gi
      while ((m = cRe.exec(text)) !== null) {
        const it = items.find(i => i.itemNum === m[1])
        if (it && !it.supplierCode) it.supplierCode = m[2].trim()
      }

      // Item 1 supplier code: text wraps "YLK-\n.F; CODE;" so match ".F; DIGITS"
      if (firstItem >= 0 && item2pos > firstItem) {
        const block = text.substring(firstItem, item2pos)
        const cm = block.match(/[.\s]F;\s*(\d{4,6})\b/)
        if (cm) {
          const item1 = items.find(i => i.itemNum === '1')
          if (item1 && !item1.supplierCode) item1.supplierCode = cm[1]
        }
      }

      const dinMatch = text.match(/\b(\d{10}-\d)\b/)

      if (items.length > 0) {
        items.sort((a, b) => parseInt(a.itemNum) - parseInt(b.itemNum))
        const result = { dinNum: dinMatch ? dinMatch[1] : '', items }
        return res.status(200).json({
          content: [{ type: 'text', text: JSON.stringify(result) }]
        })
      }
    }

    // Invoices (or DINs where regex found nothing): use Claude
    const prompt = type === 'invoice'
      ? `Extract from this commercial invoice text.
Return ONLY valid JSON, no markdown, no extra text.
Format: {"invoiceNum":"26FS-0301-3","trazabilidad":"04/2026","products":[{"modelo":"09431","cantidad":10416}]}
- invoiceNum: invoice reference number
- trazabilidad: invoice date as MM/YYYY
- modelo: if TWO code columns exist, use ONLY the shorter numeric code (like "09431"), NOT the supplier code with dashes (like "09431-Z-BOLT")
- cantidad: integer PCS quantity only

TEXT:
${text}`
      : `Extract from this Chilean DIN (Declaracion de Ingreso de Aduanas) text.
Return ONLY valid JSON, no markdown, no extra text.
Format: {"dinNum":"3630753019-2","items":[{"itemNum":"1","quantity":20160,"description":"PORTALAMPARAS E27"},{"itemNum":"2","quantity":1000,"description":"EXTENSION CABLE CONDUCTOR","supplierCode":"99089"}]}
- dinNum: NUMERO DE IDENTIFICACION (format XXXXXXXXXX-X)
- items: extract ALL items
- quantity: integer PCS only (pattern "000006000.000000 PCS" -> 6000). Must be integer.
- supplierCode: code after any "-F;" pattern (e.g. "NINGBO YLK-F; 99002;" -> "99002"). Extract for every item.
- IMPORTANT: Exclude items whose description contains: PVC, CANALETA, TRUNKING, DUCTO, CONDUIT, CARRETE, CARRETES, ACCESORIO, FITTING, BRACKET, CLIPS, TAPA, UNION, CURVA, TEE

TEXT:
${text}`

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    return res.status(claudeRes.status).json(await claudeRes.json())
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
