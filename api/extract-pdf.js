export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { base64, type } = req.body
    const buffer = Buffer.from(base64, 'base64')
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
    const pdfData = await pdfParse(buffer)
    const text = pdfData.text.replace(/[^\x20-\x7E\n]/g, ' ').substring(0, 8000)

    const prompt = type === 'invoice'
      ? `Extract from this commercial invoice text. TWO code columns exist: long supplier code (like 09431-Z-BOLT) and shorter CODE (like 09431).
Return ONLY a valid JSON object. Use double quotes. No markdown. No extra text.
Format: {"invoiceNum":"CH-GR-SE2507","trazabilidad":"03/2026","products":[{"modelo":"09431","cantidad":10416}]}
Rules: invoiceNum=invoice number, trazabilidad=date as MM/YYYY, modelo=shorter numeric CODE only, cantidad=integer PCS.

TEXT:
${text}`
      : `Extract from this Chilean DIN text.
Return ONLY a valid JSON object. Use double quotes. No markdown. No extra text.
Format: {"dinNum":"3630750509-0","items":[{"itemNum":"1","quantity":20000},{"itemNum":"2","quantity":5000}]}
Rules: dinNum=NUMERO DE IDENTIFICACION, items=all line items with itemNum as string and quantity as integer PCS.

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
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await claudeRes.json()
    return res.status(claudeRes.status).json(data)
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
