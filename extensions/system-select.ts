import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { bundledAgentsDir, bundledPiPiAgentsDir } from "./lib/packagePaths.ts";

type AgentDef = {
  name: string;
  description: string;
  tools: string[];
  body: string;
  source: string;
};

function parseFrontmatter(raw: string): { fields: Record<string, string>; body: string } {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { fields: {}, body: raw };
  const fields: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { fields, body: match[2] };
}

function scanAgents(dir: string, source: string): AgentDef[] {
  if (!existsSync(dir)) return [];
  const agents: AgentDef[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;
    const raw = readFileSync(join(dir, file), "utf-8");
    const { fields, body } = parseFrontmatter(raw);
    agents.push({
      name: fields.name || basename(file, ".md"),
      description: fields.description || "",
      tools: fields.tools ? fields.tools.split(",").map((tool) => tool.trim()).filter(Boolean) : [],
      body: body.trim(),
      source,
    });
  }
  return agents;
}

function displayName(name: string): string {
  return name.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export default function (pi: ExtensionAPI) {
  let activeAgent: AgentDef | null = null;
  let allAgents: AgentDef[] = [];
  let defaultTools: string[] = [];

  pi.on("session_start", async (_event, ctx) => {
    activeAgent = null;
    allAgents = [];

    const dirs: [string, string][] = [
      [join(ctx.cwd, ".pi", "agents"), ".pi"],
      [join(ctx.cwd, "agents"), "agents"],
      [bundledAgentsDir, "openpi"],
      [bundledPiPiAgentsDir, "openpi/pi-pi"],
      [join(homedir(), ".pi", "agent", "agents"), "~/.pi"],
    ];

    const seen = new Set<string>();
    const sourceCounts: Record<string, number> = {};

    for (const [dir, source] of dirs) {
      for (const agent of scanAgents(dir, source)) {
        const key = agent.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        allAgents.push(agent);
        sourceCounts[source] = (sourceCounts[source] || 0) + 1;
      }
    }

    defaultTools = pi.getActiveTools();
    if (ctx.hasUI) {
      ctx.ui.setStatus("system-prompt", "System Prompt: Default");
      const loaded = Object.entries(sourceCounts).map(([src, count]) => `${count} from ${src}`).join(", ");
      ctx.ui.notify(allAgents.length ? `Loaded ${allAgents.length} Pi agents (${loaded})` : "No Pi agents found", "info");
    }
  });

  pi.registerCommand("system", {
    description: "Select a Pi-native system persona",
    handler: async (_args, ctx) => {
      if (allAgents.length === 0) {
        ctx.ui.notify("No agents found in .pi/agents, agents, or bundled openpi agents", "warning");
        return;
      }

      const options = ["Reset to Default", ...allAgents.map((agent) => `${agent.name} - ${agent.description} [${agent.source}]`)];
      const choice = await ctx.ui.select("Select System Prompt", options);
      if (choice === undefined) return;

      if (choice === options[0]) {
        activeAgent = null;
        pi.setActiveTools(defaultTools);
        ctx.ui.setStatus("system-prompt", "System Prompt: Default");
        ctx.ui.notify("System Prompt reset to Default", "success");
        return;
      }

      const agent = allAgents[options.indexOf(choice) - 1];
      activeAgent = agent;
      pi.setActiveTools(agent.tools.length ? agent.tools : defaultTools);
      ctx.ui.setStatus("system-prompt", `System Prompt: ${displayName(agent.name)}`);
      ctx.ui.notify(`System Prompt switched to: ${displayName(agent.name)}`, "success");
    },
  });

  pi.on("before_agent_start", async (event) => {
    if (!activeAgent) return;
    return {
      systemPrompt: `${activeAgent.body}\n\n${event.systemPrompt}`,
    };
  });
}
