export const config = { runtime: 'edge' }

const PROTOCOLS = [
  { id: 'anthropic-messages', family: 'anthropic', path: '/v1/messages', headers: k => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }), body: m => ({ model: m || 'claude-3-5-sonnet-20241022', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }), api: 'anthropic-messages' },
  { id: 'anthropic-no-v1', family: 'anthropic', path: '/messages', headers: k => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }), body: m => ({ model: m || 'claude-3-5-sonnet-20241022', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }), api: 'anthropic-messages' },
  { id: 'openai-completions', family: 'openai', path: '/v1/chat/completions', headers: k => ({ 'authorization': `Bearer ${k}`, 'content-type': 'application/json' }), body: m => ({ model: m || 'gpt-4', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }), api: 'openai-completions', authHeader: true },
  { id: 'openai-no-v1', family: 'openai', path: '/chat/completions', headers: k => ({ 'authorization': `Bearer ${k}`, 'content-type': 'application/json' }), body: m => ({ model: m || 'gpt-4', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }), api: 'openai-completions', authHeader: true },
  { id: 'openai-no-auth', family: 'openai', path: '/v1/chat/completions', headers: () => ({ 'content-type': 'application/json' }), body: m => ({ model: m || 'gpt-4', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }), api: 'openai-completions', authHeader: false }
]

async function testProtocol(baseUrl, apiKey, protocol, testModel) {
  const t0 = Date.now()
  try {
    const url = baseUrl.replace(/\/+$/, '') + protocol.path
    const res = await fetch(url, {
      method: 'POST',
      headers: protocol.headers(apiKey),
      body: JSON.stringify(protocol.body(testModel)),
      signal: AbortSignal.timeout(15000)
    })
    return { protocol, success: res.ok, statusCode: res.status, latency: Date.now() - t0 }
  } catch (err) {
    return { protocol, success: false, error: err.message, latency: Date.now() - t0 }
  }
}

function detectModelFamily(model) {
  if (!model) return null
  const m = model.toLowerCase()
  if (/claude|sonnet|opus|haiku/.test(m)) return 'anthropic'
  if (/gpt|o[1-9]|chatgpt/.test(m)) return 'openai'
  return null
}

function pickBest(results, testModel) {
  const successes = results.filter(r => r.success)
  if (!successes.length) return null
  const family = detectModelFamily(testModel)
  successes.sort((a, b) => {
    const aMatch = family && a.protocol.family === family ? 1 : 0
    const bMatch = family && b.protocol.family === family ? 1 : 0
    if (aMatch !== bMatch) return bMatch - aMatch
    return a.latency - b.latency
  })
  return successes[0]
}

export default async function handler(req) {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'content-type': 'application/json' } })

  try {
    const { baseUrl, apiKey, testModel, providerName } = await req.json()
    const results = await Promise.all(PROTOCOLS.map(p => testProtocol(baseUrl, apiKey, p, testModel)))
    const best = pickBest(results, testModel)
    
    if (!best) {
      return new Response(JSON.stringify({ error: 'No working protocol found', results }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }
    
    const p = best.protocol
    const provider = { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey, api: p.api }
    if (p.authHeader === false) provider.authHeader = false
    const modelId = testModel || (p.family === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-4')
    provider.models = [{ id: modelId, name: modelId, input: ['text', 'image'] }]
    
    const config = {
      models: { providers: { [providerName || 'custom']: provider } },
      agents: { defaults: { model: `${providerName || 'custom'}/${modelId}` } }
    }
    
    return new Response(JSON.stringify({ config, protocol: p.id, latency: best.latency }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }
}
