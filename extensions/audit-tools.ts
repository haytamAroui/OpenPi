import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const DEFAULT_SKIP = new Set([
  ".git",
  "node_modules",
  ".next",
  ".nuxt",
  ".turbo",
  "dist",
  "build",
  "coverage",
  ".venv",
  "venv",
  "__pycache__",
  "target",
]);

const SECRET_PATTERNS = [
  ["aws-access-key", /AKIA[A-Z0-9]{16}/g],
  ["github-token", /ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,}/g],
  ["gitlab-token", /glpat-[A-Za-z0-9_-]{20,}/g],
  ["slack-token", /xox[baprs]-[A-Za-z0-9-]{20,}/g],
  ["npm-token", /npm_[A-Za-z0-9]{30,}/g],
  ["google-api-key", /AIza[0-9A-Za-z_-]{35}/g],
  ["stripe-live-key", /sk_live_[0-9A-Za-z]{20,}|pk_live_[0-9A-Za-z]{20,}/g],
  ["sendgrid-key", /SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g],
  ["private-key", /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g],
  ["jwt-like-token", /eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
] as const;

const GHOST_PATTERNS = [
  ["always-equal", /def\s+__eq__[\s\S]{0,120}return\s+True|__eq__\s*=\s*lambda[^:\n]*:\s*True/g],
  ["exit-bypass", /sys\.exit\s*\(\s*0\s*\)|os\._exit\s*\(\s*0\s*\)|process\.exit\s*\(\s*0\s*\)/g],
  ["pytest-report-patch", /TestReport\.from_item_and_call|pytest_runtest_makereport|monkeypatch.*TestReport/g],
  ["assertion-monkeypatch", /expect\s*=\s*jest\.fn|assert\s*=\s*lambda|monkeypatch.*assert/g],
] as const;

function walkFiles(root: string, maxFiles: number): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    if (files.length >= maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      if (DEFAULT_SKIP.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  };
  walk(root);
  return files;
}

function relative(root: string, filePath: string): string {
  return path.relative(root, filePath).replace(/\\/g, "/") || ".";
}

function readSmallText(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 1_000_000) return null;
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

function redact(value: string): string {
  if (value.length <= 12) return "[redacted]";
  return `${value.slice(0, 8)}...${value.slice(-3)}`;
}

function git(args: string[], cwd: string): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (result.status !== 0) return "";
  return result.stdout.trim();
}

function detectFrameworks(root: string): string[] {
  const found = new Set<string>();
  const packageJson = path.join(root, "package.json");
  if (fs.existsSync(packageJson)) {
    const raw = readSmallText(packageJson);
    if (raw) {
      const pkg = JSON.parse(raw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.next) found.add("Next.js");
      if (deps.react) found.add("React");
      if (deps.vite) found.add("Vite");
      if (deps["@sveltejs/kit"]) found.add("SvelteKit");
      if (deps.vue) found.add("Vue");
      if (deps.express) found.add("Express");
      if (deps.vitest) found.add("Vitest");
      if (deps.jest) found.add("Jest");
      if (deps.typescript) found.add("TypeScript");
    }
  }
  if (fs.existsSync(path.join(root, "pyproject.toml")) || fs.existsSync(path.join(root, "requirements.txt"))) found.add("Python");
  if (fs.existsSync(path.join(root, "Cargo.toml"))) found.add("Rust");
  if (fs.existsSync(path.join(root, "go.mod"))) found.add("Go");
  if (fs.existsSync(path.join(root, "Dockerfile"))) found.add("Docker");
  return Array.from(found);
}

function dependencyInventory(root: string): string {
  const sections: string[] = [];
  const packageJson = path.join(root, "package.json");
  if (fs.existsSync(packageJson)) {
    const raw = readSmallText(packageJson);
    if (raw) {
      const pkg = JSON.parse(raw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const loose = Object.entries(deps).filter(([, version]) => /^[~^*]/.test(version));
      sections.push(`Node packages: ${Object.keys(deps).length}`);
      sections.push(`Node lockfile: ${fs.existsSync(path.join(root, "package-lock.json")) || fs.existsSync(path.join(root, "pnpm-lock.yaml")) || fs.existsSync(path.join(root, "yarn.lock")) || fs.existsSync(path.join(root, "bun.lock")) ? "present" : "missing"}`);
      if (loose.length) sections.push(`Loose pins: ${loose.slice(0, 20).map(([name, version]) => `${name}@${version}`).join(", ")}${loose.length > 20 ? `, +${loose.length - 20} more` : ""}`);
    }
  }
  for (const file of ["requirements.txt", "pyproject.toml", "Cargo.toml", "go.mod", "Gemfile"]) {
    if (fs.existsSync(path.join(root, file))) sections.push(`Manifest: ${file}`);
  }
  return sections.join("\n") || "No common dependency manifests found.";
}

export default function auditToolsExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "env_scan",
    label: "Env Scan",
    description: "Summarize project environment: git status, manifests, package managers, frameworks, and top-level structure.",
    promptSnippet: "Use env_scan before setup, dependency work, unfamiliar repos, or build diagnostics.",
    parameters: Type.Object({
      maxTopEntries: Type.Optional(Type.Number({ description: "Maximum top-level entries to show. Default 80." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const maxTopEntries = Math.max(10, Math.min(Number(params.maxTopEntries ?? 80), 200));
      const entries = fs.readdirSync(ctx.cwd, { withFileTypes: true })
        .filter((entry) => !DEFAULT_SKIP.has(entry.name))
        .slice(0, maxTopEntries)
        .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${entry.name}`);
      const branch = git(["branch", "--show-current"], ctx.cwd) || "(no git branch)";
      const status = git(["status", "--short"], ctx.cwd) || "(clean or not a git repo)";
      const frameworks = detectFrameworks(ctx.cwd);
      const text = [
        `cwd: ${ctx.cwd}`,
        `branch: ${branch}`,
        `frameworks: ${frameworks.length ? frameworks.join(", ") : "none detected"}`,
        "",
        "git status:",
        status,
        "",
        "dependencies:",
        dependencyInventory(ctx.cwd),
        "",
        "top-level:",
        ...entries,
      ].join("\n");
      return { content: [{ type: "text", text }] };
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("env_scan")), 0, 0);
    },
  });

  pi.registerTool({
    name: "secret_scan",
    label: "Secret Scan",
    description: "Read-only high-signal secret scan with redacted findings.",
    promptSnippet: "Use secret_scan before shipping, importing external files, or touching credentials.",
    parameters: Type.Object({
      maxFiles: Type.Optional(Type.Number({ description: "Maximum files to scan. Default 5000." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const maxFiles = Math.max(100, Math.min(Number(params.maxFiles ?? 5000), 20000));
      const files = walkFiles(ctx.cwd, maxFiles);
      const findings: string[] = [];
      for (const file of files) {
        const content = readSmallText(file);
        if (!content) continue;
        for (const [rule, pattern] of SECRET_PATTERNS) {
          pattern.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = pattern.exec(content))) {
            findings.push(`${relative(ctx.cwd, file)}:${lineOf(content, match.index)} ${rule} ${redact(match[0])}`);
          }
        }
      }
      const envGitignored = !fs.existsSync(path.join(ctx.cwd, ".env")) || (readSmallText(path.join(ctx.cwd, ".gitignore")) || "").includes(".env");
      const verdict = findings.length ? "BLOCKED" : "CLEAN";
      return {
        content: [{ type: "text", text: [`secret_scan verdict: ${verdict}`, `.env gitignored: ${envGitignored ? "yes" : "no"}`, "", ...(findings.length ? findings : ["No high-signal secrets found."])].join("\n") }],
        details: { findings },
      };
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("secret_scan")), 0, 0);
    },
  });

  pi.registerTool({
    name: "ghost_test_scan",
    label: "Ghost Test Scan",
    description: "Static scan for test-suite reward hacking patterns such as always-true equality, exit bypasses, and framework patching.",
    promptSnippet: "Use ghost_test_scan when validating test integrity before trusting green tests.",
    parameters: Type.Object({
      maxFiles: Type.Optional(Type.Number({ description: "Maximum files to scan. Default 3000." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const maxFiles = Math.max(100, Math.min(Number(params.maxFiles ?? 3000), 10000));
      const files = walkFiles(ctx.cwd, maxFiles).filter((file) => /test|spec|conftest|setup/i.test(file));
      const findings: string[] = [];
      for (const file of files) {
        const content = readSmallText(file);
        if (!content) continue;
        for (const [rule, pattern] of GHOST_PATTERNS) {
          pattern.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = pattern.exec(content))) {
            findings.push(`${relative(ctx.cwd, file)}:${lineOf(content, match.index)} ${rule}`);
          }
        }
      }
      return {
        content: [{ type: "text", text: [`ghost_test_scan verdict: ${findings.length ? "SUSPICIOUS" : "CLEAN"}`, `files scanned: ${files.length}`, "", ...(findings.length ? findings : ["No static reward-hack patterns found."])].join("\n") }],
        details: { findings },
      };
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("ghost_test_scan")), 0, 0);
    },
  });

  pi.registerTool({
    name: "dependency_inventory",
    label: "Dependency Inventory",
    description: "Read-only dependency manifest inventory with lockfile and loose-pin checks.",
    promptSnippet: "Use dependency_inventory before dependency updates, migration planning, or ship gates.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      return { content: [{ type: "text", text: dependencyInventory(ctx.cwd) }] };
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("dependency_inventory")), 0, 0);
    },
  });
}
