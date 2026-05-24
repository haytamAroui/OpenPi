import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(path) {
  return readFileSync(join(root, path), "utf-8");
}

function walk(dir, predicate = () => true) {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return [];
  const files = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const full = join(absolute, entry.name);
    if (entry.isDirectory()) files.push(...walk(relative(root, full), predicate));
    else if (predicate(entry.name)) files.push(relative(root, full).replace(/\\/g, "/"));
  }
  return files;
}

function parseMarkdown(file) {
  const raw = read(file);
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };
  const frontmatter = parseYaml(match[1]) ?? {};
  if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    fail(`${file}: frontmatter must be a mapping`);
    return { frontmatter: {}, body: match[2] };
  }
  return { frontmatter, body: match[2] };
}

for (const file of walk("extensions", (name) => name.endsWith(".ts"))) {
  const content = read(file);
  if (content.includes("@mariozechner/")) fail(`${file}: uses old @mariozechner namespace`);
  if (content.includes("@sinclair/typebox")) fail(`${file}: uses @sinclair/typebox instead of typebox`);
  if (/--append-system-prompt",\s*(state\.def|agentDef)\.systemPrompt/.test(content)) {
    fail(`${file}: passes raw system prompt instead of a temp file`);
  }
}

const promptNames = new Map();
for (const file of walk("prompts", (name) => name.endsWith(".md"))) {
  const { frontmatter, body } = parseMarkdown(file);
  const name = typeof frontmatter.name === "string" ? frontmatter.name : basename(file, ".md");
  if (!body.trim()) fail(`${file}: prompt body is empty`);
  if (promptNames.has(name)) fail(`${file}: duplicate prompt name "${name}" also used by ${promptNames.get(name)}`);
  promptNames.set(name, file);
}

const agentNames = new Set();
for (const file of walk("agents", (name) => name.endsWith(".md"))) {
  const { frontmatter, body } = parseMarkdown(file);
  if (typeof frontmatter.name !== "string" || !frontmatter.name.trim()) fail(`${file}: missing agent name`);
  if (typeof frontmatter.description !== "string" || !frontmatter.description.trim()) fail(`${file}: missing agent description`);
  if (!body.trim()) fail(`${file}: agent body is empty`);
  if (typeof frontmatter.name === "string") agentNames.add(frontmatter.name);
}

const teams = parseYaml(read("agents/teams.yaml")) ?? {};
for (const [team, members] of Object.entries(teams)) {
  if (!Array.isArray(members)) {
    fail(`agents/teams.yaml: ${team} must be a list`);
    continue;
  }
  for (const member of members) {
    if (!agentNames.has(member)) fail(`agents/teams.yaml: ${team} references unknown agent ${member}`);
  }
}

const chains = parseYaml(read("agents/agent-chain.yaml")) ?? {};
for (const [chainName, chain] of Object.entries(chains)) {
  if (!chain || typeof chain !== "object" || Array.isArray(chain) || !Array.isArray(chain.steps)) {
    fail(`agents/agent-chain.yaml: ${chainName} must have steps`);
    continue;
  }
  for (const [index, step] of chain.steps.entries()) {
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      fail(`agents/agent-chain.yaml: ${chainName} step ${index + 1} must be a mapping`);
      continue;
    }
    if (!agentNames.has(step.agent)) fail(`agents/agent-chain.yaml: ${chainName} references unknown agent ${step.agent}`);
    if (typeof step.prompt !== "string" || !step.prompt.trim()) fail(`agents/agent-chain.yaml: ${chainName} step ${index + 1} missing prompt`);
  }
}

if (failures.length) {
  console.error(failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("openpi package validation passed");
