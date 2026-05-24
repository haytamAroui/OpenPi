import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const DEFAULT_IGNORES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "dist",
  "build",
  "out",
  "coverage",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "target",
]);

type TreeNode = {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  sizeBytes?: number;
  children?: TreeNode[];
};

type SearchQuery = {
  pattern: string;
  cwd?: string;
  globs?: string[];
  caseInsensitive?: boolean;
  isRegex?: boolean;
  before?: number;
  after?: number;
  maxResults?: number;
};

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveProjectPath(projectRoot: string, requested?: string): string {
  const resolved = path.resolve(projectRoot, requested || ".");
  if (!isInside(path.resolve(projectRoot), resolved)) {
    throw new Error(`Path must stay inside project root: ${requested}`);
  }
  return resolved;
}

function normalizeRelative(projectRoot: string, value: string): string {
  const relative = path.relative(projectRoot, value).replace(/\\/g, "/");
  return relative || ".";
}

function readIgnoreNames(dir: string): Set<string> {
  const names = new Set(DEFAULT_IGNORES);
  for (const ignoreFile of [".gitignore", ".piignore"]) {
    const filePath = path.join(dir, ignoreFile);
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || line.startsWith("!") || line.includes("*")) continue;
      names.add(line.replace(/\/$/, ""));
    }
  }
  return names;
}

function buildTree(params: {
  projectRoot: string;
  root: string;
  maxDepth: number;
  maxEntries: number;
  includeHidden: boolean;
  showSizes: boolean;
}): { nodes: TreeNode[]; omitted: number; visited: number } {
  const ignoreNames = readIgnoreNames(params.projectRoot);
  let visited = 0;
  let omitted = 0;

  const walk = (dir: string, depth: number): TreeNode[] => {
    if (depth > params.maxDepth || visited >= params.maxEntries) return [];
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      omitted++;
      return [];
    }

    entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    const nodes: TreeNode[] = [];
    for (const entry of entries) {
      if (visited >= params.maxEntries) {
        omitted++;
        continue;
      }
      if (!params.includeHidden && entry.name.startsWith(".")) continue;
      if (ignoreNames.has(entry.name)) continue;

      const absolutePath = path.join(dir, entry.name);
      const relativePath = normalizeRelative(params.projectRoot, absolutePath);
      visited++;

      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          relativePath,
          isDirectory: true,
          children: walk(absolutePath, depth + 1),
        });
      } else {
        let sizeBytes: number | undefined;
        if (params.showSizes) {
          try { sizeBytes = fs.statSync(absolutePath).size; } catch { /* skip */ }
        }
        nodes.push({ name: entry.name, relativePath, isDirectory: false, sizeBytes });
      }
    }
    return nodes;
  };

  return { nodes: walk(params.root, 0), omitted, visited };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function renderTree(nodes: TreeNode[], prefix = ""): string[] {
  const lines: string[] = [];
  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const connector = isLast ? "`-- " : "|-- ";
    const sizeSuffix = node.sizeBytes !== undefined ? ` (${formatSize(node.sizeBytes)})` : "";
    lines.push(`${prefix}${connector}${node.name}${node.isDirectory ? "/" : ""}${sizeSuffix}`);
    if (node.children?.length) {
      lines.push(...renderTree(node.children, `${prefix}${isLast ? "    " : "|   "}`));
    }
  });
  return lines;
}

function runRipgrep(projectRoot: string, query: SearchQuery): Promise<string> {
  const cwd = resolveProjectPath(projectRoot, query.cwd);
  const args = ["--line-number", "--column", "--no-heading", "--color", "never"];
  if (!query.isRegex) args.push("-F");
  if (query.caseInsensitive) args.push("-i");
  if (query.before) args.push("-B", String(query.before));
  if (query.after) args.push("-A", String(query.after));
  for (const glob of query.globs || []) args.push("-g", glob);
  if (query.maxResults && query.maxResults > 0) args.push("-m", String(query.maxResults));
  args.push(query.pattern, ".");

  return new Promise((resolve) => {
    const proc = spawn("rg", args, { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (error) => {
      resolve(`ERROR: ${error.message}`);
    });
    proc.on("close", (code) => {
      if (code === 0 || code === 1) resolve(stdout.trim());
      else resolve(`ERROR: rg exited ${code}\n${stderr.trim()}`);
    });
  });
}

function truncateLines(text: string, maxLines: number): string {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length <= maxLines) return lines.join("\n");
  return `${lines.slice(0, maxLines).join("\n")}\n[truncated ${lines.length - maxLines} lines]`;
}

export default function searchToolsExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "project_tree",
    label: "Project Tree",
    description: "Build a compact project tree while ignoring common generated folders.",
    promptSnippet: "Use project_tree before broad exploration to understand repo shape without reading many files.",
    promptGuidelines: [
      "Use project_tree with maxDepth 2-4 before broad file discovery.",
      "Keep maxEntries bounded; follow up with code_search_batch for specific symbols or terms.",
    ],
    parameters: Type.Object({
      root: Type.Optional(Type.String({ description: "Project-relative root directory. Defaults to current project root." })),
      maxDepth: Type.Optional(Type.Number({ description: "Maximum directory depth. Default 3." })),
      maxEntries: Type.Optional(Type.Number({ description: "Maximum entries to include. Default 400." })),
      includeHidden: Type.Optional(Type.Boolean({ description: "Include hidden files and directories. Default false." })),
      showSizes: Type.Optional(Type.Boolean({ description: "Show file sizes next to filenames. Default false." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const root = resolveProjectPath(ctx.cwd, params.root as string | undefined);
      const maxDepth = Math.max(0, Math.min(Number(params.maxDepth ?? 3), 8));
      const maxEntries = Math.max(20, Math.min(Number(params.maxEntries ?? 400), 4000));
      const includeHidden = Boolean(params.includeHidden);
      const showSizes = Boolean(params.showSizes);
      const result = buildTree({ projectRoot: ctx.cwd, root, maxDepth, maxEntries, includeHidden, showSizes });
      const header = [
        `root: ${normalizeRelative(ctx.cwd, root)}`,
        `depth: ${maxDepth}`,
        `entries: ${result.visited}`,
        result.omitted ? `omitted: ${result.omitted}` : undefined,
      ]
        .filter(Boolean)
        .join(" | ");
      const tree = renderTree(result.nodes).join("\n") || "(empty)";
      return {
        content: [{ type: "text", text: `${header}\n\n${tree}` }],
        details: result,
      };
    },
    renderCall(args, theme) {
      return new Text(`${theme.fg("toolTitle", theme.bold("project_tree "))}${theme.fg("accent", args.root || ".")}`, 0, 0);
    },
  });

  pi.registerTool({
    name: "code_search_batch",
    label: "Code Search Batch",
    description: "Run multiple read-only ripgrep searches and return compact line-oriented results.",
    promptSnippet: "Use code_search_batch when several symbols, routes, keys, or error strings need to be searched together.",
    promptGuidelines: [
      "Batch related patterns instead of making many single searches.",
      "Use globs to constrain language or test files when the task is narrow.",
      "Ask for file paths, line numbers, and exact matching lines in follow-up analysis.",
    ],
    parameters: Type.Object({
      queries: Type.Array(
        Type.Object({
          pattern: Type.String({ description: "ripgrep pattern to search for." }),
          cwd: Type.Optional(Type.String({ description: "Project-relative directory to search in." })),
          globs: Type.Optional(Type.Array(Type.String(), { description: "Optional ripgrep -g patterns." })),
          caseInsensitive: Type.Optional(Type.Boolean({ description: "Use case-insensitive search." })),
          isRegex: Type.Optional(Type.Boolean({ description: "Treat pattern as regex. Default false (literal/fixed-string search)." })),
          before: Type.Optional(Type.Number({ description: "Context lines before each match." })),
          after: Type.Optional(Type.Number({ description: "Context lines after each match." })),
          maxResults: Type.Optional(Type.Number({ description: "Maximum matches per file from rg -m." })),
        }),
      ),
      maxLinesPerQuery: Type.Optional(Type.Number({ description: "Maximum output lines per query. Default 80." })),
    }),
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      const queries = (params.queries || []) as SearchQuery[];
      if (!queries.length) throw new Error("code_search_batch requires at least one query");
      if (queries.length > 12) throw new Error("code_search_batch supports at most 12 queries");
      const maxLinesPerQuery = Math.max(10, Math.min(Number(params.maxLinesPerQuery ?? 80), 300));

      const sections: string[] = [];
      for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        if (!query.pattern?.trim()) throw new Error(`query ${i + 1} is missing pattern`);
        onUpdate?.({ content: [{ type: "text", text: `code_search_batch: ${i + 1}/${queries.length} ${query.pattern}` }] });
        const output = await runRipgrep(ctx.cwd, query);
        sections.push([
          `## ${i + 1}. ${query.pattern}`,
          query.cwd ? `cwd: ${query.cwd}` : undefined,
          query.globs?.length ? `globs: ${query.globs.join(", ")}` : undefined,
          "",
          output ? truncateLines(output, maxLinesPerQuery) : "(no matches)",
        ].filter((part) => part !== undefined).join("\n"));
      }

      return {
        content: [{ type: "text", text: sections.join("\n\n---\n\n") }],
        details: { queryCount: queries.length },
      };
    },
    renderCall(args, theme) {
      const count = Array.isArray(args.queries) ? args.queries.length : 0;
      return new Text(`${theme.fg("toolTitle", theme.bold("code_search_batch "))}${theme.fg("accent", `${count} queries`)}`, 0, 0);
    },
  });
}
