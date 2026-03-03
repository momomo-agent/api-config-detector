export default async function handler(req, res) {
  // 允许 CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { baseUrl, apiKey, api, path, headers, body } = req.body

  try {
    // 确保 baseUrl 末尾没有斜杠
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '')
    // 确保 path 开头有斜杠
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    const fullUrl = `${cleanBaseUrl}${cleanPath}`
    
    console.log('Testing:', fullUrl, 'with model:', body.model)
    
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    })

    const text = await response.text()
    
    console.log('Response:', response.status, text.slice(0, 100))
    
    res.status(200).json({
      success: response.ok,
      statusCode: response.status,
      body: text.slice(0, 200),
      url: fullUrl
    })
  } catch (error) {
    console.error('Error:', error)
    res.status(200).json({
      success: false,
      error: error.message
    })
  }
}
