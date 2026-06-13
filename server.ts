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

function openBrowser(url: string) {
  Bun.spawnSync([process.platform === "darwin" ? "open" : "xdg-open", url]);
}

function actionsForPrompt(periodStr: string): string {
  return `Generate a comprehensive token usage report for the last ${periodStr}.
Show:
- Total cost and tokens
- Input/output/reasoning/cache breakdown
- Provider breakdown (Anthropic, OpenAI, etc.)
- Model breakdown
- Daily usage trend

Use the \`tokens\` tool with action="report" and period="${periodStr}" to get the data.`;
}

export default {
  id: "Token Counter",

  server: async () => {
    if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });

    try {
      db = new TokenDB(join(DB_DIR, "usage.db"));
    } catch (e: any) {
      console.error("[Token Counter] DB init error:", e.message);
    }

    const htmlPath = getHtmlPath();
    let dashboardUrl = "";

    if (htmlPath) {
      try {
        const htmlContent = readFileSync(htmlPath, "utf-8");
        const srv = Bun.serve({
          port: 0,
          async fetch(req: Request): Promise<Response> {
            const url = new URL(req.url);
            const h = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "*" };
            if (req.method === "OPTIONS") return new Response(null, { headers: h });
            try {
              if (url.pathname === "/" || url.pathname === "")
                return new Response(htmlContent, { headers: { "Content-Type": "text/html; charset=utf-8", ...h } });
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
                return new Response(toCsv(db!.getAllRawRecords(period)), {
                  headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="token-usage-${period}.csv"`, ...h },
                });
              }
              return new Response("Not Found", { status: 404, headers: h });
            } catch (e: any) {
              return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...h } });
            }
          },
        });
        dashboardUrl = `http://localhost:${srv.port}`;
        console.error("[Token Counter] Dashboard:", dashboardUrl);
      } catch (e: any) {
        console.error("[Token Counter] Dashboard error:", e.message);
      }
    }

    let welcomePending = !existsSync(WELCOME_FILE);
    if (welcomePending) {
      writeFileSync(WELCOME_FILE, Date.now().toString(), "utf-8");
      console.error("");
      console.error("================================================");
      console.error("  Token Counter v0.2.3 installed!");
      console.error("  Run /tokens report to get started.");
      console.error("  Or press Cmd+K and type 'tokens'.");
      console.error("================================================");
      console.error("");
    }

    return {
      config: async (cfg: any) => {
        if (!cfg.command) cfg.command = {};
        cfg.command["tokens"] = { description: "View token usage report (7 days)", template: actionsForPrompt("7d") };
        cfg.command["tokens-24h"] = { description: "View token usage (last 24 hours)", template: actionsForPrompt("24h") };
        cfg.command["tokens-30d"] = { description: "View token usage (last 30 days)", template: actionsForPrompt("30d") };
        cfg.command["tokens-dashboard"] = { description: "Open interactive dashboard in browser", template: "Open the token usage dashboard in my browser at " + dashboardUrl };
        cfg.command["tokens-export"] = { description: "Export token usage as CSV", template: "Export my token usage data as a CSV file for the last 7 days. Use the tokens tool with action='export' and period='7d'." };
      },

      "command.execute.before": async (input: any, output: any) => {
        if (input.command !== "tokens") return;
        try {
          if (!db) {
            output.parts = [{ type: "text", id: crypto.randomUUID(), sessionID: input.sessionID, messageID: crypto.randomUUID(), text: "Token Counter database is not initialized. Please restart OpenCode." }];
            return;
          }
          const args = (input.arguments || "").trim().split(/\s+/);
          const period = parsePeriod(args[1]);
          let text: string;
          if (args[0] === "dashboard") {
            text = dashboardUrl ? (openBrowser(dashboardUrl), "Dashboard opened at " + dashboardUrl) : "Dashboard not running.";
          } else if (args[0] === "providers") {
            text = generateProviderReport(db.getProviderStats(period), db.getModelStats(period));
          } else if (args[0] === "export") {
            const records = db.getAllRawRecords(period);
            const csv = toCsv(records);
            const fp = join(DB_DIR, `export-${period}-${Date.now()}.csv`);
            writeFileSync(fp, csv, "utf-8");
            text = "Exported " + records.length + " records to " + fp;
          } else {
            text = generateFullReport(period, db.getStats(period), db.getProviderStats(period), db.getModelStats(period), db.getDailyUsage(period));
          }
          if (welcomePending) {
            welcomePending = false;
            text = generateWelcomeMessage(text);
          }
          output.parts = [{ type: "text", id: crypto.randomUUID(), sessionID: input.sessionID, messageID: crypto.randomUUID(), text }];
        } catch (e: any) {
          console.error("[Token Counter] Hook error:", e.message);
        }
      },

      event: async ({ event }: any) => {
        try {
          if (!db) return;
          if (event.type === "message.updated" && event.properties?.info?.role === "assistant") {
            const m = event.properties.info;
            db.insert({
              timestamp: Date.now(),
              sessionID: m.sessionID,
              providerID: m.providerID || "unknown",
              modelID: m.modelID || "unknown",
              tokens: m.tokens || { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              cost: m.cost || 0,
            });
          }
        } catch (e: any) {
          console.error("[Token Counter] Event error:", e.message);
        }
      },

      tool: {
        tokens: tool({
          description: "Get token usage and cost statistics for the current OpenCode session. Call this when the user asks about their token usage, AI spending, provider costs, or wants to export usage data. Returns formatted markdown tables with sparklines.",
          args: {
            action: tool.schema.enum(["report", "providers", "export"]).optional().describe("What to show: report=full summary, providers=breakdown by provider/model, export=CSV download"),
            period: tool.schema.enum(["24h", "7d", "30d", "1y"]).optional().describe("Time range: 24h, 7d (default), 30d, 1y"),
          },
          async execute(args: any) {
            if (!db) return { title: "Error", output: "Token Counter database is not initialized. Please restart OpenCode." };
            const p = parsePeriod(args.period);
            if (args.action === "providers") return { title: "Provider & Model Usage", output: generateProviderReport(db.getProviderStats(p), db.getModelStats(p)) };
            if (args.action === "export") {
              const records = db.getAllRawRecords(p);
              const csv = toCsv(records);
              const fp = join(DB_DIR, `export-${p}-${Date.now()}.csv`);
              await Bun.write(fp, csv);
              return { title: "CSV Export (" + p + ")", output: "Exported " + records.length + " records to " + fp };
            }
            return { title: "Token Usage (" + p + ")", output: generateFullReport(p, db.getStats(p), db.getProviderStats(p), db.getModelStats(p), db.getDailyUsage(p)) };
          },
        }),
      },
    };
  },
};
