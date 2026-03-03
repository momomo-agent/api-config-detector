export default {
  async fetch(request) {
    const url = new URL(request.url)
    
    // API 配置检测（保留原功能）
    if (url.pathname === '/api/test') {
      return handleApiTest(request)
    }
    
    // 通用代理
    if (url.pathname === '/proxy') {
      return handleProxy(request)
    }
    
    // 返回使用说明
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(getUsageHTML(), {
        headers: { 'content-type': 'text/html;charset=UTF-8' }
      })
    }
    
    return new Response('Not Found', { status: 404 })
  }
}

// 通用代理
async function handleProxy(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  }
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const { url, method = 'GET', headers = {}, body, mode = 'raw' } = await request.json()
    
    if (!url) {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'content-type': 'application/json' }
      })
    }
    
    const fetchOptions = {
      method,
      headers
    }
    
    if (body && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
    }
    
    const response = await fetch(url, fetchOptions)
    const text = await response.text()
    
    // LLM 友好模式
    if (mode === 'llm') {
      let parsed = text
      try {
        parsed = JSON.parse(text)
      } catch {}
      
      return new Response(JSON.stringify({
        success: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type'),
        data: parsed,
        summary: `${method} ${url} → ${response.status} ${response.statusText}`
      }), {
        status: 200,
        headers: { ...corsHeaders, 'content-type': 'application/json' }
      })
    }
    
    // 原始模式
    return new Response(JSON.stringify({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers),
      body: text
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

// API 配置检测（原功能）
async function handleApiTest(request) {
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

function getUsageHTML() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Cloudflare Workers 通用代理</title>
  <style>
    body { font-family: system-ui; max-width: 800px; margin: 40px auto; padding: 20px; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>Cloudflare Workers 通用代理</h1>
  
  <h2>功能</h2>
  <ul>
    <li><code>/proxy</code> - 通用 HTTP 代理（支持所有方法）</li>
    <li><code>/api/test</code> - API 配置检测工具</li>
  </ul>
  
  <h2>使用示例</h2>
  
  <h3>通用代理</h3>
  <pre>
fetch('https://api-config-detector.molttalk.workers.dev/proxy', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    url: 'https://api.example.com/data',
    method: 'GET',
    headers: {
      'Authorization': 'Bearer token'
    }
  })
})
  </pre>
  
  <h3>API 配置检测</h3>
  <p>访问 <a href="https://api-config-detector.vercel.app">https://api-config-detector.vercel.app</a></p>
</body>
</html>`
}
