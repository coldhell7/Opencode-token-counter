import { tool } from "@opencode-ai/plugin";
import { TokenDB } from "./lib/db";
import type { Period } from "./lib/db";
import { generateFullReport, generateProviderReport, toCsv, generateWelcomeMessage } from "./lib/report";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const PLUGIN_NAME = "opencode-token-counter";
const DB_DIR = process.env.XDG_DATA_HOME
  ? join(process.env.XDG_DATA_HOME, "opencode", "storage", "plugin", PLUGIN_NAME)
  : join(process.env.HOME || "/tmp", ".local", "share", "opencode", "storage", "plugin", PLUGIN_NAME);
const WELCOME_FILE = join(DB_DIR, ".welcome_done");

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: TokenDB;
let dashboardUrl = "";
let isFirstRun = false;

function parsePeriod(val: string | undefined): Period {
  if (val === "24h" || val === "7d" || val === "30d" || val === "1y") return val;
  return "7d";
}

function getHtmlPath(): string {
  const candidates = [
    join(__dirname, "web", "index.html"),
    join(process.cwd(), "web", "index.html"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return "";
}

async function startDashboard(): Promise<string> {
  try {
    const htmlPath = getHtmlPath();
    if (!htmlPath) {
      console.error("[Token Counter] Dashboard HTML not found at expected paths");
      return "";
    }
    const htmlContent = readFileSync(htmlPath, "utf-8");
    const server = Bun.serve({
      port: 0,
      async fetch(req: Request): Promise<Response> {
        const url = new URL(req.url);
        const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "*" };
        if (req.method === "OPTIONS") return new Response(null, { headers });
        try {
          if (url.pathname === "/" || url.pathname === "") {
            return new Response(htmlContent, { headers: { "Content-Type": "text/html; charset=utf-8", ...headers } });
          }
          if (url.pathname === "/api/stats") {
            const period = parsePeriod(url.searchParams.get("period") || "7d");
            const by = url.searchParams.get("by");
            if (by === "provider") return Response.json(db.getProviderStats(period));
            if (by === "model") return Response.json(db.getModelStats(period));
            if (by === "daily") return Response.json(db.getDailyUsage(period));
            if (by === "daily-provider") return Response.json(db.getDailyProviderCost(period));
            return Response.json(db.getStats(period));
          }
          if (url.pathname === "/api/export") {
            const period = parsePeriod(url.searchParams.get("period") || "7d");
            const records = db.getAllRawRecords(period);
            return new Response(toCsv(records), {
              headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="token-usage-${period}.csv"`, ...headers },
            });
          }
          return new Response("Not Found", { status: 404, headers });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json", ...headers } });
        }
      },
    });
    dashboardUrl = `http://localhost:${server.port}`;
    console.error(`[Token Counter] Dashboard started at ${dashboardUrl}`);
    return dashboardUrl;
  } catch (err: any) {
    console.error(`[Token Counter] Dashboard error: ${err.message}`);
    return "";
  }
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  Bun.spawnSync([cmd, url]);
}

function handleCommand(action: string | undefined, periodStr: string | undefined): string {
  const period = parsePeriod(periodStr);

  if (action === "dashboard") {
    if (dashboardUrl) {
      openBrowser(dashboardUrl);
      return `Dashboard opened at ${dashboardUrl}`;
    }
    return "Dashboard server is not running. Try restarting OpenCode.";
  }

  if (action === "providers") {
    const providers = db.getProviderStats(period);
    const models = db.getModelStats(period);
    return generateProviderReport(providers, models);
  }

  if (action === "export") {
    const records = db.getAllRawRecords(period);
    const csv = toCsv(records);
    const exportPath = join(DB_DIR, `export-${period}-${Date.now()}.csv`);
    Bun.writeSync(exportPath, csv);
    return `Exported **${records.length}** records to \`${exportPath}\``;
  }

  const stats = db.getStats(period);
  const providers = db.getProviderStats(period);
  const models = db.getModelStats(period);
  const daily = db.getDailyUsage(period);
  return generateFullReport(period, stats, providers, models, daily);
}

export default {
  id: "Token Counter",

  server: async () => {
    const dbPath = join(DB_DIR, "usage.db");
    db = new TokenDB(dbPath);
    isFirstRun = !existsSync(WELCOME_FILE);

    if (isFirstRun) {
      console.error("");
      console.error("================================================");
      console.error("  Token Counter plugin installed successfully!");
      console.error("  Please restart OpenCode to activate.");
      console.error("================================================");
      console.error("");
    }

    console.error(`[Token Counter] DB: ${dbPath}`);
    console.error(`[Token Counter] First run: ${isFirstRun}`);

    await startDashboard();

    return {
      config: async (cfg: any) => {
        cfg.command = cfg.command || {};
        cfg.command["tokens"] = { description: "View token usage report (7 days)", template: "/tokens report 7d" };
        cfg.command["tokens-24h"] = { description: "View token usage (last 24 hours)", template: "/tokens report 24h" };
        cfg.command["tokens-30d"] = { description: "View token usage (last 30 days)", template: "/tokens report 30d" };
        cfg.command["tokens-dashboard"] = { description: "Open interactive token dashboard in browser", template: "/tokens dashboard" };
      },

      "command.execute.before": async (input: any, output: any) => {
        if (input.command !== "tokens") return;

        const args = input.arguments.trim().split(/\s+/);
        const action = args[0] || "report";
        const periodStr = args[1] || "7d";

        let text = "";

        if (isFirstRun) {
          isFirstRun = false;
          try { writeFileSync(WELCOME_FILE, new Date().toISOString(), "utf-8"); } catch {}
          text = generateWelcomeMessage(handleCommand(action, periodStr));
        } else {
          text = handleCommand(action, periodStr);
        }

        output.parts = [{
          type: "text",
          id: crypto.randomUUID(),
          sessionID: input.sessionID,
          messageID: "",
          text,
        }];
      },

      event: async ({ event }: any) => {
        try {
          if (event.type === "message.updated") {
            const msg = event.properties.info;
            if (msg.role === "assistant") {
              db.insert({
                timestamp: Date.now(),
                sessionID: msg.sessionID,
                providerID: msg.providerID || "unknown",
                modelID: msg.modelID || "unknown",
                tokens: msg.tokens || { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
                cost: msg.cost || 0,
              });
            }
          }
        } catch (err: any) {
          console.error(`[Token Counter] Event error: ${err.message}`);
        }
      },

      tool: {
        tokens: tool({
          description: "Get token usage statistics. Use this when the user asks about their token usage, cost, or AI spending.",
          args: {
            action: tool.schema.enum(["report", "providers", "export"]).optional().describe("Type of report"),
            period: tool.schema.enum(["24h", "7d", "30d", "1y"]).optional().describe("Time period"),
          },
          async execute(args: any, ctx: any) {
            const period = parsePeriod(args.period);
            const action = args.action || "report";

            if (action === "providers") {
              return { title: "Provider & Model Usage", output: generateProviderReport(db.getProviderStats(period), db.getModelStats(period)) };
            }

            if (action === "export") {
              const records = db.getAllRawRecords(period);
              const csv = toCsv(records);
              const exportPath = join(DB_DIR, `export-${period}-${Date.now()}.csv`);
              await Bun.write(exportPath, csv);
              return { title: "CSV Export", output: `Exported ${records.length} records to ${exportPath}`, metadata: { count: records.length, path: exportPath } };
            }

            const stats = db.getStats(period);
            const providers = db.getProviderStats(period);
            const models = db.getModelStats(period);
            const daily = db.getDailyUsage(period);
            return { title: `Token Usage Report (${period})`, output: generateFullReport(period, stats, providers, models, daily) };
          },
        }),
      },
    };
  },

  tui: async (api: any) => {
    let totalTokens = 0;
    let totalCost = 0;
    const dispose = api.event.on("message.updated", (event: any) => {
      const msg = event.properties.info;
      if (msg.role === "assistant" && msg.tokens) {
        const t = msg.tokens;
        totalTokens += t.input + t.output + t.reasoning + t.cache.read + t.cache.write;
        totalCost += msg.cost || 0;
      }
    });
    api.keymap.registerLayer({
      commands: [
        { id: "token-counter.report", title: "Token Counter: View Usage Report", category: "Token Counter", group: "plugin", onDispatch: () => api.keymap.dispatchCommand("command.palette.show", { text: "/tokens report" }) },
        { id: "token-counter.dashboard", title: "Token Counter: Open Dashboard", category: "Token Counter", group: "plugin", onDispatch: () => api.keymap.dispatchCommand("command.palette.show", { text: "/tokens dashboard" }) },
      ],
    });
    api.lifecycle.onDispose(() => dispose());
  },
};
