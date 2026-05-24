import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { bundledPromptsDir } from "./lib/packagePaths.ts";
import { arrayField, parseMarkdownFrontmatter, stringField } from "./lib/markdown.ts";

type CommandDef = {
  name: string;
  description: string;
  category: string;
  aliases: string[];
  body: string;
  source: string;
};

function expandArgs(template: string, args: string): string {
  const parts = args.split(/\s+/).filter(Boolean);
  let result = template.replace(/\$ARGUMENTS|\$@/g, args);
  for (let i = 0; i < parts.length; i++) {
    result = result.replaceAll(`$${i + 1}`, parts[i]);
  }
  return result;
}

function scanPromptDir(dir: string, source: string): CommandDef[] {
  if (!existsSync(dir)) return [];
  const commands: CommandDef[] = [];

  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;
    const raw = readFileSync(join(dir, file), "utf-8");
    const { frontmatter, body } = parseMarkdownFrontmatter(raw);
    const firstLine = body.split("\n").find((line) => line.trim())?.trim() || "";
    commands.push({
      name: stringField(frontmatter.name) || basename(file, ".md"),
      description: stringField(frontmatter.description) || firstLine.slice(0, 120),
      category: stringField(frontmatter.category) || "general",
      aliases: arrayField(frontmatter.aliases),
      body,
      source,
    });
  }

  return commands;
}

export default function (pi: ExtensionAPI) {
  const cwd = process.cwd();
  const commands = [
    ...scanPromptDir(join(cwd, ".pi", "prompts"), ".pi"),
    ...scanPromptDir(bundledPromptsDir, "openpi"),
  ];
  const byName = new Map<string, CommandDef>();
  const aliases = new Map<string, string>();
  const conflicts: string[] = [];

  for (const command of commands) {
    const key = command.name.toLowerCase();
    if (byName.has(key)) {
      conflicts.push(`${command.name}: ${byName.get(key)!.source} wins over ${command.source}`);
      continue;
    }
    byName.set(key, command);
  }

  for (const command of byName.values()) {
    for (const alias of command.aliases) {
      const key = alias.toLowerCase();
      if (byName.has(key) || aliases.has(key)) {
        conflicts.push(`${alias}: alias collision for ${command.name}`);
        continue;
      }
      aliases.set(key, command.name.toLowerCase());
    }
  }

  function register(name: string, canonicalKey: string) {
    const command = byName.get(canonicalKey);
    if (!command) return;
    pi.registerCommand(name, {
      description: `[${command.source}/${command.category}] ${command.description}`.slice(0, 120),
      handler: async (args) => {
        pi.sendUserMessage(expandArgs(command.body, args || ""));
      },
    });
  }

  for (const [key, command] of byName) {
    register(command.name, key);
  }
  for (const [alias, canonicalKey] of aliases) {
    register(alias, canonicalKey);
  }

  pi.registerCommand("commands", {
    description: "List openpi command templates",
    handler: async () => {
      const grouped = new Map<string, CommandDef[]>();
      for (const command of byName.values()) {
        const list = grouped.get(command.category) || [];
        list.push(command);
        grouped.set(command.category, list);
      }

      const lines = ["# Commands", ""];
      for (const [category, list] of Array.from(grouped.entries()).sort()) {
        lines.push(`## ${category}`, "");
        for (const command of list.sort((a, b) => a.name.localeCompare(b.name))) {
          const aliasSuffix = command.aliases.length ? ` (${command.aliases.map((a) => `/${a}`).join(", ")})` : "";
          lines.push(`- /${command.name}${aliasSuffix} - ${command.description}`);
        }
        lines.push("");
      }

      pi.sendMessage({ customType: "openpi-commands", content: lines.join("\n"), display: true });
    },
  });

  pi.registerCommand("command:status", {
    description: "Show openpi command loader status",
    handler: async () => {
      const lines = [
        "# Command Status",
        "",
        `Commands: ${byName.size}`,
        `Aliases: ${aliases.size}`,
        `Conflicts: ${conflicts.length}`,
        "",
        ...conflicts.map((conflict) => `- ${conflict}`),
      ];
      pi.sendMessage({ customType: "openpi-command-status", content: lines.join("\n"), display: true });
    },
  });
}
