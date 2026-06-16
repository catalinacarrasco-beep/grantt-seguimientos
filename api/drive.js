// Direct Google Drive operations via MCP
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, params } = req.body

  const MCP = [{ type: 'url', url: 'https://drivemcp.googleapis.com/mcp/v1', name: 'google-drive' }]

  let prompt = ''

  if (action === 'create_folder') {
    const { name, parentId } = params
    prompt = parentId
      ? `Create a Google Drive folder named "${name}" with parent folder ID "${parentId}". Use the create_file tool with mimeType "application/vnd.google-apps.folder" and parentId "${parentId}". Return only the folder ID.`
      : `Create a Google Drive folder named "${name}" in the root. Use the create_file tool with mimeType "application/vnd.google-apps.folder". Return only the folder ID.`
  } else if (action === 'upload_file') {
    const { name, base64, mimeType, parentId } = params
    prompt = `Upload a file to Google Drive using the create_file tool with these exact parameters:
- title: "${name}"
- contentMimeType: "${mimeType}"
- base64Content: "${base64}"
- parentId: "${parentId}"
- disableConversionToGoogleType: true
Return the file ID and webViewLink.`
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        mcp_servers: MCP,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()

    // Extract MCP tool result
    const mcpResults = (data.content || []).filter(b => b.type === 'mcp_tool_result')
    for (const r of mcpResults) {
      try {
        const parsed = JSON.parse(r.content?.[0]?.text || '')
        if (parsed.id) {
          return res.json({
            id: parsed.id,
            webViewLink: parsed.webViewLink || `https://drive.google.com/file/d/${parsed.id}/view`
          })
        }
      } catch {}
    }

    // Fallback: extract from text
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
    return res.json({ text, raw: data })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
