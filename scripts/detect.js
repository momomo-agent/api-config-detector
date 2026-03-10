#!/usr/bin/env node
/**
 * API Config Detector
 * 输入 baseUrl + apiKey，自动测试所有可能的配置组合，输出 OpenClaw 配置
 */

const https = require('https')
const http = require('http')

// 测试配置组合
const TEST_CONFIGS = [
  {
    api: 'anthropic-messages',
    path: '/v1/messages',
    method: 'POST',
    headers: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    }),
    body: {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'hi' }]
    }
  },
  {
    api: 'openai-completions',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: (key) => ({
      'authorization': `Bearer ${key}`,
      'content-type': 'application/json'
    }),
    body: {
      model: 'gpt-4',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'hi' }]
    }
  },
  {
    api: 'openai-completions',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: (key) => ({
      'content-type': 'application/json'
      // 不带 Authorization header（某些代理不需要）
    }),
    body: {
      model: 'gpt-4',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'hi' }]
    },
    authHeader: false
  },
  {
    api: 'openai-responses',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: (key) => ({
      'authorization': `Bearer ${key}`,
      'content-type': 'application/json'
    }),
    body: {
      model: 'gpt-4',
      max_tokens: 10,
      stream: false,
      messages: [{ role: 'user', content: 'hi' }]
    }
  }
]

async function testConfig(baseUrl, apiKey, config) {
  return new Promise((resolve) => {
    const url = new URL(config.path, baseUrl)
    const isHttps = url.protocol === 'https:'
    const lib = isHttps ? https : http

    const headers = typeof config.headers === 'function' 
      ? config.headers(apiKey) 
      : config.headers

    const postData = JSON.stringify(config.body)

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: config.method,
      headers: {
        ...headers,
        'content-length': Buffer.byteLength(postData)
      },
      timeout: 10000
    }

    const req = lib.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        const success = res.statusCode >= 200 && res.statusCode < 300
        resolve({
          success,
          statusCode: res.statusCode,
          api: config.api,
          authHeader: config.authHeader,
          response: data.slice(0, 200)
        })
      })
    })

    req.on('error', (err) => {
      resolve({
        success: false,
        api: config.api,
        authHeader: config.authHeader,
        error: err.message
      })
    })

    req.on('timeout', () => {
      req.destroy()
      resolve({
        success: false,
        api: config.api,
        authHeader: config.authHeader,
        error: 'timeout'
      })
    })

    req.write(postData)
    req.end()
  })
}

async function detectConfig(baseUrl, apiKey) {
  console.log(`🔍 Testing: ${baseUrl}`)
  console.log(`🔑 API Key: ${apiKey.slice(0, 10)}...`)
  console.log('')

  const results = []
  for (const config of TEST_CONFIGS) {
    process.stdout.write(`Testing ${config.api}${config.authHeader === false ? ' (no auth header)' : ''}... `)
    const result = await testConfig(baseUrl, apiKey, config)
    results.push(result)
    console.log(result.success ? '✅' : `❌ (${result.error || result.statusCode})`)
  }

  return results
}

function generateOpenClawConfig(baseUrl, apiKey, results) {
  const working = results.filter(r => r.success)
  
  if (working.length === 0) {
    return null
  }

  // 优先选择第一个成功的
  const best = working[0]
  
  const config = {
    baseUrl: baseUrl,
    apiKey: apiKey,
    api: best.api
  }

  if (best.authHeader === false) {
    config.authHeader = false
  }

  // 根据 API 类型推测可能的模型
  const models = best.api.includes('anthropic') 
    ? [
        { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', reasoning: false, input: ['text', 'image'], contextWindow: 200000, maxTokens: 8192 },
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', reasoning: false, input: ['text', 'image'], contextWindow: 200000, maxTokens: 8192 }
      ]
    : [
        { id: 'gpt-5.2', name: 'GPT-5.2', reasoning: false, input: ['text', 'image'], contextWindow: 128000, maxTokens: 16384 },
        { id: 'gpt-4', name: 'GPT-4', reasoning: false, input: ['text'], contextWindow: 128000, maxTokens: 4096 }
      ]

  return {
    provider: config,
    models: models
  }
}

// CLI
const args = process.argv.slice(2)
if (args.length < 2) {
  console.log('Usage: node detect.js <baseUrl> <apiKey>')
  console.log('Example: node detect.js https://api.anthropic.com sk-ant-xxx')
  process.exit(1)
}

const [baseUrl, apiKey] = args

detectConfig(baseUrl, apiKey).then(results => {
  console.log('')
  console.log('━'.repeat(60))
  console.log('')

  const config = generateOpenClawConfig(baseUrl, apiKey, results)
  
  if (!config) {
    console.log('❌ No working configuration found.')
    process.exit(1)
  }

  console.log('✅ Working configuration found!')
  console.log('')
  console.log('📋 OpenClaw config (copy to openclaw.json):')
  console.log('')
  console.log(JSON.stringify({
    models: {
      providers: {
        'custom-provider': config.provider
      }
    }
  }, null, 2))
  console.log('')
  console.log('📝 Suggested models:')
  console.log(JSON.stringify(config.models, null, 2))
})
