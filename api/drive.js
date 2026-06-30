import { google } from 'googleapis'
import { Readable } from 'stream'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || '{}')
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  const drive = google.drive({ version: 'v3', auth })

  const { action, params } = req.body

  try {
    if (action === 'create_folder') {
      const { name, parentId } = params
      const file = await drive.files.create({
        requestBody: {
          name,
          mimeType: 'application/vnd.google-apps.folder',
          ...(parentId ? { parents: [parentId] } : {}),
        },
        fields: 'id',
      })
      return res.json({ id: file.data.id })
    }

    if (action === 'upload_file') {
      const { name, base64, mimeType, parentId } = params
      const buffer = Buffer.from(base64, 'base64')
      const file = await drive.files.create({
        requestBody: {
          name,
          ...(parentId ? { parents: [parentId] } : {}),
        },
        media: { mimeType, body: Readable.from(buffer) },
        fields: 'id,webViewLink',
      })
      return res.json({ id: file.data.id, webViewLink: file.data.webViewLink })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}