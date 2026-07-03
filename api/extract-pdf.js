export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { base64, type } = req.body
    const buffer = Buffer.from(base64, 'base64')
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
    const pdfData = await pdfParse(buffer)
    const text = pdfData.text.replace(/[^\x20-\x7E\n]/g, ' ').substring(0, 8000)

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
- items: ALL line items with their description in uppercase
- quantity must be integer PCS (look for patterns like "000017400.000000 PIEZAS" -> 17400, or "17.400,000 PCS" -> 17400)
- quantity MUST be integer, never decimal
- supplierCode: extract the code that appears after the supplier pattern ("NINGBO-F;", "BO-F;", "FEISHUN-F;", etc.). May be numeric ("99142") or alphanumeric ("HX-PLP"). Extract only what follows immediately after the semicolon. Omit if no clear code is present.
- IMPORTANT: Exclude any items whose description contains words related to PVC conduit, cable trunking, or accessories such as: PVC, CANALETA, TRUNKING, DUCTO, CONDUIT, ACCESORIO, FITTING, BRACKET, CLIPS, TAPA, UNION, CURVA, TEE

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
    return res.status(claudeRes.status).json(data)
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
