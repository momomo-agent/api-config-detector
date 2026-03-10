---
name: api-config-detector
description: Detect API provider protocol and generate OpenClaw config. Use when a user provides an API base URL and key and needs to configure OpenClaw to use it, or when troubleshooting provider configuration issues. Automatically tests Anthropic Messages and OpenAI Completions protocols with smart selection — matches Claude models to Anthropic protocol, OpenAI models to OpenAI protocol, and picks the fastest successful result.
---

# API Config Detector

Detect which protocol an API provider supports, generate a ready-to-use `openclaw.json` config snippet.

## Usage

```bash
node scripts/detect.cjs <baseUrl> <apiKey> [testModel] [providerName]
```

- `baseUrl` — API endpoint (e.g. `https://api.anthropic.com`)
- `apiKey` — API key or bearer token
- `testModel` — Model ID to test (optional, improves protocol matching)
- `providerName` — Name for the provider in config (default: `custom`)

Add `--json` flag for machine-readable output (progress to stderr, config to stdout).

## How It Works

1. Tests 5 protocol variants in parallel (Anthropic Messages, OpenAI Completions, with/without /v1 prefix, no-auth)
2. Picks the best successful result:
   - If testModel looks like Claude → prefer Anthropic protocol
   - If testModel looks like GPT → prefer OpenAI protocol
   - Ties broken by lowest latency
3. Outputs a single JSON config ready to paste into `openclaw.json`

## Output

The JSON output contains the full `models.providers` config entry plus a suggested `agents.defaults.model`. Copy the relevant sections into your `openclaw.json`.

## Web Version

Interactive web UI: <https://api-config-detector.vercel.app>
