export default {
  async fetch(request) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders })
    }
    
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'content-type': 'application/json' }
      })
    }

    try {
      const { baseUrl, path, headers, body } = await request.json()
      
      const cleanBaseUrl = baseUrl.replace(/\/+$/, '')
      const cleanPath = path.startsWith('/') ? path : `/${path}`
      const fullUrl = `${cleanBaseUrl}${cleanPath}`
      
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      })
      
      const text = await response.text()
      
      return new Response(JSON.stringify({
        success: response.ok,
        statusCode: response.status,
        body: text.slice(0, 200)
      }), {
        status: 200,
        headers: { ...corsHeaders, 'content-type': 'application/json' }
      })
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 200,
        headers: { ...corsHeaders, 'content-type': 'application/json' }
      })
    }
  }
}
