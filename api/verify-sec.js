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

    // ponytail: strip tags, search for model number with word boundaries â€” no fragile HTML parsing
    const text = html.replace(/<[^>]*>/g, ' ')
    const target = modelo.trim().replace(/^0+/, '')
    const re = new RegExp('\\b' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b')
    const verified = re.test(text)

    return res.json({ verified, htmlLen: html.length })
  } catch (e) {
    clearTimeout(timer)
    return res.json({ verified: false, reason: 'fetch_error', detail: e.message })
  }
}
