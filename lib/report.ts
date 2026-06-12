import type { PeriodStats, ProviderStats, ModelStats, DailyUsage, Period } from "./db";

const SPARK_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

function sparkline(values: number[], width: number = 20): string {
  if (values.length === 0) return "";
  const max = Math.max(...values, 1);
  const step = Math.max(1, Math.floor(values.length / width));
  const sampled = values.filter((_, i) => i % step === 0).slice(0, width);
  return sampled.map((v) => SPARK_CHARS[Math.min(7, Math.floor((v / max) * 8))]).join("");
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatCost(n: number): string {
  return "$" + n.toFixed(2);
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

function formatDateFull(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", {
    month: "short", day: "2-digit", year: "numeric",
  });
}

function periodLabel(p: Period): string {
  return { "24h": "Last 24 Hours", "7d": "Last 7 Days", "30d": "Last 30 Days", "1y": "Last Year" }[p];
}

export function generateSummaryTable(stats: PeriodStats): string {
  return [
    "| Metric | Value |",
    "|--------|-------|",
    `| Total Cost | ${formatCost(stats.totalCost)} |`,
    `| Total Tokens | ${formatNumber(stats.totalTokens)} |`,
    `| Input Tokens | ${formatNumber(stats.inputTokens)} |`,
    `| Output Tokens | ${formatNumber(stats.outputTokens)} |`,
    `| Reasoning Tokens | ${formatNumber(stats.reasoningTokens)} |`,
    `| Cache Read | ${formatNumber(stats.cacheRead)} |`,
    `| Cache Write | ${formatNumber(stats.cacheWrite)} |`,
    `| Sessions | ${stats.totalSessions} |`,
  ].join("\n");
}

export function generateProviderTable(providers: ProviderStats[]): string {
  if (providers.length === 0) return "_No data._";
  const rows = [
    "| Provider | Tokens | Cost | Sessions |",
    "|----------|--------|------|----------|",
  ];
  for (const p of providers) {
    rows.push(`| ${p.providerID} | ${formatNumber(p.totalTokens)} | ${formatCost(p.totalCost)} | ${p.sessionCount} |`);
  }
  return rows.join("\n");
}

export function generateModelTable(models: ModelStats[]): string {
  if (models.length === 0) return "_No data._";
  const rows = [
    "| Model | Provider | Tokens | Cost | Sessions |",
    "|-------|----------|--------|------|----------|",
  ];
  for (const m of models) {
    rows.push(`| ${m.modelID} | ${m.providerID} | ${formatNumber(m.totalTokens)} | ${formatCost(m.totalCost)} | ${m.sessionCount} |`);
  }
  return rows.join("\n");
}

export function generateSparklineSection(daily: DailyUsage[]): string {
  if (daily.length === 0) return "_No daily data._";
  const values = daily.map((d) => d.totalTokens);
  const lines: string[] = [];
  lines.push("### Daily Token Usage");
  lines.push("");
  for (let i = 0; i < daily.length; i++) {
    const d = daily[i];
    const sp = sparkline(values, 24);
    const label = formatDate(d.timestamp).padEnd(8);
    lines.push(`${label} ${sp}  ${formatNumber(d.totalTokens)}`);
  }
  return lines.join("\n");
}

export function generateFullReport(
  period: Period,
  stats: PeriodStats,
  providers: ProviderStats[],
  models: ModelStats[],
  daily: DailyUsage[],
): string {
  const lines: string[] = [];

  lines.push(`# Token Usage Report`);
  lines.push(`**Period:** ${formatDateFull(stats.startTime)} → ${formatDateFull(stats.endTime)}`);
  lines.push(`**Range:** ${periodLabel(period)}`);
  lines.push("");

  lines.push("## Summary");
  lines.push(generateSummaryTable(stats));
  lines.push("");

  lines.push("## Provider Breakdown");
  lines.push(generateProviderTable(providers));
  lines.push("");

  lines.push("## Model Breakdown");
  lines.push(generateModelTable(models));
  lines.push("");

  lines.push(generateSparklineSection(daily));
  lines.push("");

  lines.push("---");
  lines.push(`> Run \`/tokens dashboard\` for interactive charts.`);
  lines.push(`> Run \`/tokens export csv ${period}\` to download raw data.`);

  return lines.join("\n");
}

export function generateProviderReport(providers: ProviderStats[], models: ModelStats[]): string {
  const lines: string[] = [];

  lines.push("# Provider & Model Usage");
  lines.push("");

  lines.push("## By Provider");
  lines.push(generateProviderTable(providers));
  lines.push("");

  lines.push("## By Model");
  lines.push(generateModelTable(models));

  return lines.join("\n");
}

export function toCsv(records: { timestamp: number; sessionID: string; providerID: string; modelID: string; tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }; cost: number }[]): string {
  const header = "timestamp,date,session_id,provider_id,model_id,tokens_input,tokens_output,tokens_reasoning,cache_read,cache_write,cost";
  const rows = records.map((r) => {
    const date = new Date(r.timestamp).toISOString();
    return `${r.timestamp},${date},${r.sessionID},${r.providerID},${r.modelID},${r.tokens.input},${r.tokens.output},${r.tokens.reasoning},${r.tokens.cache.read},${r.tokens.cache.write},${r.cost}`;
  });
  return [header, ...rows].join("\n");
}

export function generateWelcomeMessage(reportContent: string): string {
  return [
    "## Welcome to Token Counter! \u2705",
    "",
    "Your token usage is now being automatically tracked. ",
    "Since this is your first time, here is your first report:",
    "",
    reportContent,
    "",
    "---",
    "",
    "### How to Use",
    "",
    "| Command | Description |",
    "|---------|-------------|",
    "| `/tokens report [period]` | View usage report (period: 24h, 7d, 30d, 1y) |",
    "| `/tokens dashboard` | Open interactive charts in your browser |",
    "| `/tokens providers` | Breakdown by provider and model |",
    "| `/tokens export [period]` | Download raw data as CSV |",
    "",
    "Or press **Cmd+K** (Mac) / **Ctrl+K** (Linux/Windows) and type `tokens`.",
    "",
    "> Note: OpenCode does not currently provide a plugin API for adding buttons to the desktop titlebar. ",
    "> Use Cmd+K or the /tokens command as your quick-access button.",
    "",
    "---",
    "",
    "**Dashboard URL:** Check your browser or run `/tokens dashboard`",
    "**Data location:** `~/.local/share/opencode/storage/plugin/opencode-token-counter/usage.db`",
  ].join("\n");
}

export { formatNumber, formatCost, formatDate, formatDateFull, periodLabel };
