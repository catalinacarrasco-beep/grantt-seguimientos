export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { base64, type } = req.body
    const buffer = Buffer.from(base64, 'base64')
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
    const pdfData = await pdfParse(buffer)
    const text = pdfData.text.replace(/[^\x20-\x7E\n]/g, ' ').substring(0, 50000)

    // DINs: parseo por bloques delimitados por "ITEM N".
    // El regex anterior requeria "ITEM N Nombre Codigo Arancel" exacto, lo que
    // fallaba en paginas posteriores donde el header de tabla no se repite.
    // Ahora busca cualquier "ITEM N" y valida con el patron de cantidad DIN.
    if (type === 'din') {
      const headerRe = /\bITEM\s+(\d+)\b/gi
      const allMatches = []
      let hm
      while ((hm = headerRe.exec(text)) !== null) allMatches.push({ num: hm[1], start: hm.index })

      const validItems = new Map()
      for (let i = 0; i < allMatches.length; i++) {
        const start = allMatches[i].start
        const end = i + 1 < allMatches.length ? allMatches[i + 1].start : text.length
        const block = text.slice(start, end)
        const itemNum = allMatches[i].num

        // Cantidad: "0000NNNNN.000000 UNIDAD" — requiere >=2 letras para no confundir con Ad Valorem
        const qm = block.match(/0*(\d+)\.000000\s+[A-Z]{2,}/)
        if (!qm) continue
        const quantity = parseInt(qm[1], 10)
        if (quantity <= 0) continue

        // Primer match valido por itemNum gana (el bloque real viene antes que las referencias)
        if (validItems.has(itemNum)) continue

        const cut = block.indexOf(qm[0]) + qm[0].length
        const description = block.slice(0, cut).replace(/\s+/g, ' ').trim().slice(0, 600)

        // Supplier code: patron "-F; CODE;" comun en DINs chilenas
        const scMatch = block.match(/-F;\s*([A-Z0-9][\w-]*)\s*;/i)
        const supplierCode = scMatch ? scMatch[1] : undefined

        const item = { itemNum, quantity, description }
        if (supplierCode) item.supplierCode = supplierCode
        validItems.set(itemNum, item)
      }

      const items = Array.from(validItems.values())
      const dinMatch = text.match(/\b(\d{10}-\d)\b/)
      items.sort((a, b) => parseInt(a.itemNum) - parseInt(b.itemNum))
      const result = { dinNum: dinMatch ? dinMatch[1] : '', items }
      return res.status(200).json({
        content: [{ type: 'text', text: JSON.stringify(result) }]
      })
    }

    // Invoices only: use Claude
    const prompt = type === 'invoice'
      ? `Extract from this commercial invoice text.
Return ONLY valid JSON, no markdown, no extra text.
Format: {"invoiceNum":"26FS-0301-3","trazabilidad":"04/2026","products":[{"modelo":"09431","altCode":"HX-MVC2PT10A-N","cantidad":10416}]}
- invoiceNum: invoice reference number
- trazabilidad: invoice date as MM/YYYY
- modelo: the shorter numeric code (like "09431"), NOT the long supplier code with extra dashes (like "09431-Z-BOLT")
- altCode: if a SECOND code column exists, include the other code here (e.g. the alphanumeric model like "HX-MVC2PT10A-N"). Omit if only one code column.
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
