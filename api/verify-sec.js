// ponytail: SEC website verification â€” fetches SEC QR page and checks if modelo appears
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const { url, modelo } = req.query
  if (!url || !modelo) return res.status(400).json({ error: 'Missing url or modelo' })

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 10000)

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      redirect: 'follow',
      signal: ac.signal,
    })
    clearTimeout(timer)
    const html = await resp.text()

    // ponytail: specific match â€” td with "Modelos" followed by sibling td with the actual list
    const match = html.match(/<td[^>]*>\s*Modelos\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i)
    if (!match) return res.json({ verified: false, reason: 'no_models_field', htmlLen: html.length })

    const modelsText = match[1].replace(/<[^>]*>/g, '').trim()
    const models = modelsText.split(/[\/,]/).map(m => m.trim().replace(/^0+/, ''))
    const target = modelo.trim().replace(/^0+/, '')

    return res.json({ verified: models.some(m => m === target), models: modelsText })
  } catch (e) {
    clearTimeout(timer)
    return res.json({ verified: false, reason: 'fetch_error', detail: e.message })
  }
}
