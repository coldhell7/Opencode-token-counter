import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";

function actionsForPrompt(period: string): string {
  return (
    `Generate a comprehensive token usage report for the last ${period}.\n` +
    `Show:\n` +
    `- Total cost and tokens\n` +
    `- Input/output/reasoning/cache breakdown\n` +
    `- Provider breakdown (Anthropic, OpenAI, etc.)\n` +
    `- Model breakdown\n` +
    `- Daily usage trend\n\n` +
    `Use the \`tokens\` tool with action="report" and period="${period}" to get the data.`
  );
}

const COMMANDS = [
  {
    name: "tokens",
    title: "Token Usage (7 days)",
    description: "View token usage report for the last 7 days",
    prompt: actionsForPrompt("7d"),
  },
  {
    name: "tokens-24h",
    title: "Token Usage (24 hours)",
    description: "View token usage for the last 24 hours",
    prompt: actionsForPrompt("24h"),
  },
  {
    name: "tokens-30d",
    title: "Token Usage (30 days)",
    description: "View token usage for the last 30 days",
    prompt: actionsForPrompt("30d"),
  },
  {
    name: "tokens-dashboard",
    title: "Token Dashboard",
    description: "Open interactive token usage dashboard in browser",
    prompt: "Open the token usage dashboard in my browser. Use the tokens tool to get the dashboard URL if needed.",
  },
  {
    name: "tokens-export",
    title: "Export Tokens CSV",
    description: "Export token usage data as CSV",
    prompt:
      "Export my token usage data as a CSV file for the last 7 days. Use the tokens tool with action='export' and period='7d'.",
  },
] as const;

const tui: TuiPlugin = async (api) => {
  if (!api.command) return;

  api.command.register(() =>
    COMMANDS.map((cmd) => ({
      title: cmd.title,
      value: `token-counter:${cmd.name}`,
      description: cmd.description,
      category: "Token Counter",
      slash: { name: cmd.name },
      onSelect: async () => {
        try {
          const tuiClient = (api.client as any).tui;
          await tuiClient.clearPrompt();
          await tuiClient.appendPrompt({ text: cmd.prompt });
          await tuiClient.submitPrompt();
        } catch (e: any) {
          api.ui.toast({ variant: "error", message: "Token Counter: " + e.message });
        }
      },
    }))
  );
};

export default { id: "Token Counter", tui } as TuiPluginModule;
