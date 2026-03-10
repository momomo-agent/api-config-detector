# API Config Detector

Detect API provider protocol and generate OpenClaw config automatically.

**Two ways to use:**
- 🤖 **Agent/CLI**: Install as OpenClaw skill for automated config detection
- 🌐 **Web UI**: Use the interactive web interface at https://api-config-detector.vercel.app

## Features

- Tests Anthropic Messages and OpenAI Completions protocols in parallel
- Smart protocol selection based on model family
- Zero dependencies for CLI (Node.js built-in only)
- Outputs ready-to-use `openclaw.json` config

## Installation (Agent/CLI)

```bash
openclaw skill install momomo-agent/api-config-detector
```

## Usage (Agent/CLI)

```bash
node scripts/detect.js <baseUrl> <apiKey> [testModel] [providerName]
```

**Arguments:**
- `baseUrl` — API endpoint (e.g. `https://api.anthropic.com`)
- `apiKey` — API key or bearer token
- `testModel` — Model ID to test (optional, improves protocol matching)
- `providerName` — Name for the provider in config (default: `custom`)

**Flags:**
- `--json` — Output only JSON config (progress to stderr)

## Example

```bash
node scripts/detect.js https://api.anthropic.com sk-ant-xxx claude-sonnet-4-6 anthropic
```

Output:
```json
{
  "models": {
    "providers": {
      "anthropic": {
        "baseUrl": "https://api.anthropic.com",
        "apiKey": "sk-ant-xxx",
        "api": "anthropic-messages",
        "models": [
          {
            "id": "claude-sonnet-4-6",
            "name": "claude-sonnet-4-6",
            "input": ["text", "image"]
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": "anthropic/claude-sonnet-4-6"
    }
  }
}
```

## How It Works

1. Tests 5 protocol variants in parallel:
   - Anthropic Messages (`/v1/messages`)
   - Anthropic Messages without `/v1` prefix
   - OpenAI Completions (`/v1/chat/completions`)
   - OpenAI Completions without `/v1` prefix
   - OpenAI without authentication

2. Picks the best successful result:
   - If `testModel` looks like Claude → prefer Anthropic protocol
   - If `testModel` looks like GPT → prefer OpenAI protocol
   - Ties broken by lowest latency

3. Outputs a single JSON config ready to paste into `openclaw.json`

## Web Version (Human-Friendly)

Interactive web UI with visual feedback: **https://api-config-detector.vercel.app**

No installation required, works in any browser.

## Repository Structure

```
api-config-detector/
├── scripts/detect.js    # CLI tool (for agents/automation)
├── SKILL.md            # OpenClaw skill documentation
├── index.html          # Web UI
├── worker.js           # Cloudflare Worker backend
├── api/                # Vercel API endpoints
└── package.json
```

## License

MIT
