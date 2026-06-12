import { tool } from "@opencode-ai/plugin";
import { TokenDB } from "./lib/db";
import type { Period } from "./lib/db";
import { generateFullReport, generateProviderReport, toCsv, generateWelcomeMessage } from "./lib/report";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const PLUGIN_NAME = "opencode-token-counter";
const DB_DIR = process.env.XDG_DATA_HOME
  ? join(process.env.XDG_DATA_HOME, "opencode", "storage", "plugin", PLUGIN_NAME)
  : join(process.env.HOME || "/tmp", ".local", "share", "opencode", "storage", "plugin", PLUGIN_NAME);
const WELCOME_FILE = join(DB_DIR, ".welcome_done");
const __dirname = dirname(fileURLToPath(import.meta.url));

let db: TokenDB | null = null;
let dashboardUrl = "";

function parsePeriod(val: string | undefined): Period {
  if (val === "24h" || val === "7d" || val === "30d" || val === "1y") return val;
  return "7d";
}

function getHtmlPath(): string {
  for (const p of [join(__dirname, "web", "index.html"), join(process.cwd(), "web", "index.html")]) {
    if (existsSync(p)) return p;
  }
  return "";
}

async function startDashboard(): Promise<string> {
  try {
    const htmlPath = getHtmlPath();
    if (!htmlPath) { console.error("[Token Counter] Dashboard HTML not found"); return ""; }
    const htmlContent = readFileSync(htmlPath, "utf-8");
    const server = Bun.serve({
      port: 0,
      async fetch(req: Request): Promise<Response> {
        const url = new URL(req.url);
        const h = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "*" };
        if (req.method === "OPTIONS") return new Response(null, { headers: h });
        try {
          if (url.pathname === "/" || url.pathname === "") return new Response(htmlContent, { headers: { "Content-Type": "text/html; charset=utf-8", ...h } });
          if (url.pathname === "/api/stats") {
            const period = parsePeriod(url.searchParams.get("period") || "7d");
            const by = url.searchParams.get("by");
            if (by === "provider") return Response.json(db!.getProviderStats(period));
            if (by === "model") return Response.json(db!.getModelStats(period));
            if (by === "daily") return Response.json(db!.getDailyUsage(period));
            if (by === "daily-provider") return Response.json(db!.getDailyProviderCost(period));
            return Response.json(db!.getStats(period));
          }
          if (url.pathname === "/api/export") {
            const period = parsePeriod(url.searchParams.get("period") || "7d");
            return new Response(toCsv(db!.getAllRawRecords(period)), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="token-usage-${period}.csv"`, ...h } });
          }
          return new Response("Not Found", { status: 404, headers: h });
        } catch (e: any) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...h } }); }
      },
    });
    dashboardUrl = `http://localhost:${server.port}`;
    console.error("[Token Counter] Dashboard:", dashboardUrl);
    return dashboardUrl;
  } catch (e: any) { console.error("[Token Counter] Dashboard error:", e.message); return ""; }
}

function openBrowser(url: string) {
  Bun.spawnSync([process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open", url]);
}

function buildReport(action: string | undefined, periodStr: string | undefined): string {
  const period = parsePeriod(periodStr);
  if (action === "dashboard") return dashboardUrl ? (openBrowser(dashboardUrl), `Dashboard opened at ${dashboardUrl}`) : "Dashboard not running.";
  if (action === "providers") return generateProviderReport(db!.getProviderStats(period), db!.getModelStats(period));
  if (action === "export") {
    const records = db!.getAllRawRecords(period);
    const csv = toCsv(records);
    const p = join(DB_DIR, `export-${period}-${Date.now()}.csv`);
    Bun.writeSync(p, csv);
    return `Exported ${records.length} records to \`${p}\``;
  }
  return generateFullReport(period, db!.getStats(period), db!.getProviderStats(period), db!.getModelStats(period), db!.getDailyUsage(period));
}

async function main() {
  if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });
  db = new TokenDB(join(DB_DIR, "usage.db"));
  await startDashboard();

  let welcomePending = !existsSync(WELCOME_FILE);
  if (welcomePending) {
    writeFileSync(WELCOME_FILE, Date.now().toString(), "utf-8");
    console.error("[Token Counter] ================================================");
    console.error("[Token Counter]  Token Counter v0.2.0 installed! Restart OpenCode");
    console.error("[Token Counter]  then run /tokens report to get started.");
    console.error("[Token Counter] ================================================");
  }

  return {
    config: async (cfg: any) => {
      cfg.command = cfg.command || {};
      cfg.command["tokens"] = { description: "View token usage report (7d)", template: "/tokens report 7d" };
      cfg.command["tokens-24h"] = { description: "View token usage (24h)", template: "/tokens report 24h" };
      cfg.command["tokens-dashboard"] = { description: "Open interactive dashboard in browser", template: "/tokens dashboard" };
    },

    "command.execute.before": async (input: any, output: any) => {
      if (input.command !== "tokens") return;
      const args = input.arguments.trim().split(/\s+/);
      let text = buildReport(args[0] || "report", args[1] || "7d");
      if (welcomePending) {
        welcomePending = false;
        text = generateWelcomeMessage(text);
      }
      output.parts = [{ type: "text", id: crypto.randomUUID(), sessionID: input.sessionID, messageID: "", text }];
    },

    event: async ({ event }: any) => {
      try {
        if (event.type === "message.updated" && event.properties.info.role === "assistant") {
          const m = event.properties.info;
          db!.insert({ timestamp: Date.now(), sessionID: m.sessionID, providerID: m.providerID || "unknown", modelID: m.modelID || "unknown", tokens: m.tokens || { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, cost: m.cost || 0 });
        }
      } catch (e: any) { console.error("[Token Counter] Event error:", e.message); }
    },

    tool: {
      tokens: tool({
        description: "Get token usage statistics for AI spending tracking.",
        args: {
          action: tool.schema.enum(["report", "providers", "export"]).optional().describe("report / providers / export"),
          period: tool.schema.enum(["24h", "7d", "30d", "1y"]).optional().describe("24h / 7d / 30d / 1y"),
        },
        async execute(args: any) {
          const p = parsePeriod(args.period);
          if (args.action === "providers") return { title: "Provider & Model Usage", output: generateProviderReport(db!.getProviderStats(p), db!.getModelStats(p)) };
          if (args.action === "export") {
            const records = db!.getAllRawRecords(p);
            const csv = toCsv(records);
            const fp = join(DB_DIR, `export-${p}-${Date.now()}.csv`);
            await Bun.write(fp, csv);
            return { title: `CSV Export (${p})`, output: `Exported ${records.length} records to ${fp}` };
          }
          return { title: `Token Usage (${p})`, output: generateFullReport(p, db!.getStats(p), db!.getProviderStats(p), db!.getModelStats(p), db!.getDailyUsage(p)) };
        },
      }),
    },
  };
}

main.id = "Token Counter";

export async function tui(api: any) {
  let totalTokens = 0, totalCost = 0;
  const dispose = api.event.on("message.updated", (event: any) => {
    const m = event.properties.info;
    if (m.role === "assistant" && m.tokens) {
      totalTokens += m.tokens.input + m.tokens.output + m.tokens.reasoning + m.tokens.cache.read + m.tokens.cache.write;
      totalCost += m.cost || 0;
    }
  });
  api.keymap.registerLayer({
    commands: [
      { id: "token-counter.report", title: "Token Counter: Report", category: "Token Counter", group: "plugin", onDispatch: () => api.keymap.dispatchCommand("command.palette.show", { text: "/tokens report" }) },
      { id: "token-counter.dashboard", title: "Token Counter: Dashboard", category: "Token Counter", group: "plugin", onDispatch: () => api.keymap.dispatchCommand("command.palette.show", { text: "/tokens dashboard" }) },
    ],
  });
  api.lifecycle.onDispose(() => dispose());
}

export default main;
