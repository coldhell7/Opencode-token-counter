# Token Counter

An OpenCode plugin that automatically tracks token usage, cost, and provider/model statistics across all your AI sessions.

Automatic tracking, AI tool integration, CSV export, and a full Chart.js dashboard.

## Installation

### Via GitHub (clone)

```bash
git clone https://github.com/coldhell7/Opencode-token-counter.git
cd Opencode-token-counter
bun install
```

Then add **both** plugins to your OpenCode config (server for tracking + TUI for slash commands):

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugin": [
    "/path/to/Opencode-token-counter/server.ts",
    "/path/to/Opencode-token-counter/tui.ts"
  ]
}
```

### Via npm (once published)

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugin": [
    "opencode-token-counter",
    "opencode-token-counter/tui"
  ]
}
```

### First Run

After adding the plugin to your config, **restart OpenCode**. The plugin starts tracking tokens automatically. Use the command palette or ask the AI about your token usage.

## Usage

### Ask the AI (recommended)

OpenCode commands route to the AI, which uses the built-in `tokens` tool to generate responses:

| Command Palette Entry | What it does |
|---|---|
| `tokens` | AI generates a 7-day usage report with sparklines |
| `tokens-24h` | AI generates a 24-hour usage report |
| `tokens-30d` | AI generates a 30-day usage report |
| `tokens-dashboard` | Opens interactive Chart.js dashboard in browser |
| `tokens-export` | AI exports raw data as CSV |

You can also just ask the AI directly: *"What's my token usage?"*, *"How much did I spend on AI today?"*, etc.

### Web Dashboard

When the plugin starts, it launches a local HTTP server with an interactive Chart.js dashboard. The URL is printed in the OpenCode logs:

```
[Token Counter] Dashboard: http://localhost:PORT
```

Use the `tokens-dashboard` command to open it in your browser.

The dashboard supports:
- Daily, provider, and model breakdowns
- Adjustable time range (24h / 7d / 30d / 1y)
- CSV export from the browser

### CSV Export

Export usage data via the `tokens-export` command or by hitting the API directly:

```
http://localhost:PORT/api/export?period=7d
```

### Report Example

```
# Token Usage Report
**Period:** Jun 6, 2026 → Jun 13, 2026
**Range:** Last 7 Days

## Summary
| Metric | Value |
|--------|-------|
| Total Cost | $4.82 |
| Total Tokens | 1,234,567 |
| Input Tokens | 890,123 |
| Output Tokens | 298,765 |
| Reasoning Tokens | 32,109 |
| Cache Read | 13,570 |
| Cache Write | 5,432 |
| Sessions | 47 |

## Provider Breakdown
| Provider | Tokens | Cost | Sessions |
|----------|--------|------|----------|
| anthropic | 890,123 | $3.52 | 32 |
| openai | 344,444 | $1.30 | 15 |

## Model Breakdown
| Model | Tokens | Cost | Sessions |
|-------|--------|------|----------|
| claude-sonnet-4-6 | 650,000 | $2.80 | 22 |
| gpt-4o | 200,000 | $0.90 | 10 |

### Daily Token Usage
Jun 06 ▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃  123,456
Jun 07 ▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃  234,567
...
```

## Limitations

### Desktop Titlebar Button

OpenCode does not currently provide a plugin API for adding custom UI elements (buttons, panels, dialogs) to the Electron desktop renderer. Plugins run server-side and cannot modify the rendered interface. **Use Cmd+K or ask the AI as your quick-access mechanism instead.**

If OpenCode adds plugin UI injection points in the future, this plugin will be updated to support a native titlebar button.

### Slash Command Hooks

OpenCode v1.15.7 does not support the `command.execute.before` hook for slash commands. The plugin includes the hook as a forward-compatible fallback, but currently commands route through the AI which uses the `tokens` tool to generate responses.

### Built-in `opencode stats`

OpenCode has a built-in `opencode stats` command that tracks session-level token usage. This plugin provides additional value:
- Per-provider and per-model breakdowns
- Interactive web dashboard with Chart.js
- CSV export
- Configurable time ranges (24h / 7d / 30d / 1y)

## Data Storage

Token usage is stored in a SQLite database at:

```
~/.local/share/opencode/storage/plugin/opencode-token-counter/usage.db
```

The database is append-only — each assistant message creates one row.

## Development

```bash
git clone https://github.com/coldhell7/Opencode-token-counter.git
cd opencode-token-counter
```

The plugin is written in TypeScript and loaded directly by OpenCode's Bun runtime (no build step required).

## Publishing

To publish a new version to npm:

```bash
npm version patch  # or minor, or major
npm publish
```

## License

MIT
