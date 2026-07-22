export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurado' })

  const { id } = req.body
  if (!id) return res.status(400).json({ error: 'id requerido' })

  const url = `${process.env.VITE_SUPABASE_URL || 'https://lpbsnaodybnyltvdezak.supabase.co'}/rest/v1/inspecciones?id=eq.${id}`
  const resp = await fetch(url, {
    method: 'DELETE',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: 'return=representation',
    },
  })

  if (!resp.ok) {
    const err = await resp.text()
    return res.status(resp.status).json({ error: err })
  }

  const deleted = await resp.json()
  if (!deleted.length) return res.status(404).json({ error: 'No se encontró el registro' })

  return res.status(200).json({ ok: true, deleted: deleted.length })
}
