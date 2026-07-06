export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { base64, type } = req.body
    const buffer = Buffer.from(base64, 'base64')
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
    const pdfData = await pdfParse(buffer)
    const text = pdfData.text.replace(/[^\x20-\x7E\n]/g, ' ').substring(0, 15000)

    // For DINs: pre-extract item data via regex as a deterministic fallback.
    // Claude stops at page-break signatures ("SERVICIO NACIONAL DE ADUANAS...")
    // and silently misses items on later continuation pages.
    // Require "Nombre" after item number to avoid matching "Total item\n13" footer lines.
    const preExtracted = {}
    if (type === 'din') {
      const qRe = /ITEM\s+(\d+)\s+Nombre[\s\S]{1,1000}?0*(\d+)\.000000\s*PCS/gi
      let m
      while ((m = qRe.exec(text)) !== null) {
        if (!preExtracted[m[1]]) preExtracted[m[1]] = { quantity: parseInt(m[2], 10) }
      }
      const cRe = /ITEM\s+(\d+)\s+Nombre[\s\S]{1,600}?(?:NINGBO(?:\s+YLK)?-F|BO-F|FEISHUN-F);\s*([A-Z0-9][A-Z0-9-]{0,9})/gi
      while ((m = cRe.exec(text)) !== null) {
        if (preExtracted[m[1]]) preExtracted[m[1]].supplierCode = m[2].trim()
        else preExtracted[m[1]] = { supplierCode: m[2].trim() }
      }
    }

    const nItems = Object.keys(preExtracted).length
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
- items: extract ALL items. This DIN has ${nItems > 0 ? nItems + ' items' : 'multiple items'} across multiple "DECLARACION DE INGRESO" pages — extract from ALL pages, including after "FIRMA IMPORTADOR" sections.
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
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await claudeRes.json()

    // Post-process: fill missing supplier codes AND inject items Claude missed entirely
    if (type === 'din' && Object.keys(preExtracted).length && data.content?.[0]?.text) {
      try {
        const ct = data.content[0].text
        const jm = ct.match(/\{[\s\S]*\}/)
        if (jm) {
          const parsed = JSON.parse(jm[0])
          parsed.items = parsed.items || []
          let changed = false
          const seen = new Set(parsed.items.map(i => String(i.itemNum)))

          // Fill missing supplier codes for items Claude extracted
          for (const item of parsed.items) {
            const key = String(item.itemNum)
            if (!item.supplierCode && preExtracted[key] && preExtracted[key].supplierCode) {
              item.supplierCode = preExtracted[key].supplierCode
              changed = true
            }
          }

          // Inject items Claude missed entirely (requires quantity from regex)
          for (const itemNum of Object.keys(preExtracted)) {
            if (!seen.has(itemNum) && preExtracted[itemNum].quantity) {
              const pre = preExtracted[itemNum]
              const newItem = { itemNum, quantity: pre.quantity, description: '' }
              if (pre.supplierCode) newItem.supplierCode = pre.supplierCode
              parsed.items.push(newItem)
              changed = true
            }
          }

          if (changed) data.content[0].text = ct.replace(jm[0], JSON.stringify(parsed))
        }
      } catch (_) {}
    }

    return res.status(claudeRes.status).json(data)
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
