# Token Counter

An OpenCode plugin that automatically tracks token usage, cost, and provider/model statistics across all your AI sessions.

Automatic tracking, slash commands, AI tool, CSV export, and a full Chart.js dashboard.

## Installation

### Via GitHub (clone)

```bash
git clone https://github.com/coldhell7/Opencode-token-counter.git
```

Then add the plugin to your OpenCode config:

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugin": [
    "/path/to/Opencode-token-counter/server.ts"
  ]
}
```

### Via npm (once published)

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugin": [
    "opencode-token-counter"
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
