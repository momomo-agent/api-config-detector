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
    let targetUrl, method = 'GET', headers = {}, body, mode = 'raw'
    
    // 支持两种调用方式：GET ?url=...&mode=... 或 POST JSON
    if (request.method === 'GET') {
      const url = new URL(request.url)
      targetUrl = url.searchParams.get('url')
      mode = url.searchParams.get('mode') || 'raw'
    } else {
      const json = await request.json()
      targetUrl = json.url
      method = json.method || 'GET'
      headers = json.headers || {}
      body = json.body
      mode = json.mode || 'raw'
    }
    
    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'content-type': 'application/json' }
      })
    }
    
    const fetchOptions = {
      method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        ...headers
      }
    }
    
    if (body && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
    }
    
    const response = await fetch(targetUrl, fetchOptions)
    const text = await response.text()
    
    // LLM 友好模式：提取 HTML 正文
    if (mode === 'llm') {
      const extracted = extractContent(text, targetUrl)
      return new Response(JSON.stringify(extracted, null, 2), {
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

function extractContent(html, url) {
  try {
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is)
    const title = titleMatch ? titleMatch[1].trim() : ''
    
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
    const description = descMatch ? descMatch[1] : ''
    
    let cleaned = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
    
    const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*)<\/body>/i)
    let bodyText = bodyMatch ? bodyMatch[1] : cleaned
    
    bodyText = bodyText
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
    
    const maxLen = 8000
    if (bodyText.length > maxLen) {
      bodyText = bodyText.substring(0, maxLen) + '...'
    }
    
    return {
      success: true,
      url,
      title,
      description,
      content: bodyText,
      length: bodyText.length
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
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
