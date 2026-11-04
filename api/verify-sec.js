// ponytail: SEC website verification — fetches SEC QR page and checks if modelo appears
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const { url, modelo } = req.query
  if (!url || !modelo) return res.status(400).json({ error: 'Missing url or modelo' })

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })
    const html = await resp.text()

    const match = html.match(/Modelos[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i)
    if (!match) return res.json({ verified: false, reason: 'no_models_field' })

    const modelsText = match[1].replace(/<[^>]*>/g, '').trim()
    const models = modelsText.split(/[\/,]/).map(m => m.trim().replace(/^0+/, ''))
    const target = modelo.trim().replace(/^0+/, '')

    return res.json({ verified: models.some(m => m === target), models: modelsText })
  } catch {
    return res.json({ verified: false, reason: 'fetch_error' })
  }
}
