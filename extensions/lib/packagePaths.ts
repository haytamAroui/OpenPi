import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const extensionLibDir = dirname(fileURLToPath(import.meta.url));
export const extensionDir = resolve(extensionLibDir, "..");
export const packageRoot = resolve(extensionDir, "..");

export const bundledPromptsDir = join(packageRoot, "prompts");
export const bundledAgentsDir = join(packageRoot, "agents");
export const bundledPiPiAgentsDir = join(bundledAgentsDir, "pi-pi");
export const bundledSkillsDir = join(packageRoot, "skills");
export const bundledThemesDir = join(packageRoot, "themes");
export const bundledDamageRulesPath = join(packageRoot, "damage-control-rules.yaml");
