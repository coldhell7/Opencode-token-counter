# Token Counter

An OpenCode plugin that automatically tracks token usage, cost, and provider/model statistics across all your sessions.

## Features

- **Automatic Tracking** — Listens for assistant messages and records token usage in real-time
- **Provider & Model Breakdown** — See consumption per provider (Anthropic, OpenAI, etc.) and per model
- **In-Chat Reports** — Formatted markdown reports with tables and unicode sparklines
- **Interactive Web Dashboard** — Chart.js dashboard with line, bar, donut, and stacked charts
- **CSV Export** — Download raw data for external analysis
- **Four Time Periods** — 24 hours, 7 days, 30 days, 1 year
- **CLI (TUI) Support** — Command palette integration and event tracking in the terminal version
- **Lightweight** — SQLite via Bun's built-in library (zero external dependencies)

## Installation

### Via npm

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugin": [
    "opencode-token-counter"
  ]
}
```

### Via local file

Clone the repository and add the absolute path:

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugin": [
    "/path/to/opencode-token-counter/server.ts"
  ]
}
```

### First Run

After adding the plugin to your config, **restart OpenCode**. The plugin will start tracking tokens automatically. Run `/tokens report` in any session to see your first report and a welcome guide.

## Usage

### Quick Access (Cmd+K / Ctrl+K)

Press **Cmd+K** (Mac) or **Ctrl+K** (Linux/Windows) and type one of:

| Command Palette Entry | Action |
|---|---|
| `tokens` | View 7-day usage report |
| `tokens-24h` | View 24-hour usage report |
| `tokens-30d` | View 30-day usage report |
| `tokens-dashboard` | Open interactive charts in browser |

### Slash Commands

Type these directly in any session:

| Command | Description |
|---------|-------------|
| `/tokens report 7d` | Usage report for last 7 days (default) |
| `/tokens report 24h` | Usage report for last 24 hours |
| `/tokens report 30d` | Usage report for last 30 days |
| `/tokens report 1y` | Usage report for last year |
| `/tokens providers` | Breakdown by provider and model |
| `/tokens dashboard` | Open interactive Chart.js dashboard in browser |
| `/tokens export 7d` | Export raw data as CSV |

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

OpenCode does not currently provide a plugin API for adding custom UI elements (buttons, panels, dialogs) to the Electron desktop renderer. Plugins run server-side and cannot modify the rendered interface. **Use Cmd+K or `/tokens` commands as your quick-access mechanism instead.**

If OpenCode adds plugin UI injection points in the future, this plugin will be updated to support a native titlebar button.

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
