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

type ChainStep = { agent: string; prompt: string };
type ChainDef = { name: string; description: string; steps: ChainStep[] };
type AgentDef = { name: string; description: string; tools: string; systemPrompt: string };
type StepState = { agent: string; status: "pending" | "running" | "done" | "error"; elapsed: number; lastWork: string };

function displayName(name: string): string {
  return name.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function parseChainYaml(raw: string): ChainDef[] {
  const parsed = parseYaml(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

  return Object.entries(parsed as Record<string, unknown>).flatMap(([name, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const chain = value as { description?: unknown; steps?: unknown };
    if (!Array.isArray(chain.steps)) return [];
    const steps = chain.steps.flatMap((step): ChainStep[] => {
      if (!step || typeof step !== "object" || Array.isArray(step)) return [];
      const item = step as { agent?: unknown; prompt?: unknown };
      if (typeof item.agent !== "string" || typeof item.prompt !== "string") return [];
      return [{ agent: item.agent, prompt: item.prompt }];
    });
    if (!steps.length) return [];
    return [{
      name,
      description: typeof chain.description === "string" ? chain.description : "",
      steps,
    }];
  });
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
  };
}

function writeSystemPromptFile(agentName: string, systemPrompt: string): { dir: string; filePath: string } {
  const dir = mkdtempSync(join(tmpdir(), "openpi-chain-"));
  const filePath = join(dir, `system-${agentName.replace(/[^\w.-]+/g, "_")}.md`);
  writeFileSync(filePath, systemPrompt, { encoding: "utf-8", mode: 0o600 });
  return { dir, filePath };
}

function scanAgentDirs(cwd: string): Map<string, AgentDef> {
  const dirs = [join(cwd, ".pi", "agents"), join(cwd, "agents"), bundledAgentsDir];
  const agents = new Map<string, AgentDef>();
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".md")) continue;
      const def = parseAgentFile(resolve(dir, file));
      if (def && !agents.has(def.name.toLowerCase())) agents.set(def.name.toLowerCase(), def);
    }
  }
  return agents;
}

export default function (pi: ExtensionAPI) {
  let allAgents = new Map<string, AgentDef>();
  let chains: ChainDef[] = [];
  let activeChain: ChainDef | null = null;
  let sessionDir = "";
  let widgetCtx: any;
  let stepStates: StepState[] = [];
  const agentSessions = new Map<string, string | null>();

  function loadChains(cwd: string) {
    sessionDir = join(cwd, ".pi", "agent-sessions");
    mkdirSync(sessionDir, { recursive: true });
    allAgents = scanAgentDirs(cwd);
    agentSessions.clear();
    for (const key of allAgents.keys()) {
      const sessionFile = join(sessionDir, `chain-${key}.json`);
      agentSessions.set(key, existsSync(sessionFile) ? sessionFile : null);
    }
    const chainPath = [join(cwd, ".pi", "agents", "agent-chain.yaml"), join(bundledAgentsDir, "agent-chain.yaml")].find((candidate) => existsSync(candidate));
    chains = chainPath ? parseChainYaml(readFileSync(chainPath, "utf-8")) : [];
  }

  function activateChain(chain: ChainDef) {
    activeChain = chain;
    stepStates = chain.steps.map((step) => ({ agent: step.agent, status: "pending", elapsed: 0, lastWork: "" }));
    updateWidget();
  }

  function updateWidget() {
    if (!widgetCtx) return;
    widgetCtx.ui.setWidget("openpi-chain", (_tui: any, theme: any) => ({
      render(): string[] {
        if (!activeChain) return [theme.fg("dim", "No chain active")];
        const flow = stepStates.map((step) => `${step.status}:${displayName(step.agent)}`).join(" -> ");
        return [theme.fg("muted", `Chain: ${activeChain.name}`), theme.fg("dim", flow)];
      },
      invalidate() {},
    }));
  }

  function runAgent(agentDef: AgentDef, task: string, stepIndex: number, ctx: any): Promise<{ output: string; exitCode: number; elapsed: number }> {
    const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "";
    const agentKey = agentDef.name.toLowerCase().replace(/\s+/g, "-");
    const agentSessionFile = join(sessionDir, `chain-${agentKey}.json`);
    const systemPrompt = writeSystemPromptFile(agentKey, agentDef.systemPrompt);
    const args = [
      "--mode", "json",
      "-p",
      "--no-extensions",
      "--tools", agentDef.tools,
      "--thinking", "off",
      "--append-system-prompt", systemPrompt.filePath,
      "--session", agentSessionFile,
    ];
    if (model) args.splice(4, 0, "--model", model);
    if (agentSessions.get(agentKey)) args.push("-c");
    args.push(task);

    const state = stepStates[stepIndex];
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
        if (code === 0) agentSessions.set(agentKey, agentSessionFile);
        resolveDone({ output: chunks.join(""), exitCode: code ?? 1, elapsed: state.elapsed });
      });
      proc.on("error", (error) => {
        clearInterval(timer);
        cleanupPrompt();
        resolveDone({ output: `Error spawning agent: ${error.message}`, exitCode: 1, elapsed: Date.now() - start });
      });
    });
  }

  async function runChain(task: string, ctx: any): Promise<{ output: string; success: boolean; elapsed: number }> {
    if (!activeChain) return { output: "No chain active", success: false, elapsed: 0 };
    const start = Date.now();
    stepStates = activeChain.steps.map((step) => ({ agent: step.agent, status: "pending", elapsed: 0, lastWork: "" }));
    updateWidget();

    let input = task;
    const original = task;
    for (let i = 0; i < activeChain.steps.length; i++) {
      const step = activeChain.steps[i];
      stepStates[i].status = "running";
      updateWidget();

      const prompt = step.prompt.replace(/\$INPUT/g, input).replace(/\$ORIGINAL/g, original);
      const agentDef = allAgents.get(step.agent.toLowerCase());
      if (!agentDef) {
        stepStates[i].status = "error";
        return { output: `Agent "${step.agent}" not found`, success: false, elapsed: Date.now() - start };
      }

      const result = await runAgent(agentDef, prompt, i, ctx);
      if (result.exitCode !== 0) {
        stepStates[i].status = "error";
        return { output: result.output, success: false, elapsed: Date.now() - start };
      }
      stepStates[i].status = "done";
      input = result.output;
      updateWidget();
    }
    return { output: input, success: true, elapsed: Date.now() - start };
  }

  pi.registerTool({
    name: "run_chain",
    label: "Run Chain",
    description: "Run the active Pi-native agent chain. Each step feeds output into the next step.",
    parameters: Type.Object({ task: Type.String({ description: "Task for the chain" }) }),
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      const { task } = params as { task: string };
      onUpdate?.({ content: [{ type: "text", text: `Starting chain ${activeChain?.name || "none"}...` }], details: { task, status: "running" } });
      const result = await runChain(task, ctx);
      const text = result.output.length > 8000 ? `${result.output.slice(0, 8000)}\n\n... [truncated]` : result.output;
      return {
        content: [{ type: "text", text: `[chain:${activeChain?.name || "none"}] ${result.success ? "done" : "error"} in ${Math.round(result.elapsed / 1000)}s\n\n${text}` }],
        details: { chain: activeChain?.name, task, success: result.success, elapsed: result.elapsed, fullOutput: result.output },
      };
    },
    renderCall(args, theme) {
      return new Text(`${theme.fg("toolTitle", "run_chain ")}${theme.fg("accent", activeChain?.name || "?")} ${theme.fg("muted", (args as any).task || "")}`, 0, 0);
    },
  });

  pi.registerCommand("chain", {
    description: "Select active Pi agent chain",
    handler: async (_args, ctx) => {
      if (!chains.length) {
        ctx.ui.notify("No chains defined", "warning");
        return;
      }
      const options = chains.map((chain) => `${chain.name} - ${chain.description}`);
      const choice = await ctx.ui.select("Select Chain", options);
      if (!choice) return;
      const chain = chains[options.indexOf(choice)];
      activateChain(chain);
      ctx.ui.setStatus("openpi-chain", `Chain: ${chain.name}`);
    },
  });

  pi.registerCommand("chain-list", {
    description: "List Pi agent chains",
    handler: async () => {
      const lines = ["# Chains", "", ...chains.map((chain) => `- **${chain.name}** - ${chain.description}`)];
      pi.sendMessage({ customType: "openpi-chains", content: lines.join("\n"), display: true });
    },
  });

  pi.on("before_agent_start", async (event) => {
    if (!activeChain) return;
    const flow = activeChain.steps.map((step) => displayName(step.agent)).join(" -> ");
    return {
      systemPrompt: `You have access to the run_chain tool for structured Pi-native workflows.

Active chain: ${activeChain.name}
Flow: ${flow}

Use run_chain for multi-step work that benefits from planning, implementation, or review. For simple questions, answer directly.

${event.systemPrompt}`,
    };
  });

  pi.on("session_start", async (_event, ctx) => {
    widgetCtx = ctx;
    const sessDir = join(ctx.cwd, ".pi", "agent-sessions");
    if (existsSync(sessDir)) {
      for (const file of readdirSync(sessDir)) {
        if (file.startsWith("chain-") && file.endsWith(".json")) {
          try { unlinkSync(join(sessDir, file)); } catch {}
        }
      }
    }
    loadChains(ctx.cwd);
    if (chains[0]) activateChain(chains[0]);
    if (ctx.hasUI) {
      ctx.ui.setStatus("openpi-chain", activeChain ? `Chain: ${activeChain.name}` : "Chain: none");
      ctx.ui.notify(activeChain ? `Chain: ${activeChain.name}\n/chain select chain\n/chain-list list chains` : "No chains found", "info");
    }
  });
}
