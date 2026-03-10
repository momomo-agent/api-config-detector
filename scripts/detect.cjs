#!/usr/bin/env node
/**
 * API Config Detector — detect API protocol and generate OpenClaw config
 * 
 * Usage: node detect.cjs <baseUrl> <apiKey> [testModel] [providerName]
 * 
 * Tests all protocol variants in parallel, picks the best match:
 *   1. Protocol matches model family (Claude→Anthropic, GPT→OpenAI)
 *   2. Fastest response wins ties
 * 
 * Outputs a single ready-to-use openclaw.json config snippet.
 */

const https = require('https')
const http = require('http')

const PROTOCOLS = [
  {
    id: 'anthropic-messages',
    name: 'Anthropic Messages',
    family: 'anthropic',
    path: '/v1/messages',
    headers: k => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }),
    body: m => ({ model: m || 'claude-3-5-sonnet-20241022', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
    api: 'anthropic-messages'
  },
  {
    id: 'anthropic-messages-no-v1',
    name: 'Anthropic Messages (no /v1)',
    family: 'anthropic',
    path: '/messages',
    headers: k => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }),
    body: m => ({ model: m || 'claude-3-5-sonnet-20241022', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
    api: 'anthropic-messages'
  },
  {
    id: 'openai-completions',
    name: 'OpenAI Completions',
    family: 'openai',
    path: '/v1/chat/completions',
    headers: k => ({ 'authorization': `Bearer ${k}`, 'content-type': 'application/json' }),
    body: m => ({ model: m || 'gpt-4', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
    api: 'openai-completions',
    authHeader: true
  },
  {
    id: 'openai-completions-no-v1',
    name: 'OpenAI Completions (no /v1)',
    family: 'openai',
    path: '/chat/completions',
    headers: k => ({ 'authorization': `Bearer ${k}`, 'content-type': 'application/json' }),
    body: m => ({ model: m || 'gpt-4', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
    api: 'openai-completions',
    authHeader: true
  },
  {
    id: 'openai-no-auth',
    name: 'OpenAI (No Auth)',
    family: 'openai',
    path: '/v1/chat/completions',
    headers: () => ({ 'content-type': 'application/json' }),
    body: m => ({ model: m || 'gpt-4', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
    api: 'openai-completions',
    authHeader: false
  }
]

function testProtocol(baseUrl, apiKey, protocol, testModel) {
  return new Promise(resolve => {
    const url = new URL(protocol.path, baseUrl)
    const lib = url.protocol === 'https:' ? https : http
    const headers = protocol.headers(apiKey)
    const postData = JSON.stringify(protocol.body(testModel))
    const t0 = Date.now()

    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: { ...headers, 'content-length': Buffer.byteLength(postData) },
      timeout: 15000
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        resolve({
          protocol,
          success: res.statusCode >= 200 && res.statusCode < 300,
          statusCode: res.statusCode,
          latency: Date.now() - t0,
          body: data.slice(0, 300)
        })
      })
    })

    req.on('error', err => resolve({ protocol, success: false, error: err.message, latency: Date.now() - t0 }))
    req.on('timeout', () => { req.destroy(); resolve({ protocol, success: false, error: 'timeout', latency: Date.now() - t0 }) })
    req.write(postData)
    req.end()
  })
}

function detectModelFamily(model) {
  if (!model) return null
  const m = model.toLowerCase()
  if (/claude|sonnet|opus|haiku/.test(m)) return 'anthropic'
  if (/gpt|o[1-9]|chatgpt|dall-e/.test(m)) return 'openai'
  return null
}

function pickBest(results, testModel) {
  const successes = results.filter(r => r.success)
  if (successes.length === 0) return null

  const family = detectModelFamily(testModel)

  // Sort: family match first, then by latency
  successes.sort((a, b) => {
    const aMatch = family && a.protocol.family === family ? 1 : 0
    const bMatch = family && b.protocol.family === family ? 1 : 0
    if (aMatch !== bMatch) return bMatch - aMatch
    return a.latency - b.latency
  })

  return successes[0]
}

function generateConfig(baseUrl, apiKey, best, testModel, providerName) {
  const p = best.protocol
  const provider = {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    api: p.api
  }
  if (p.authHeader === false) provider.authHeader = false

  // Model entry
  const modelId = testModel || (p.family === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-4')
  provider.models = [{ id: modelId, name: modelId, input: ['text', 'image'] }]

  const config = {
    models: {
      providers: {
        [providerName]: provider
      }
    }
  }

  // Suggest default model
  config.agents = { defaults: { model: `${providerName}/${modelId}` } }

  return config
}

// --- Main ---
const args = process.argv.slice(2)
const flags = {}
const positional = []
for (const a of args) {
  if (a.startsWith('--')) {
    const [k, v] = a.slice(2).split('=')
    flags[k] = v ?? true
  } else {
    positional.push(a)
  }
}

const [baseUrl, apiKey, testModel, providerName] = positional
const silent = flags.json || flags.silent

if (!baseUrl || !apiKey) {
  console.log('Usage: node detect.cjs <baseUrl> <apiKey> [testModel] [providerName]')
  console.log('')
  console.log('  baseUrl       API endpoint base URL')
  console.log('  apiKey        API key or token')
  console.log('  testModel     Model to test with (e.g. claude-sonnet-4-6)')
  console.log('  providerName  Provider name in config (default: custom)')
  console.log('')
  console.log('Flags:')
  console.log('  --json        Output only JSON config (no progress)')
  console.log('')
  console.log('Example:')
  console.log('  node detect.cjs https://api.anthropic.com sk-ant-xxx claude-sonnet-4-6 anthropic')
  process.exit(1)
}

const name = providerName || 'custom'

async function main() {
  if (!silent) {
    process.stderr.write(`Testing ${baseUrl} ...`)
  }

  const results = await Promise.all(
    PROTOCOLS.map(p => testProtocol(baseUrl, apiKey, p, testModel))
  )

  if (!silent) {
    const ok = results.filter(r => r.success).length
    const fail = results.length - ok
    process.stderr.write(` ${ok} passed, ${fail} failed\n`)
  }

  const best = pickBest(results, testModel)

  if (!best) {
    if (!silent) {
      console.error('\n❌ No working protocol found.')
      console.error('')
      results.forEach(r => {
        console.error(`  ${r.protocol.name}: ${r.error || r.statusCode || 'unknown error'}`)
      })
    }
    process.exit(1)
  }

  if (!silent) {
    process.stderr.write(`✓ ${best.protocol.name} (${best.latency}ms)\n\n`)
  }

  const config = generateConfig(baseUrl, apiKey, best, testModel, name)
  console.log(JSON.stringify(config, null, 2))
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
