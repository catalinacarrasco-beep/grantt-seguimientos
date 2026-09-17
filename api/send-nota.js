export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { to, cc, subject, body } = req.body
  if (!to || !subject || !body) return res.status(400).json({ error: 'Faltan campos requeridos' })

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Calidad Grantt <calidad@grantt.cl>',
        to: Array.isArray(to) ? to : [to],
        cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
        subject,
        text: body,
      }),
    })

    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Error enviando email' })
    return res.status(200).json({ success: true, id: data.id })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
