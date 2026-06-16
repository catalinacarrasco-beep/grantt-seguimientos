// Extracts text from PDF using pdf-parse and sends only text to Claude
// This avoids the 413 error for large PDFs

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { base64, type } = req.body

    // Convert base64 to buffer
    const buffer = Buffer.from(base64, 'base64')

    // Dynamically import pdf-parse
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
    const pdfData = await pdfParse(buffer)
    const text = pdfData.text

    // Now send just the text to Claude API
    const prompt = type === 'din'
      ? `Extract from this Chilean DIN (Declaración de Ingreso) text and respond ONLY with JSON (no markdown):
{"dinNum":"3630750509-0","items":[{"itemNum":"1","quantity":20000},{"itemNum":"2","quantity":5000},...]}
- dinNum: NUMERO DE IDENTIFICACION (format like 3630XXXXXX-X)
- items: all items with item number and PCS quantity (look for "000XXXXX.000000 PCS" pattern)

DIN TEXT:
${text.substring(0, 8000)}`
      : `Extract from this commercial invoice text and respond ONLY with JSON (no markdown):
{"invoiceNum":"...","trazabilidad":"MM/YYYY","products":[{"modelo":"09431","cantidad":10416},...]}
- invoiceNum: invoice reference number
- trazabilidad: invoice date as MM/YYYY
- modelo: use ONLY the shorter CODE column (numeric), NOT the supplier code with dashes
- cantidad: quantity in PCS/units

INVOICE TEXT:
${text.substring(0, 8000)}`

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
    console.error('PDF extract error:', error)
    return res.status(500).json({ error: error.message })
  }
}
