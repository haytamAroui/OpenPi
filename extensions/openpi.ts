import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { extensionDir } from "./lib/packagePaths.ts";

type Profile = {
  name: string;
  description: string;
  extensions: string[];
  notes?: string[];
};

const PROFILES: Profile[] = [
  {
    name: "commands",
    description: "Pi-native slash commands from bundled and project .pi/prompts.",
    extensions: ["commands.ts", "search-tools.ts", "audit-tools.ts", "state-tools.ts", "minimal.ts", "theme-cycler.ts"],
  },
  {
    name: "explore",
    description: "Project tree, batched code search, and discovery commands.",
    extensions: ["commands.ts", "search-tools.ts", "audit-tools.ts", "state-tools.ts", "workflow.ts", "minimal.ts", "theme-cycler.ts"],
  },
  {
    name: "guard",
    description: "Security, dependency, environment, test-integrity, and ship-readiness tools.",
    extensions: ["commands.ts", "audit-tools.ts", "search-tools.ts", "state-tools.ts", "workflow.ts", "minimal.ts", "theme-cycler.ts"],
  },
  {
    name: "workflow",
    description: "Pi-native /add, /fix, /review workflows with isolated role-agent delegation.",
    extensions: ["workflow.ts", "search-tools.ts", "audit-tools.ts", "state-tools.ts", "minimal.ts", "theme-cycler.ts"],
    notes: ["This profile owns /review; the bundled prompt-template review command is exposed as /code-review."],
  },
  {
    name: "focus",
    description: "Distraction-free Pi UI with theme defaults.",
    extensions: ["pure-focus.ts", "theme-cycler.ts"],
  },
  {
    name: "purpose",
    description: "Require a session purpose and keep it visible while working.",
    extensions: ["purpose-gate.ts", "minimal.ts", "theme-cycler.ts"],
  },
  {
    name: "metrics",
    description: "Show model, context, token, cost, branch, and tool usage metrics.",
    extensions: ["tool-counter.ts", "theme-cycler.ts"],
  },
  {
    name: "tool-widget",
    description: "Show live per-tool usage counts above the editor.",
    extensions: ["tool-counter-widget.ts", "minimal.ts", "theme-cycler.ts"],
  },
  {
    name: "safety",
    description: "Load Damage-Control rules and return actionable feedback for blocked tool calls.",
    extensions: ["damage-control-continue.ts", "minimal.ts", "theme-cycler.ts"],
  },
  {
    name: "system",
    description: "Switch the active system persona from Pi-native agents.",
    extensions: ["system-select.ts", "minimal.ts", "theme-cycler.ts"],
  },
  {
    name: "team",
    description: "Dispatcher-only specialist-agent team with dispatch_agent.",
    extensions: ["agent-team.ts"],
  },
  {
    name: "chain",
    description: "Sequential agent workflow runner with run_chain.",
    extensions: ["agent-chain.ts"],
  },
  {
    name: "full",
    description: "Commands, workflow, purpose gate, safety, metrics, personas, team dispatcher, and chains.",
    extensions: ["commands.ts", "search-tools.ts", "audit-tools.ts", "state-tools.ts", "workflow.ts", "purpose-gate.ts", "damage-control-continue.ts", "tool-counter.ts", "system-select.ts", "agent-team.ts", "agent-chain.ts", "theme-cycler.ts"],
    notes: ["Team and chain both alter system prompts; enable together only when you want the full orchestration surface."],
  },
];

const PROFILE_BY_NAME = new Map(PROFILES.map((profile) => [profile.name, profile]));
const MANAGED_EXTENSION_FILES = new Set(["openpi.ts", ...PROFILES.flatMap((profile) => profile.extensions)]);
const MANAGED_EXTENSION_PATHS = new Set(
  Array.from(MANAGED_EXTENSION_FILES).map((file) => normalizePath(path.join(extensionDir, file))),
);

function normalizePath(value: string): string {
  return path.resolve(value).replace(/\\/g, "/").toLowerCase();
}

function extensionPath(file: string): string {
  return path.join(extensionDir, file);
}

function readJsonFile(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
}

function writeJsonFile(filePath: string, value: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function addUnique(items: string[], additions: string[]): string[] {
  const seen = new Set(items.map((item) => normalizePath(item)));
  const out = [...items];
  for (const item of additions) {
    const key = normalizePath(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function isManagedExtensionEntry(entry: string, settingsDir: string): boolean {
  const absolute = path.isAbsolute(entry) ? entry : path.resolve(settingsDir, entry);
  return MANAGED_EXTENSION_PATHS.has(normalizePath(absolute));
}

function resolveSettingsPath(cwd: string, global: boolean): string {
  return global ? path.join(os.homedir(), ".pi", "agent", "settings.json") : path.join(cwd, ".pi", "settings.json");
}

function applyProfileToSettings(settingsPath: string, profile: Profile): { added: string[]; removed: number } {
  const settingsDir = path.dirname(settingsPath);
  const settings = readJsonFile(settingsPath);
  const currentExtensions = stringArray(settings.extensions);
  const keptExtensions = currentExtensions.filter((entry) => !isManagedExtensionEntry(entry, settingsDir));
  const added = profile.extensions.map(extensionPath);

  settings.extensions = addUnique(keptExtensions, added);
  writeJsonFile(settingsPath, settings);

  return { added, removed: currentExtensions.length - keptExtensions.length };
}

function clearProfileFromSettings(settingsPath: string): { removed: number } {
  const settingsDir = path.dirname(settingsPath);
  const settings = readJsonFile(settingsPath);
  const currentExtensions = stringArray(settings.extensions);
  settings.extensions = currentExtensions.filter((entry) => !isManagedExtensionEntry(entry, settingsDir));
  writeJsonFile(settingsPath, settings);
  return { removed: currentExtensions.length - stringArray(settings.extensions).length };
}

function profileListMarkdown(): string {
  return [
    "# openpi profiles",
    "",
    "Use `/openpi use <profile>` to activate a profile for this project.",
    "Use `/openpi use <profile> --global` to activate it globally.",
    "Run `/reload` or restart Pi after changing profiles.",
    "",
    ...PROFILES.map((profile) => `- **${profile.name}** - ${profile.description}`),
  ].join("\n");
}

function parseArgs(args: string | undefined): string[] {
  return (args || "").trim().split(/\s+/).filter(Boolean);
}

function emit(pi: ExtensionAPI, content: string) {
  pi.sendMessage({ customType: "openpi", content, display: true });
}

function registerProfileCommand(pi: ExtensionAPI, name: string, description: string) {
  pi.registerCommand(name, {
    description,
    getArgumentCompletions: (prefix) => {
      const words = prefix.trim().split(/\s+/);
      const first = words[0] || "";
      if (!prefix.includes(" ")) {
        return ["list", "use", "clear", ...PROFILES.map((p) => p.name)]
          .filter((value) => value.startsWith(first))
          .map((value) => ({ value, label: value }));
      }
      if (words[0] === "use") {
        const partial = words[1] || "";
        return PROFILES.filter((profile) => profile.name.startsWith(partial)).map((profile) => ({
          value: profile.name,
          label: profile.name,
          description: profile.description,
        }));
      }
      return null;
    },
    handler: async (args, ctx) => {
      const tokens = parseArgs(args);
      const action = tokens[0] || "list";

      if (action === "list" || action === "help") {
        emit(pi, profileListMarkdown());
        return;
      }

      if (PROFILE_BY_NAME.has(action)) tokens.unshift("use");

      if (tokens[0] === "use") {
        const profile = PROFILE_BY_NAME.get(tokens[1] || "");
        if (!profile) {
          ctx.ui.notify("Usage: /openpi use <profile> [--global]", "error");
          return;
        }
        const global = tokens.includes("--global");
        const settingsPath = resolveSettingsPath(ctx.cwd, global);
        const result = applyProfileToSettings(settingsPath, profile);
        emit(pi, [
          `Activated **${profile.name}** in ${global ? "global" : "project"} Pi settings.`,
          "",
          `Settings: \`${settingsPath}\``,
          `Removed previous openpi profile entries: ${result.removed}`,
          "Added:",
          ...result.added.map((entry) => `- \`${entry}\``),
          "",
          "Run `/reload` or restart Pi.",
          ...(profile.notes?.length ? ["", ...profile.notes.map((note) => `- ${note}`)] : []),
        ].join("\n"));
        return;
      }

      if (tokens[0] === "clear") {
        const global = tokens.includes("--global");
        const settingsPath = resolveSettingsPath(ctx.cwd, global);
        const result = clearProfileFromSettings(settingsPath);
        emit(pi, `Cleared ${result.removed} openpi extension entr${result.removed === 1 ? "y" : "ies"} from \`${settingsPath}\`. Run \`/reload\` or restart Pi.`);
        return;
      }

      emit(pi, profileListMarkdown());
    },
  });
}

export default function (pi: ExtensionAPI) {
  registerProfileCommand(pi, "openpi", "Manage openpi native profiles");
  registerProfileCommand(pi, "azpi", "Deprecated alias for /openpi");

  pi.registerCommand("open-pi", {
    description: "Show openpi native package profiles",
    handler: async () => emit(pi, profileListMarkdown()),
  });

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setStatus("openpi", `openpi profiles: ${PROFILES.length}`);
  });
}
