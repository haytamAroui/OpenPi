import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

type GoalAction = "list" | "set" | "complete" | "block";

type Milestone = {
  id: string;
  title?: string;
  files?: string[];
  dependsOn?: string[];
  status?: string;
};

function memoryDir(cwd: string): string {
  return path.join(cwd, ".pi", "memory");
}

function goalsPath(cwd: string): string {
  return path.join(memoryDir(cwd), "goals.md");
}

function checkpointsDir(cwd: string): string {
  return path.join(memoryDir(cwd), "checkpoints");
}

function ensureMemory(cwd: string) {
  fs.mkdirSync(memoryDir(cwd), { recursive: true });
  fs.mkdirSync(checkpointsDir(cwd), { recursive: true });
  const file = goalsPath(cwd);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, [
      "# Pi Goals",
      "",
      "## Current Threads",
      "",
      "## In Progress",
      "",
      "## Next Actions",
      "",
      "## Done",
      "",
      "## Blocked",
      "",
    ].join("\n"), "utf-8");
  }
}

function readText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

function writeGoals(cwd: string, content: string) {
  ensureMemory(cwd);
  fs.writeFileSync(goalsPath(cwd), content.endsWith("\n") ? content : `${content}\n`, "utf-8");
}

function appendUnderHeading(content: string, heading: string, line: string): string {
  const marker = `## ${heading}`;
  const index = content.indexOf(marker);
  if (index === -1) return `${content.trimEnd()}\n\n${marker}\n${line}\n`;
  const after = index + marker.length;
  return `${content.slice(0, after)}\n${line}${content.slice(after)}`;
}

function replaceSection(content: string, heading: string, lines: string[]): string {
  const marker = `## ${heading}`;
  const start = content.indexOf(marker);
  const section = `${marker}\n${lines.join("\n")}\n`;
  if (start === -1) return `${content.trimEnd()}\n\n${section}`;
  const next = content.indexOf("\n## ", start + marker.length);
  if (next === -1) return `${content.slice(0, start)}${section}`;
  return `${content.slice(0, start)}${section}${content.slice(next + 1)}`;
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function listLatestCheckpoint(cwd: string): string | null {
  const dir = checkpointsDir(cwd);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".md")).sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

function normalizeFile(file: string): string {
  return file.replace(/\\/g, "/").toLowerCase();
}

function parallelConflicts(milestones: Milestone[]): string[] {
  const conflicts: string[] = [];
  for (let i = 0; i < milestones.length; i++) {
    for (let j = i + 1; j < milestones.length; j++) {
      const left = milestones[i];
      const right = milestones[j];
      const leftFiles = new Set((left.files || []).map(normalizeFile));
      const rightFiles = new Set((right.files || []).map(normalizeFile));
      const shared = Array.from(leftFiles).filter((file) => rightFiles.has(file));
      if (shared.length) conflicts.push(`${left.id} conflicts with ${right.id}: shared files ${shared.join(", ")}`);

      const sensitive = ["package.json", "requirements.txt", "pyproject.toml", "cargo.toml", "go.mod", "schema.prisma"];
      const leftSensitive = Array.from(leftFiles).filter((file) => sensitive.some((item) => file.endsWith(item)));
      const rightSensitive = Array.from(rightFiles).filter((file) => sensitive.some((item) => file.endsWith(item)));
      if (leftSensitive.length && rightSensitive.length) {
        conflicts.push(`${left.id} conflicts with ${right.id}: both touch dependency/schema files`);
      }

      if ((left.dependsOn || []).includes(right.id) || (right.dependsOn || []).includes(left.id)) {
        conflicts.push(`${left.id} conflicts with ${right.id}: dependency relationship`);
      }
    }
    if (["blocked", "done"].includes((milestones[i].status || "").toLowerCase())) {
      conflicts.push(`${milestones[i].id} is ${milestones[i].status}; do not parallelize`);
    }
  }
  return conflicts;
}

export default function stateToolsExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "session_state",
    label: "Session State",
    description: "Read Pi-native goals and latest checkpoint from .pi/memory.",
    promptSnippet: "Use session_state when resuming, checking goals, or deciding whether to snapshot.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      ensureMemory(ctx.cwd);
      const latest = listLatestCheckpoint(ctx.cwd);
      const text = [
        `goals: ${goalsPath(ctx.cwd)}`,
        "",
        readText(goalsPath(ctx.cwd)) || "(no goals)",
        "",
        latest ? `latest checkpoint: ${latest}\n\n${readText(latest)}` : "latest checkpoint: none",
      ].join("\n");
      return { content: [{ type: "text", text }] };
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("session_state")), 0, 0);
    },
  });

  pi.registerTool({
    name: "goal_state",
    label: "Goal State",
    description: "Manage Pi-native goals in .pi/memory/goals.md.",
    promptSnippet: "Use goal_state to list, set, complete, or block durable session goals.",
    parameters: Type.Object({
      action: Type.String({ description: "list, set, complete, or block." }),
      goal: Type.Optional(Type.String({ description: "Goal text for set/complete/block." })),
      note: Type.Optional(Type.String({ description: "Optional note or evidence." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      ensureMemory(ctx.cwd);
      const action = String(params.action || "list") as GoalAction;
      const goal = String(params.goal || "").trim();
      const note = String(params.note || "").trim();
      let content = readText(goalsPath(ctx.cwd));
      const stamp = new Date().toISOString();

      if (action === "set") {
        if (!goal) throw new Error("goal_state set requires goal");
        content = appendUnderHeading(content, "In Progress", `- ${stamp} - ${goal}${note ? ` | ${note}` : ""}`);
        content = appendUnderHeading(content, "Current Threads", `- ${goal}`);
        writeGoals(ctx.cwd, content);
      } else if (action === "complete") {
        if (!goal) throw new Error("goal_state complete requires goal");
        content = appendUnderHeading(content, "Done", `- ${stamp} - ${goal}${note ? ` | ${note}` : ""}`);
        writeGoals(ctx.cwd, content);
      } else if (action === "block") {
        if (!goal) throw new Error("goal_state block requires goal");
        content = appendUnderHeading(content, "Blocked", `- ${stamp} - ${goal}${note ? ` | ${note}` : ""}`);
        writeGoals(ctx.cwd, content);
      }

      return { content: [{ type: "text", text: readText(goalsPath(ctx.cwd)) }] };
    },
    renderCall(args, theme) {
      return new Text(`${theme.fg("toolTitle", theme.bold("goal_state "))}${theme.fg("accent", args.action || "list")}`, 0, 0);
    },
  });

  pi.registerTool({
    name: "write_snapshot",
    label: "Write Snapshot",
    description: "Write a mid-session checkpoint to .pi/memory/checkpoints and update next actions.",
    promptSnippet: "Use write_snapshot before context compaction, pausing, or after major decisions.",
    parameters: Type.Object({
      label: Type.Optional(Type.String()),
      currentTask: Type.String(),
      decisions: Type.Optional(Type.Array(Type.String())),
      knownContext: Type.Optional(Type.Array(Type.String())),
      nextActions: Type.Optional(Type.Array(Type.String())),
      risks: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      ensureMemory(ctx.cwd);
      const stamp = new Date().toISOString();
      const label = String(params.label || "mid-session").trim();
      const filePath = path.join(checkpointsDir(ctx.cwd), `${timestampForFile()}-${label.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40)}.md`);
      const decisions = (params.decisions || []) as string[];
      const knownContext = (params.knownContext || []) as string[];
      const nextActions = (params.nextActions || []) as string[];
      const risks = (params.risks || []) as string[];
      const checkpoint = [
        "---",
        `date: ${stamp}`,
        `label: ${label}`,
        "---",
        "",
        "## Current Task",
        String(params.currentTask),
        "",
        "## Decisions",
        ...(decisions.length ? decisions.map((item) => `- ${item}`) : ["- None recorded"]),
        "",
        "## Known Context",
        ...(knownContext.length ? knownContext.map((item) => `- ${item}`) : ["- None recorded"]),
        "",
        "## Next Actions",
        ...(nextActions.length ? nextActions.map((item, index) => `${index + 1}. ${item}`) : ["1. None recorded"]),
        "",
        "## Risks",
        ...(risks.length ? risks.map((item) => `- ${item}`) : ["- None"]),
        "",
      ].join("\n");
      fs.writeFileSync(filePath, checkpoint, "utf-8");

      let goals = readText(goalsPath(ctx.cwd));
      goals = appendUnderHeading(goals, "Current Threads", `- [checkpoint] ${stamp} - ${label} -> ${path.relative(ctx.cwd, filePath).replace(/\\/g, "/")}`);
      if (nextActions.length) goals = replaceSection(goals, "Next Actions", nextActions.map((item, index) => `${index + 1}. ${item}`));
      writeGoals(ctx.cwd, goals);

      return { content: [{ type: "text", text: `Snapshot written: ${filePath}\n\n${checkpoint}` }] };
    },
    renderCall(args, theme) {
      return new Text(`${theme.fg("toolTitle", theme.bold("write_snapshot "))}${theme.fg("accent", args.label || "mid-session")}`, 0, 0);
    },
  });

  pi.registerTool({
    name: "parallel_safety_check",
    label: "Parallel Safety Check",
    description: "Check milestone file ownership, dependency, and status conflicts before parallel agent dispatch.",
    promptSnippet: "Use parallel_safety_check before running multiple agents in parallel.",
    parameters: Type.Object({
      milestones: Type.Array(Type.Object({
        id: Type.String(),
        title: Type.Optional(Type.String()),
        files: Type.Optional(Type.Array(Type.String())),
        dependsOn: Type.Optional(Type.Array(Type.String())),
        status: Type.Optional(Type.String()),
      })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const milestones = (params.milestones || []) as Milestone[];
      const conflicts = parallelConflicts(milestones);
      const verdict = conflicts.length ? "SEQUENTIAL_REQUIRED" : "PARALLEL_SAFE";
      return {
        content: [{ type: "text", text: [`parallel_safety_check: ${verdict}`, "", ...(conflicts.length ? conflicts : ["No ownership, dependency, or terminal-status conflicts detected."])].join("\n") }],
        details: { verdict, conflicts },
      };
    },
    renderCall(args, theme) {
      const count = Array.isArray(args.milestones) ? args.milestones.length : 0;
      return new Text(`${theme.fg("toolTitle", theme.bold("parallel_safety_check "))}${theme.fg("accent", `${count} milestones`)}`, 0, 0);
    },
  });
}
