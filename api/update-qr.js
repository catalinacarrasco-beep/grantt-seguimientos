export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN no configurado en Vercel' })

  try {
    const { qrDB } = req.body
    if (!qrDB || typeof qrDB !== 'object') return res.status(400).json({ error: 'Datos inválidos' })

    const repo = 'catalinacarrasco-beep/grantt-seguimientos'
    const path = 'src/lib/qrDB.json'
    const headers = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'grantt-seguimientos',
    }

    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { headers })
    const getData = await getRes.json()
    if (!getRes.ok) throw new Error(getData.message || 'Error al leer archivo actual')

    const content = Buffer.from(JSON.stringify(qrDB, null, 2)).toString('base64')
    const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `Actualizar QR Vigentes (${Object.keys(qrDB).length} códigos)`,
        content,
        sha: getData.sha,
      }),
    })

    const putData = await putRes.json()
    if (!putRes.ok) throw new Error(putData.message || 'Error al subir a GitHub')

    return res.status(200).json({
      ok: true,
      count: Object.keys(qrDB).length,
      commit: putData.commit?.sha?.slice(0, 10),
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
