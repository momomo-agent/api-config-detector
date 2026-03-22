// proxy.link2web.site — Cloudflare Worker
// 通用 HTTP 代理：API 转发 / 网页抓取 / 图片代理 / SSE 流式 / LLM 内容提取

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
  'Access-Control-Max-Age': '86400',
}

function corsResponse(body, init = {}) {
  const h = new Headers(init.headers || {})
  for (const [k, v] of Object.entries(CORS)) h.set(k, v)
  return new Response(body, { ...init, headers: h })
}

function corsPassthrough(upstream) {
  const h = new Headers()
  for (const [k, v] of upstream.headers.entries()) {
    if (['transfer-encoding', 'connection', 'keep-alive'].includes(k.toLowerCase())) continue
    h.set(k, v)
  }
  for (const [k, v] of Object.entries(CORS)) h.set(k, v)
  return new Response(upstream.body, { status: upstream.status, headers: h })
}

export default {
  async fetch(request) {
    const url = new URL(request.url)

    // CORS preflight — any path
    if (request.method === 'OPTIONS') {
      return corsResponse(null, { status: 204 })
    }

    // /api/test — API 配置检测（保留原功能）
    if (url.pathname === '/api/test') {
      return handleApiTest(request)
    }

    // POST to ANY path → 通用代理
    if (request.method === 'POST') {
      return handleProxy(request)
    }

    // GET with ?url= → 通用代理
    if (url.searchParams.get('url')) {
      return handleProxy(request)
    }

    // 使用说明
    return corsResponse(getUsageHTML(), {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    })
  }
}

// ─── 通用代理 ───

async function handleProxy(request) {
  try {
    let targetUrl, method = 'GET', headers = {}, body, mode = 'raw'

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
      return corsResponse(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      })
    }

    const fetchOpts = {
      method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': '*/*',
        ...headers,
      },
    }

    if (body && method !== 'GET' && method !== 'HEAD') {
      if (!fetchOpts.headers['Content-Type'] && typeof body === 'object') {
        fetchOpts.headers['Content-Type'] = 'application/json'
      }
      fetchOpts.body = typeof body === 'string' ? body : JSON.stringify(body)
    }

    const upstream = await fetch(targetUrl, fetchOpts)
    const ct = upstream.headers.get('Content-Type') || ''

    // ── mode: passthrough — 透传（图片、二进制、任意资源） ──
    if (mode === 'passthrough') {
      return corsPassthrough(upstream)
    }

    // ── SSE / stream — 透传 ──
    if (mode === 'stream' || ct.includes('text/event-stream')) {
      return corsPassthrough(upstream)
    }

    // ── mode: llm — HTML 正文提取 ──
    if (mode === 'llm') {
      const text = await upstream.text()
      const extracted = extractContent(text, targetUrl)
      return corsResponse(JSON.stringify(extracted, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // ── mode: raw (default) — JSON 包装 ──
    const text = await upstream.text()
    return corsResponse(JSON.stringify({
      success: upstream.ok,
      status: upstream.status,
      statusText: upstream.statusText,
      headers: Object.fromEntries(upstream.headers),
      body: text,
    }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return corsResponse(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
}

// ─── HTML 内容提取 ───

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
    if (bodyText.length > maxLen) bodyText = bodyText.substring(0, maxLen) + '...'

    return { success: true, url, title, description, content: bodyText, length: bodyText.length }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// ─── API 配置检测 ───

async function handleApiTest(request) {
  if (request.method !== 'POST') {
    return corsResponse(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const { baseUrl, path, headers, body } = await request.json()
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '')
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    const fullUrl = `${cleanBaseUrl}${cleanPath}`

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    const text = await response.text()
    return corsResponse(JSON.stringify({
      success: response.ok,
      statusCode: response.status,
      body: text.slice(0, 200),
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return corsResponse(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
}

// ─── 使用说明 ───

function getUsageHTML() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>proxy.link2web.site</title>
  <style>
    body { font-family: system-ui; max-width: 800px; margin: 40px auto; padding: 20px; color: #333; }
    h1 { border-bottom: 2px solid #eee; padding-bottom: 10px; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 14px; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; font-size: 13px; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f8f8f8; }
  </style>
</head>
<body>
  <h1>proxy.link2web.site</h1>
  <p>通用 HTTP 代理 — API 转发、网页抓取、图片代理、SSE 流式透传</p>

  <h2>Modes</h2>
  <table>
    <tr><th>mode</th><th>返回</th><th>用途</th></tr>
    <tr><td><code>raw</code> (default)</td><td>JSON: <code>{success, status, headers, body}</code></td><td>API 调用，检查响应</td></tr>
    <tr><td><code>passthrough</code></td><td>原始响应（直接透传 body + headers）</td><td>图片、二进制文件、<code>&lt;img src&gt;</code></td></tr>
    <tr><td><code>stream</code></td><td>流式透传（自动检测 SSE）</td><td>LLM streaming</td></tr>
    <tr><td><code>llm</code></td><td>JSON: <code>{title, description, content}</code></td><td>网页正文提取</td></tr>
  </table>

  <h2>使用示例</h2>

  <h3>POST — API 转发</h3>
  <pre>
fetch('https://proxy.link2web.site', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://api.example.com/data',
    method: 'GET',
    headers: { 'Authorization': 'Bearer token' },
    mode: 'raw'  // or 'passthrough', 'stream'
  })
})</pre>

  <h3>GET — 网页抓取</h3>
  <pre>
// 原始 HTML
fetch('https://proxy.link2web.site?url=https://example.com&mode=raw')

// 正文提取
fetch('https://proxy.link2web.site?url=https://example.com&mode=llm')

// 图片/资源代理
&lt;img src="https://proxy.link2web.site?url=https://example.com/image.jpg&mode=passthrough" /&gt;</pre>

  <h3>/api/test — API 配置检测</h3>
  <p>POST JSON: <code>{baseUrl, path, headers, body}</code></p>
</body>
</html>`
}
