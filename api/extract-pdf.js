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

    // For DINs with regex pre-extraction: merge regex (authoritative for qty+supplierCode)
    // with Claude's output (provides descriptions, catches items regex missed like item 1).
    if (type === 'din' && Object.keys(preExtracted).length && data.content?.[0]?.text) {
      try {
        const jm = data.content[0].text.match(/\{[\s\S]*\}/)
        if (jm) {
          const parsed = JSON.parse(jm[0])
          const claudeItems = Array.isArray(parsed.items) ? parsed.items : []

          // Build map of Claude items for description lookup
          const claudeMap = {}
          for (const item of claudeItems) claudeMap[String(item.itemNum)] = item

          // Final list: regex items first (guaranteed quantity + supplierCode),
          // then Claude-only items that regex didn't find (e.g. item 1 from page 1)
          const finalItems = []
          const seen = new Set()

          for (const [itemNum, pre] of Object.entries(preExtracted)) {
            if (!pre.quantity) continue
            const claudeItem = claudeMap[itemNum] || {}
            const entry = { itemNum, quantity: pre.quantity, description: claudeItem.description || '' }
            if (pre.supplierCode) entry.supplierCode = pre.supplierCode
            else if (claudeItem.supplierCode) entry.supplierCode = claudeItem.supplierCode
            finalItems.push(entry)
            seen.add(itemNum)
          }

          for (const item of claudeItems) {
            if (!seen.has(String(item.itemNum))) {
              finalItems.push(item)
              seen.add(String(item.itemNum))
            }
          }

          finalItems.sort((a, b) => parseInt(a.itemNum) - parseInt(b.itemNum))
          parsed.items = finalItems
          data.content[0].text = JSON.stringify(parsed)
        }
      } catch (_) {}
    }

    return res.status(claudeRes.status).json(data)
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
