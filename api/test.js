export const config = {
  runtime: 'edge',
}

export default async function handler(req) {
  // 允许 CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }
  
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'content-type': 'application/json' }
    })
  }

  try {
    const { baseUrl, apiKey, api, path, headers, body } = await req.json()
    
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '')
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    const fullUrl = `${cleanBaseUrl}${cleanPath}`
    
    console.log('Testing:', fullUrl)
    
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    })
    
    const text = await response.text()
    
    console.log('Response:', response.status)
    
    return new Response(JSON.stringify({
      success: response.ok,
      statusCode: response.status,
      body: text.slice(0, 200)
    }), {
      status: 200,
      headers: { ...corsHeaders, 'content-type': 'application/json' }
    })
  } catch (error) {
    console.error('Error:', error.message)
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 200,
      headers: { ...corsHeaders, 'content-type': 'application/json' }
    })
  }
}
