export const config = {
  maxDuration: 30, // 30秒超时
}

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
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '')
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    const fullUrl = `${cleanBaseUrl}${cleanPath}`
    
    console.log('Testing:', fullUrl)
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000) // 25秒超时
    
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    const text = await response.text()
    
    console.log('Response:', response.status)
    
    res.status(200).json({
      success: response.ok,
      statusCode: response.status,
      body: text.slice(0, 200)
    })
  } catch (error) {
    console.error('Error:', error.message)
    res.status(200).json({
      success: false,
      error: error.message
    })
  }
}
