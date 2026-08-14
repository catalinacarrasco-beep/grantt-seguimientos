export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { base64, type } = req.body
    const buffer = Buffer.from(base64, 'base64')
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
    const pdfData = await pdfParse(buffer)
    const text = pdfData.text.replace(/[^\x20-\x7E\n]/g, ' ').substring(0, 50000)

    // DINs (formato Pollmann): parseo por BLOQUES. Cada ítem empieza en un header
    // "ITEM [N] Nombre Codigo Arancel". El bloque va hasta el siguiente header.
    // Robusto: cualquier cantidad de ítems, unidad PCS o UNIDADES, y captura la
    // descripción (con los códigos) para que la asignación matchee por código.
    if (type === 'din') {
      const items = []
      const headerRe = /ITEM\s+(?:(\d+)\s+)?Nombre\s+Codigo\s+Arancel/gi
      const heads = []
      let hm
      while ((hm = headerRe.exec(text)) !== null) heads.push({ num: hm[1] || null, start: hm.index })

      for (let i = 0; i < heads.length; i++) {
        const start = heads[i].start
        const end = i + 1 < heads.length ? heads[i + 1].start : text.length
        const block = text.slice(start, end)
        const itemNum = heads[i].num || String(i + 1)
        // Cantidad: "0000NNNNN.000000 UNIDAD" (acepta PCS, UNIDADES, etc. — cualquier palabra de unidad).
        // Requiere ≥2 letras tras el ".000000" para no confundir con el Ad Valorem ("19.000000 178").
        const qm = block.match(/0*(\d+)\.000000\s+[A-Z]{2,}/)
        const quantity = qm ? parseInt(qm[1], 10) : 0
        // Descripción: del header hasta la cantidad (evita el footer de página).
        const cut = qm ? block.indexOf(qm[0]) + qm[0].length : Math.min(block.length, 600)
        const description = block.slice(0, cut).replace(/\s+/g, ' ').trim().slice(0, 600)
        if (!items.find(x => x.itemNum === itemNum)) items.push({ itemNum, quantity, description })
      }

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

