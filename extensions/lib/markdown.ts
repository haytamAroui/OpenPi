import { parse as parseYaml } from "yaml";

export type FrontmatterValue = string | string[] | number | boolean | null | undefined;

export function parseMarkdownFrontmatter<T extends Record<string, FrontmatterValue> = Record<string, FrontmatterValue>>(
  raw: string,
): { frontmatter: T; body: string } {
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {} as T, body: raw };

  const parsed = parseYaml(match[1]);
  const frontmatter = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as T
    : {} as T;

  return { frontmatter, body: match[2].trim() };
}

export function stringField(value: FrontmatterValue): string {
  return typeof value === "string" ? value : "";
}

export function arrayField(value: FrontmatterValue): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string" && value.trim()) return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}
