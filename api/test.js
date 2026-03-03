export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { baseUrl, apiKey, api, path, headers, body } = req.body

  try {
    const url = new URL(path, baseUrl)
    
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    })

    const text = await response.text()
    
    res.status(200).json({
      success: response.ok,
      statusCode: response.status,
      body: text.slice(0, 200)
    })
  } catch (error) {
    res.status(200).json({
      success: false,
      error: error.message
    })
  }
}
