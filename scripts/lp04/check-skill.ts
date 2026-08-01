import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface SkillCheckOptions {
  repoRoot: string;
  skillRoot: string;
}

const requiredFiles = [
  "SKILL.md",
  "agents/openai.yaml",
  "references/api-workflows.md",
  "references/error-recovery.md",
  "references/structured-reports.md",
  "references/client-setup.md",
] as const;

const walkMarkdown = (root: string): string[] => {
  const found: string[] = [];
  for (const name of readdirSync(root)) {
    const candidate = path.join(root, name);
    const stats = statSync(candidate);
    if (stats.isDirectory()) found.push(...walkMarkdown(candidate));
    else if (candidate.endsWith(".md")) found.push(candidate);
  }
  return found.sort();
};

const parseFrontmatter = (source: string): Map<string, string> | null => {
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(source);
  if (match?.[1] === undefined) return null;
  const result = new Map<string, string>();
  let currentKey: string | undefined;
  for (const line of match[1].split("\n")) {
    if (/^\s+/u.test(line) && currentKey !== undefined) {
      const prior = result.get(currentKey) ?? "";
      result.set(currentKey, `${prior} ${line.trim()}`.trim());
      continue;
    }
    const separator = line.indexOf(":");
    if (separator < 1) return null;
    currentKey = line.slice(0, separator).trim();
    result.set(currentKey, line.slice(separator + 1).trim());
  }
  return result;
};

const localLinks = (source: string): string[] =>
  [...source.matchAll(/\]\(([^)]+)\)/gu)]
    .map((match) => match[1] ?? "")
    .filter(
      (target) =>
        target.length > 0 &&
        !target.startsWith("http://") &&
        !target.startsWith("https://") &&
        !target.startsWith("#"),
    );

export const checkSkill = ({
  repoRoot,
  skillRoot,
}: SkillCheckOptions): string[] => {
  const errors: string[] = [];
  for (const relative of requiredFiles) {
    if (!existsSync(path.join(skillRoot, relative)))
      errors.push(`MISSING_FILE:${relative}`);
  }
  if (errors.length > 0) return errors;

  const mainPath = path.join(skillRoot, "SKILL.md");
  const main = readFileSync(mainPath, "utf8");
  const frontmatter = parseFrontmatter(main);
  if (frontmatter === null) errors.push("FRONTMATTER_INVALID");
  else {
    const keys = [...frontmatter.keys()].sort();
    if (keys.join(",") !== "description,name")
      errors.push(`FRONTMATTER_KEYS:${keys.join(",")}`);
    if (frontmatter.get("name") !== "idea-validation-workflow")
      errors.push("FRONTMATTER_NAME");
    const description = frontmatter.get("description") ?? "";
    for (const trigger of ["Idea", "project", "report", "recovery", "human"]) {
      if (!description.toLowerCase().includes(trigger.toLowerCase()))
        errors.push(`DESCRIPTION_TRIGGER:${trigger}`);
    }
  }

  const markdownFiles = walkMarkdown(skillRoot);
  const markdown = markdownFiles
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  if (!markdown.includes("openapi/lp03.v1.json"))
    errors.push("CANONICAL_OPENAPI_LINK_MISSING");
  if (!markdown.includes("structured-report.v1.schema.json"))
    errors.push("CANONICAL_REPORT_SCHEMA_LINK_MISSING");

  for (const file of markdownFiles) {
    const source = readFileSync(file, "utf8");
    for (const target of localLinks(source)) {
      const withoutFragment = target.split("#", 1)[0] ?? target;
      if (!existsSync(path.resolve(path.dirname(file), withoutFragment)))
        errors.push(
          `BROKEN_LINK:${path.relative(repoRoot, file)}:${withoutFragment}`,
        );
      if (
        file.includes(`${path.sep}references${path.sep}`) &&
        withoutFragment.startsWith("./") &&
        withoutFragment.endsWith(".md")
      )
        errors.push(`NESTED_REFERENCE:${path.relative(repoRoot, file)}`);
    }
  }

  const openapi = readFileSync(
    path.join(repoRoot, "openapi/lp03.v1.json"),
    "utf8",
  );
  const routes = new Set(
    [...markdown.matchAll(/`(\/(?:api\/v1|health)\/[^` ]+)`/gu)].map(
      (match) => match[1] ?? "",
    ),
  );
  for (const route of routes) {
    if (!openapi.includes(`\"${route}\"`))
      errors.push(`UNKNOWN_ROUTE:${route}`);
  }
  const errorCodes = new Set(
    [...markdown.matchAll(/`([A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)`/gu)].map(
      (match) => match[1] ?? "",
    ),
  );
  for (const code of errorCodes) {
    if (!openapi.includes(`\"${code}\"`)) errors.push(`UNKNOWN_ERROR:${code}`);
  }

  const forbiddenSecrets = [
    /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/u,
    /(?:token|cookie|password|secret)\s*[:=]\s*["'][^"']{8,}["']/iu,
    /https?:\/\/[^\s/@]+:[^\s/@]+@/u,
    /AKIA[0-9A-Z]{16}/u,
  ];
  for (const pattern of forbiddenSecrets) {
    if (pattern.test(markdown)) errors.push(`LITERAL_SECRET:${pattern.source}`);
  }
  for (const line of markdown.split("\n")) {
    if (
      /(?:AI|Skill).{0,80}(?:call|send|post|调用|发送).{0,80}human-confirmations/iu.test(
        line,
      )
    )
      errors.push("FORBIDDEN_HUMAN_ACTION");
  }
  return [...new Set(errors)].sort();
};

const currentFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === currentFile
) {
  const repoRoot = path.resolve(path.dirname(currentFile), "../..");
  const errors = checkSkill({
    repoRoot,
    skillRoot: path.join(repoRoot, "skills/idea-validation-workflow"),
  });
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else console.log("idea-validation-workflow: PASS");
}
