/**
 * openpi Workflow Extension
 *
 * Adds a Pi-native orchestration surface without changing Pi internals:
 * - /add, /fix, /review commands that inject structured workflow prompts
 * - spawn_agents tool that runs isolated Pi subprocesses for role agents
 *
 * Security posture:
 * - Project agents are only loaded from .pi/agents under the current project
 * - Per-agent cwd overrides must stay inside the current project directory
 * - No API keys or secrets are accepted as parameters
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Message } from "@earendil-works/pi-ai";
import { StringEnum } from "@earendil-works/pi-ai";
import { type ExtensionAPI, getAgentDir, parseFrontmatter, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

type AgentScope = "user" | "project" | "both";
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
type ExecutionMode = "parallel" | "sequential";

const MAX_AGENTS_PER_CALL = 8;
const MAX_PARALLEL_CONCURRENCY = 4;
const OUTPUT_PREVIEW_CHARS = 6_000;
const ROLE_ALIASES: Record<string, string> = {
  "file_picker": "file-picker",
  "file-picker": "file-picker",
  scout: "scout",
  planner: "planner",
  editor: "editor",
  worker: "worker",
  tester: "tester",
  reviewer: "reviewer",
  "code_searcher": "code-searcher",
  "code-searcher": "code-searcher",
  "directory_lister": "directory-lister",
  "directory-lister": "directory-lister",
  "glob_matcher": "glob-matcher",
  "glob-matcher": "glob-matcher",
  basher: "basher",
  thinker: "thinker",
  "context_pruner": "context-pruner",
  "context-pruner": "context-pruner",
  librarian: "librarian",
  "security_auditor": "security-auditor",
  "security-auditor": "security-auditor",
  "problem_architect": "problem-architect",
  "problem-architect": "problem-architect",
  "spec_reviewer": "spec-reviewer",
  "spec-reviewer": "spec-reviewer",
  "ship_guard": "ship-guard",
  "ship-guard": "ship-guard",
  "rule_verifier": "rule-verifier",
  "rule-verifier": "rule-verifier",
  "loop_controller": "loop-controller",
  "loop-controller": "loop-controller",
};
const THINKING_LEVELS = new Set<ThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh"]);

interface AgentConfig {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  thinking?: ThinkingLevel;
  systemPrompt: string;
  source: "user" | "project";
  filePath: string;
}

interface AgentRunRequest {
  agent?: string;
  agent_type?: string;
  prompt?: string;
  task?: string;
  cwd?: string;
  model?: string;
  thinking?: ThinkingLevel;
  tools?: string[];
}

interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}

interface AgentRunResult {
  agent: string;
  agentSource: "user" | "project" | "unknown";
  cwd: string;
  prompt: string;
  exitCode: number;
  output: string;
  stderr: string;
  usage: UsageStats;
  model?: string;
  thinking?: ThinkingLevel;
  stopReason?: string;
  errorMessage?: string;
}

interface SpawnAgentsDetails {
  mode: ExecutionMode;
  agentScope: AgentScope;
  projectAgentsDir: string | null;
  results: AgentRunResult[];
}

function normalizeRoleName(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  return ROLE_ALIASES[value] ?? value;
}

function truncateText(text: string, maxChars = OUTPUT_PREVIEW_CHARS): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[truncated ${text.length - maxChars} chars]`;
}

function formatUsage(usage: UsageStats): string {
  const parts: string[] = [];
  if (usage.turns) parts.push(`${usage.turns} turn${usage.turns === 1 ? "" : "s"}`);
  if (usage.input) parts.push(`in ${usage.input}`);
  if (usage.output) parts.push(`out ${usage.output}`);
  if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
  return parts.join(", ");
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveCwd(projectCwd: string, requested?: string): string {
  if (!requested?.trim()) return projectCwd;
  const resolved = path.resolve(projectCwd, requested);
  const projectRoot = path.resolve(projectCwd);
  if (!isInside(projectRoot, resolved)) {
    throw new Error(`cwd must stay inside project root: ${requested}`);
  }
  return resolved;
}

function loadAgentsFromDir(dir: string, source: "user" | "project"): AgentConfig[] {
  if (!fs.existsSync(dir)) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const agents: AgentConfig[] = [];
  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;

    const filePath = path.join(dir, entry.name);
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);
    if (!frontmatter.name || !frontmatter.description) continue;

    const tools = frontmatter.tools
      ?.split(",")
      .map((tool) => tool.trim())
      .filter(Boolean);

    const maybeThinking = frontmatter.thinking?.trim() as ThinkingLevel | undefined;
    const thinking = maybeThinking && THINKING_LEVELS.has(maybeThinking) ? maybeThinking : undefined;

    agents.push({
      name: frontmatter.name,
      description: frontmatter.description,
      tools: tools && tools.length > 0 ? tools : undefined,
      model: frontmatter.model,
      thinking,
      systemPrompt: body,
      source,
      filePath,
    });
  }

  return agents;
}

function findNearestProjectAgentsDir(cwd: string): string | null {
  let currentDir = path.resolve(cwd);
  while (true) {
    const candidate = path.join(currentDir, ".pi", "agents");
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch {
      // keep walking
    }

    const parent = path.dirname(currentDir);
    if (parent === currentDir) return null;
    currentDir = parent;
  }
}

function discoverAgents(cwd: string, scope: AgentScope): { agents: AgentConfig[]; projectAgentsDir: string | null } {
  const projectAgentsDir = findNearestProjectAgentsDir(cwd);
  const userAgentsDir = path.join(getAgentDir(), "agents");
  const agentsByName = new Map<string, AgentConfig>();

  if (scope === "user" || scope === "both") {
    for (const agent of loadAgentsFromDir(userAgentsDir, "user")) agentsByName.set(agent.name, agent);
  }
  if ((scope === "project" || scope === "both") && projectAgentsDir) {
    for (const agent of loadAgentsFromDir(projectAgentsDir, "project")) agentsByName.set(agent.name, agent);
  }

  return { agents: Array.from(agentsByName.values()), projectAgentsDir };
}

function getFinalAssistantText(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    for (const part of message.content) {
      if (part.type === "text") return part.text;
    }
  }
  return "";
}

async function writePromptToTempFile(agentName: string, prompt: string): Promise<{ dir: string; filePath: string }> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openpi-agent-"));
  const safeName = agentName.replace(/[^\w.-]+/g, "_");
  const filePath = path.join(dir, `system-${safeName}.md`);
  await withFileMutationQueue(filePath, async () => {
    await fs.promises.writeFile(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
  });
  return { dir, filePath };
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }

  const execName = path.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) return { command: process.execPath, args };

  return { command: "pi", args };
}

async function runSingleAgent(
  projectCwd: string,
  availableAgents: AgentConfig[],
  request: AgentRunRequest,
  signal: AbortSignal | undefined,
): Promise<AgentRunResult> {
  const requestedAgent = normalizeRoleName(request.agent ?? request.agent_type);
  const prompt = (request.prompt ?? request.task ?? "").trim();

  if (!requestedAgent) throw new Error("spawn_agents item requires agent or agent_type");
  if (!prompt) throw new Error(`spawn_agents item for ${requestedAgent} requires prompt or task`);

  const agent = availableAgents.find((candidate) => candidate.name === requestedAgent);
  const cwd = resolveCwd(projectCwd, request.cwd);
  const baseResult: AgentRunResult = {
    agent: requestedAgent,
    agentSource: agent?.source ?? "unknown",
    cwd,
    prompt,
    exitCode: 1,
    output: "",
    stderr: "",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
    model: request.model ?? agent?.model,
    thinking: request.thinking ?? agent?.thinking,
  };

  if (!agent) {
    const names = availableAgents.map((candidate) => candidate.name).sort().join(", ") || "none";
    return { ...baseResult, errorMessage: `Unknown agent: ${requestedAgent}. Available: ${names}` };
  }

  const args = ["--mode", "json", "-p", "--no-session"];
  const model = request.model ?? agent.model;
  const thinking = request.thinking ?? agent.thinking;
  const tools = request.tools ?? agent.tools;

  if (model) args.push("--model", model);
  if (thinking) args.push("--thinking", thinking);
  if (tools && tools.length > 0) args.push("--tools", tools.join(","));

  let tmpPromptDir: string | undefined;
  let tmpPromptPath: string | undefined;
  const messages: Message[] = [];

  try {
    if (agent.systemPrompt.trim()) {
      const tmp = await writePromptToTempFile(agent.name, agent.systemPrompt);
      tmpPromptDir = tmp.dir;
      tmpPromptPath = tmp.filePath;
      args.push("--append-system-prompt", tmpPromptPath);
    }

    args.push(`Task: ${prompt}`);

    let wasAborted = false;
    const exitCode = await new Promise<number>((resolve) => {
      const invocation = getPiInvocation(args);
      const proc = spawn(invocation.command, invocation.args, {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let buffer = "";

      const processLine = (line: string) => {
        if (!line.trim()) return;
        let event: any;
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }

        if (event.type === "message_end" && event.message) {
          const message = event.message as Message;
          messages.push(message);
          if (message.role === "assistant") {
            baseResult.usage.turns += 1;
            const usage = message.usage;
            if (usage) {
              baseResult.usage.input += usage.input || 0;
              baseResult.usage.output += usage.output || 0;
              baseResult.usage.cacheRead += usage.cacheRead || 0;
              baseResult.usage.cacheWrite += usage.cacheWrite || 0;
              baseResult.usage.cost += usage.cost?.total || 0;
              baseResult.usage.contextTokens = usage.totalTokens || 0;
            }
            if (!baseResult.model && message.model) baseResult.model = message.model;
            if (message.stopReason) baseResult.stopReason = message.stopReason;
            if (message.errorMessage) baseResult.errorMessage = message.errorMessage;
          }
        }

        if (event.type === "tool_result_end" && event.message) {
          messages.push(event.message as Message);
        }
      };

      proc.stdout.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) processLine(line);
      });

      proc.stderr.on("data", (data) => {
        baseResult.stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (buffer.trim()) processLine(buffer);
        resolve(code ?? 0);
      });

      proc.on("error", (error) => {
        baseResult.errorMessage = error.message;
        resolve(1);
      });

      if (signal) {
        const killProc = () => {
          wasAborted = true;
          proc.kill("SIGTERM");
          setTimeout(() => {
            if (!proc.killed) proc.kill("SIGKILL");
          }, 5_000);
        };
        if (signal.aborted) killProc();
        else signal.addEventListener("abort", killProc, { once: true });
      }
    });

    if (wasAborted) {
      return { ...baseResult, exitCode, errorMessage: "Subagent was aborted" };
    }

    return {
      ...baseResult,
      exitCode,
      output: getFinalAssistantText(messages),
    };
  } finally {
    if (tmpPromptPath) await fs.promises.rm(tmpPromptPath, { force: true }).catch(() => undefined);
    if (tmpPromptDir) await fs.promises.rm(tmpPromptDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function mapWithConcurrencyLimit<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  const results: TOut[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const workers = new Array(workerCount).fill(null).map(async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await fn(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

function summarizeSpawnResults(results: AgentRunResult[]): string {
  return results
    .map((result, index) => {
      const ok = result.exitCode === 0 && !result.errorMessage;
      const usage = formatUsage(result.usage);
      const meta = [result.model, result.thinking ? `thinking:${result.thinking}` : undefined, usage]
        .filter(Boolean)
        .join(" | ");
      const body = result.output || result.errorMessage || result.stderr || "(no output)";
      return [
        `## ${index + 1}. ${ok ? "OK" : "FAIL"} ${result.agent}`,
        meta ? `_${meta}_` : undefined,
        "",
        truncateText(body),
      ]
        .filter((part) => part !== undefined)
        .join("\n");
    })
    .join("\n\n---\n\n");
}

function buildWorkflowPrompt(kind: "add" | "fix" | "review", userRequest: string): string {
  const trimmed = userRequest.trim();
  if (kind === "review") {
    return `Use the openpi workflow to review the current changes.\n\nUser request: ${trimmed || "Review the current git diff."}\n\nProcess:\n1. Use spawn_agents with agent_type=\"reviewer\" to inspect the current diff.\n2. If validation context is needed, use spawn_agents with agent_type=\"tester\" for read-only/test commands only.\n3. Do not edit files during review unless I explicitly ask for fixes afterward.\n4. Return verifiable data only: files reviewed, file:line findings, test commands/output if any, verdict, and remaining risks.\n\nDo not reveal hidden chain-of-thought; provide concise audit evidence instead.`;
  }

  const label = kind === "add" ? "implement this feature" : "fix this bug";
  return `Use the openpi workflow to ${label}.\n\nUser request: ${trimmed}\n\nRequired process:\n1. Use spawn_agents with agent_type=\"file-picker\" to find relevant files and line ranges.\n2. Use spawn_agents with agent_type=\"planner\" to create a concrete plan from the file-picker output.\n3. If the plan has blocking ambiguity, ask me before editing. Otherwise implement with the available tools or spawn_agents agent_type=\"editor\" for isolated edits.\n4. Use spawn_agents with agent_type=\"tester\" to run targeted validation.\n5. Use spawn_agents with agent_type=\"reviewer\" after edits to audit the diff.\n6. Fix critical test/review issues once, then summarize.\n\nFinal response must include:\n- Files inspected and changed\n- Key file:line references\n- Test commands and exact outcomes\n- Review verdict\n- Remaining risks or follow-ups\n\nDo not rely on or expose hidden chain-of-thought; present verifiable audit data only.`;
}

const AgentRequestSchema = Type.Object({
  agent: Type.Optional(Type.String({ description: "Pi agent name, e.g. file-picker, planner, editor, tester, reviewer" })),
  agent_type: Type.Optional(Type.String({ description: "Role alias for agent" })),
  prompt: Type.Optional(Type.String({ description: "Prompt to send to the agent" })),
  task: Type.Optional(Type.String({ description: "Alias for prompt" })),
  cwd: Type.Optional(Type.String({ description: "Optional project-relative working directory. Must stay inside project root." })),
  model: Type.Optional(Type.String({ description: "Optional model override for this agent run" })),
  thinking: Type.Optional(
    StringEnum(["off", "minimal", "low", "medium", "high", "xhigh"] as const, {
      description: "Optional Pi thinking level override for this agent run",
    }),
  ),
  tools: Type.Optional(Type.Array(Type.String(), { description: "Optional tool override for this agent process" })),
});

export default function workflowExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "spawn_agents",
    label: "Spawn Agents",
    description:
      "Run role agents as isolated Pi subprocesses. Agents come from ~/.pi/agent/agents and/or project .pi/agents. Returns structured outputs, not hidden reasoning.",
    promptSnippet: "Delegate file discovery, planning, editing, testing, or review to isolated role agents.",
    promptGuidelines: [
      "Use spawn_agents for openpi workflows: file-picker before planner, editor only after context, tester and reviewer after edits.",
      "When using spawn_agents, ask for verifiable outputs: file paths, line ranges, diffs, commands run, exact test output, findings, and assumptions.",
    ],
    parameters: Type.Object({
      agents: Type.Array(AgentRequestSchema, {
        description: "Agents to run. Parallel by default; use mode=sequential for dependent steps.",
      }),
      mode: Type.Optional(
        StringEnum(["parallel", "sequential"] as const, {
          description: "Run agents in parallel or sequentially. Default: parallel.",
          default: "parallel",
        }),
      ),
      agentScope: Type.Optional(
        StringEnum(["user", "project", "both"] as const, {
          description: "Agent discovery scope. Default: both, so project role agents override user agents.",
          default: "both",
        }),
      ),
    }),
    prepareArguments(args) {
      if (!args || typeof args !== "object") return args;
      const input = args as { agents?: unknown; tasks?: unknown; mode?: unknown; agentScope?: unknown };
      if (input.agents === undefined && Array.isArray(input.tasks)) {
        return { ...input, agents: input.tasks };
      }
      return args;
    },
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const requests = params.agents as AgentRunRequest[];
      if (requests.length === 0) throw new Error("spawn_agents requires at least one agent");
      if (requests.length > MAX_AGENTS_PER_CALL) {
        throw new Error(`spawn_agents supports at most ${MAX_AGENTS_PER_CALL} agents per call`);
      }

      const mode = (params.mode ?? "parallel") as ExecutionMode;
      const agentScope = (params.agentScope ?? "both") as AgentScope;
      const discovery = discoverAgents(ctx.cwd, agentScope);
      const makeDetails = (results: AgentRunResult[]): SpawnAgentsDetails => ({
        mode,
        agentScope,
        projectAgentsDir: discovery.projectAgentsDir,
        results,
      });

      const results: AgentRunResult[] = [];
      const emitProgress = () => {
        onUpdate?.({
          content: [{ type: "text", text: `spawn_agents: ${results.length}/${requests.length} complete` }],
          details: makeDetails([...results]),
        });
      };

      if (mode === "sequential") {
        for (const request of requests) {
          const result = await runSingleAgent(ctx.cwd, discovery.agents, request, signal);
          results.push(result);
          emitProgress();
          if (result.exitCode !== 0 || result.errorMessage) break;
        }
      } else {
        const parallelResults = await mapWithConcurrencyLimit(
          requests,
          MAX_PARALLEL_CONCURRENCY,
          async (request) => {
            const result = await runSingleAgent(ctx.cwd, discovery.agents, request, signal);
            results.push(result);
            emitProgress();
            return result;
          },
        );
        results.splice(0, results.length, ...parallelResults);
      }

      const successCount = results.filter((result) => result.exitCode === 0 && !result.errorMessage).length;
      return {
        content: [
          {
            type: "text",
            text: `spawn_agents: ${successCount}/${results.length} succeeded\n\n${summarizeSpawnResults(results)}`,
          },
        ],
        details: makeDetails(results),
      };
    },
    renderCall(args, theme) {
      const count = Array.isArray(args.agents) ? args.agents.length : 0;
      const mode = args.mode ?? "parallel";
      return new Text(
        `${theme.fg("toolTitle", theme.bold("spawn_agents "))}${theme.fg("accent", `${count} ${mode}`)}`,
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as SpawnAgentsDetails | undefined;
      if (!details) {
        const first = result.content[0];
        return new Text(first?.type === "text" ? first.text : "spawn_agents complete", 0, 0);
      }
      const successCount = details.results.filter((item) => item.exitCode === 0 && !item.errorMessage).length;
      const icon = successCount === details.results.length ? theme.fg("success", "OK") : theme.fg("warning", "PARTIAL");
      let text = `${icon} ${theme.fg("toolTitle", theme.bold("spawn_agents "))}${theme.fg("accent", `${successCount}/${details.results.length}`)} ${theme.fg("muted", details.mode)}`;
      for (const run of details.results) {
        const runIcon = run.exitCode === 0 && !run.errorMessage ? theme.fg("success", "OK") : theme.fg("error", "FAIL");
        const usage = formatUsage(run.usage);
        text += `\n  ${runIcon} ${theme.fg("accent", run.agent)}${usage ? theme.fg("dim", ` (${usage})`) : ""}`;
      }
      return new Text(text, 0, 0);
    },
  });

  const sendWorkflow = (kind: "add" | "fix" | "review", args: string, ctx: { isIdle(): boolean; ui: { notify(message: string, level?: "info" | "warning" | "error"): void } }) => {
    if (kind !== "review" && !args.trim()) {
      ctx.ui.notify(`Usage: /${kind} <request>`, "warning");
      return;
    }
    const prompt = buildWorkflowPrompt(kind, args);
    if (ctx.isIdle()) pi.sendUserMessage(prompt);
    else pi.sendUserMessage(prompt, { deliverAs: "followUp" });
  };

  pi.registerCommand("add", {
    description: "openpi add workflow: discover files, plan, edit, test, review",
    handler: async (args, ctx) => sendWorkflow("add", args, ctx),
  });

  pi.registerCommand("fix", {
    description: "openpi fix workflow: inspect bug, plan minimal fix, test, review",
    handler: async (args, ctx) => sendWorkflow("fix", args, ctx),
  });

  pi.registerCommand("review", {
    description: "openpi review workflow over current diff or supplied scope",
    handler: async (args, ctx) => sendWorkflow("review", args, ctx),
  });

  pi.registerCommand("openpi-agents", {
    description: "List openpi role agents available to spawn_agents",
    handler: async (_args, ctx) => {
      const discovery = discoverAgents(ctx.cwd, "both");
      const spawnToolStatus = pi.getAllTools().some((tool) => tool.name === "spawn_agents")
        ? "spawn_agents tool: registered"
        : "spawn_agents tool: missing";
      const agents = discovery.agents
        .map((agent) => `${agent.name} [${agent.source}]${agent.thinking ? ` thinking:${agent.thinking}` : ""} - ${agent.description}`)
        .sort()
        .join("\n");
      ctx.ui.notify(`${spawnToolStatus}\n${agents || "No agents found"}`, "info");
    },
  });
}
