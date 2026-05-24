import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { spawn } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { parse as parseYaml } from "yaml";
import { bundledAgentsDir } from "./lib/packagePaths.ts";
import { arrayField, parseMarkdownFrontmatter, stringField } from "./lib/markdown.ts";

type AgentDef = {
  name: string;
  description: string;
  tools: string;
  systemPrompt: string;
  file: string;
};

type AgentState = {
  def: AgentDef;
  status: "idle" | "running" | "done" | "error";
  task: string;
  elapsed: number;
  lastWork: string;
  sessionFile: string | null;
};

function displayName(name: string): string {
  return name.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function parseTeamsYaml(raw: string): Record<string, string[]> {
  const parsed = parseYaml(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  const teams: Record<string, string[]> = {};
  for (const [name, members] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(members)) continue;
    teams[name] = members.filter((member): member is string => typeof member === "string");
  }
  return teams;
}

function parseAgentFile(filePath: string): AgentDef | null {
  const raw = readFileSync(filePath, "utf-8");
  const { frontmatter, body } = parseMarkdownFrontmatter(raw);
  const name = stringField(frontmatter.name);
  if (!name) return null;

  return {
    name,
    description: stringField(frontmatter.description),
    tools: arrayField(frontmatter.tools).join(",") || "read,grep,find,ls",
    systemPrompt: body,
    file: filePath,
  };
}

function writeSystemPromptFile(agentKey: string, systemPrompt: string): { dir: string; filePath: string } {
  const dir = mkdtempSync(join(tmpdir(), "openpi-team-"));
  const filePath = join(dir, `system-${agentKey.replace(/[^\w.-]+/g, "_")}.md`);
  writeFileSync(filePath, systemPrompt, { encoding: "utf-8", mode: 0o600 });
  return { dir, filePath };
}

function scanAgentDirs(cwd: string): AgentDef[] {
  const dirs = [join(cwd, ".pi", "agents"), join(cwd, "agents"), bundledAgentsDir];
  const agents: AgentDef[] = [];
  const seen = new Set<string>();

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".md")) continue;
      const def = parseAgentFile(resolve(dir, file));
      if (!def) continue;
      const key = def.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      agents.push(def);
    }
  }

  return agents;
}

export default function (pi: ExtensionAPI) {
  const agentStates = new Map<string, AgentState>();
  let allAgentDefs: AgentDef[] = [];
  let teams: Record<string, string[]> = {};
  let activeTeamName = "";
  let sessionDir = "";
  let widgetCtx: any;

  function loadAgents(cwd: string) {
    sessionDir = join(cwd, ".pi", "agent-sessions");
    mkdirSync(sessionDir, { recursive: true });
    allAgentDefs = scanAgentDirs(cwd);

    const teamsPath = [join(cwd, ".pi", "agents", "teams.yaml"), join(bundledAgentsDir, "teams.yaml")].find((candidate) => existsSync(candidate));
    teams = teamsPath ? parseTeamsYaml(readFileSync(teamsPath, "utf-8")) : {};
    if (Object.keys(teams).length === 0) teams = { all: allAgentDefs.map((agent) => agent.name) };
  }

  function activateTeam(teamName: string) {
    activeTeamName = teamName;
    const defsByName = new Map(allAgentDefs.map((agent) => [agent.name.toLowerCase(), agent]));
    agentStates.clear();

    for (const member of teams[teamName] || []) {
      const def = defsByName.get(member.toLowerCase());
      if (!def) continue;
      const key = def.name.toLowerCase();
      const sessionFile = join(sessionDir, `${key}.json`);
      agentStates.set(key, {
        def,
        status: "idle",
        task: "",
        elapsed: 0,
        lastWork: "",
        sessionFile: existsSync(sessionFile) ? sessionFile : null,
      });
    }
  }

  function updateWidget() {
    if (!widgetCtx) return;
    widgetCtx.ui.setWidget("openpi-team", (_tui: any, theme: any) => ({
      render(width: number): string[] {
        const lines = [`Team: ${activeTeamName || "none"}`];
        for (const state of agentStates.values()) {
          const task = state.task ? ` - ${state.task.slice(0, Math.max(20, width - 40))}` : "";
          lines.push(`${state.status.padEnd(7)} ${displayName(state.def.name)}${task}`);
        }
        return lines.map((line) => theme.fg("muted", line));
      },
      invalidate() {},
    }));
  }

  function dispatchAgent(agentName: string, task: string, ctx: any): Promise<{ output: string; exitCode: number; elapsed: number }> {
    const state = agentStates.get(agentName.toLowerCase());
    if (!state) {
      return Promise.resolve({
        output: `Agent "${agentName}" not found. Available: ${Array.from(agentStates.values()).map((item) => item.def.name).join(", ")}`,
        exitCode: 1,
        elapsed: 0,
      });
    }
    if (state.status === "running") {
      return Promise.resolve({ output: `Agent "${state.def.name}" is already running.`, exitCode: 1, elapsed: 0 });
    }

    state.status = "running";
    state.task = task;
    state.elapsed = 0;
    state.lastWork = "";
    updateWidget();

    const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "";
    const agentKey = state.def.name.toLowerCase().replace(/\s+/g, "-");
    const agentSessionFile = join(sessionDir, `${agentKey}.json`);
    const systemPrompt = writeSystemPromptFile(agentKey, state.def.systemPrompt);
    const args = [
      "--mode", "json",
      "-p",
      "--no-extensions",
      "--tools", state.def.tools,
      "--thinking", "off",
      "--append-system-prompt", systemPrompt.filePath,
      "--session", agentSessionFile,
    ];
    if (model) args.splice(4, 0, "--model", model);
    if (state.sessionFile) args.push("-c");
    args.push(task);

    const start = Date.now();
    const chunks: string[] = [];

    return new Promise((resolveDone) => {
      const cleanupPrompt = () => rmSync(systemPrompt.dir, { recursive: true, force: true });
      const proc = spawn("pi", args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } });
      const timer = setInterval(() => {
        state.elapsed = Date.now() - start;
        updateWidget();
      }, 1000);
      let buffer = "";

      proc.stdout!.setEncoding("utf-8");
      proc.stdout!.on("data", (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            const delta = event.assistantMessageEvent;
            if (event.type === "message_update" && delta?.type === "text_delta") {
              chunks.push(delta.delta || "");
              state.lastWork = chunks.join("").split("\n").filter(Boolean).pop() || "";
              updateWidget();
            }
          } catch {}
        }
      });
      proc.stderr!.setEncoding("utf-8");
      proc.stderr!.on("data", () => {});
      proc.on("close", (code) => {
        clearInterval(timer);
        cleanupPrompt();
        state.elapsed = Date.now() - start;
        state.status = code === 0 ? "done" : "error";
        if (code === 0) state.sessionFile = agentSessionFile;
        updateWidget();
        resolveDone({ output: chunks.join(""), exitCode: code ?? 1, elapsed: state.elapsed });
      });
      proc.on("error", (error) => {
        clearInterval(timer);
        cleanupPrompt();
        state.status = "error";
        state.lastWork = error.message;
        updateWidget();
        resolveDone({ output: `Error spawning agent: ${error.message}`, exitCode: 1, elapsed: Date.now() - start });
      });
    });
  }

  pi.registerTool({
    name: "dispatch_agent",
    label: "Dispatch Agent",
    description: "Dispatch a task to a Pi-native specialist agent in the active team.",
    parameters: Type.Object({
      agent: Type.String({ description: "Agent name" }),
      task: Type.String({ description: "Task for the specialist agent" }),
    }),
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      const { agent, task } = params as { agent: string; task: string };
      onUpdate?.({ content: [{ type: "text", text: `Dispatching to ${agent}...` }], details: { agent, task, status: "running" } });
      const result = await dispatchAgent(agent, task, ctx);
      const text = result.output.length > 8000 ? `${result.output.slice(0, 8000)}\n\n... [truncated]` : result.output;
      return {
        content: [{ type: "text", text: `[${agent}] ${result.exitCode === 0 ? "done" : "error"} in ${Math.round(result.elapsed / 1000)}s\n\n${text}` }],
        details: { agent, task, exitCode: result.exitCode, elapsed: result.elapsed, fullOutput: result.output },
      };
    },
    renderCall(args, theme) {
      return new Text(`${theme.fg("toolTitle", "dispatch_agent ")}${theme.fg("accent", (args as any).agent || "?")}`, 0, 0);
    },
  });

  pi.registerCommand("agents-team", {
    description: "Select active Pi agent team",
    handler: async (_args, ctx) => {
      const names = Object.keys(teams);
      if (!names.length) {
        ctx.ui.notify("No teams defined", "warning");
        return;
      }
      const choice = await ctx.ui.select("Select Team", names);
      if (!choice) return;
      activateTeam(choice);
      pi.setActiveTools(["dispatch_agent"]);
      ctx.ui.setStatus("openpi-team", `Team: ${activeTeamName} (${agentStates.size})`);
      updateWidget();
    },
  });

  pi.registerCommand("agents-list", {
    description: "List active Pi team agents",
    handler: async () => {
      const lines = ["# Active Agents", "", ...Array.from(agentStates.values()).map((state) => `- **${state.def.name}** (${state.status}) - ${state.def.description}`)];
      pi.sendMessage({ customType: "openpi-agents", content: lines.join("\n"), display: true });
    },
  });

  pi.on("before_agent_start", async () => {
    const catalog = Array.from(agentStates.values())
      .map((state) => `### ${displayName(state.def.name)}\nDispatch as: \`${state.def.name}\`\n${state.def.description}\nTools: ${state.def.tools}`)
      .join("\n\n");
    return {
      systemPrompt: `You are a dispatcher agent. You do not work directly on the codebase. Use dispatch_agent for all substantive work.

Active team: ${activeTeamName}

${catalog}

Rules:
- Break work into clear subtasks.
- Dispatch to the best specialist.
- Review results before answering the user.
- Do not use tools other than dispatch_agent.`,
    };
  });

  pi.on("session_start", async (_event, ctx) => {
    widgetCtx = ctx;
    const sessDir = join(ctx.cwd, ".pi", "agent-sessions");
    if (existsSync(sessDir)) {
      for (const file of readdirSync(sessDir)) {
        if (file.endsWith(".json")) {
          try { unlinkSync(join(sessDir, file)); } catch {}
        }
      }
    }
    loadAgents(ctx.cwd);
    const first = Object.keys(teams)[0];
    if (first) activateTeam(first);
    pi.setActiveTools(["dispatch_agent"]);
    if (ctx.hasUI) {
      ctx.ui.setStatus("openpi-team", `Team: ${activeTeamName} (${agentStates.size})`);
      ctx.ui.notify(`Team: ${activeTeamName}\n/agents-team select team\n/agents-list list agents`, "info");
    }
    updateWidget();
  });
}
