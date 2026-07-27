// Docblock coverage scanner for BrewForm audit.
// Line-based heuristic: finds top-level `export` declarations and checks whether
// the nearest preceding non-blank line closes a /** JSDoc block.

interface Finding {
  path: string;
  line: number;
  name: string;
  kind: string;
  doc: "jsdoc" | "none" | "line-comment" | "block-comment";
}

const ROOTS = [
  "apps/api/src",
  "apps/web/src",
  "packages/shared/src",
  "packages/db/src",
];

const EXCLUDE_RE =
  /(\.test\.|_test\.|\.spec\.|__tests__|\/migrations\/|\/generated\/|\.gen\.|\.d\.ts$)/;

const findings: Finding[] = [];
let fileCount = 0;

async function* walk(dir: string): AsyncGenerator<string> {
  for await (const e of Deno.readDir(dir)) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory) yield* walk(p);
    else if (e.isFile && /\.(ts|tsx)$/.test(e.name)) yield p;
  }
}

function classify(
  name: string,
  decl: string,
  restOfLine: string,
  nextLine: string,
  isTsx: boolean,
): string {
  if (decl === "function") {
    return /^use[A-Z]/.test(name) ? "hook" : "function";
  }
  if (decl === "class") return "class";
  if (decl === "interface" || decl === "type" || decl === "enum") return decl;
  // const/let/var
  if (/^use[A-Z]/.test(name)) return "hook";
  const rhs = restOfLine + " " + nextLine;
  const fnLike = /=>|function\b|memo\(|forwardRef\(|lazy\(/.test(rhs);
  if (fnLike) {
    if (isTsx && /^[A-Z]/.test(name)) return "component";
    return "arrow-fn";
  }
  if (isTsx && /^[A-Z]/.test(name) && /createContext|memo\(/.test(rhs)) {
    return "component";
  }
  return "const";
}

function docStatus(lines: string[], exportIdx: number): Finding["doc"] {
  // Walk up past blank lines and decorators.
  let i = exportIdx - 1;
  while (i >= 0) {
    const t = lines[i].trim();
    if (t === "" || t.startsWith("@")) {
      i--;
      continue;
    }
    break;
  }
  if (i < 0) return "none";
  const t = lines[i].trim();
  if (t.endsWith("*/")) {
    // single-line /** ... */ ?
    if (t.startsWith("/**")) return "jsdoc";
    if (t.startsWith("/*")) return "block-comment";
    // multi-line: walk up to the line that OPENS a comment block
    let j = i;
    while (j >= 0 && !lines[j].trim().startsWith("/*")) j--;
    if (j >= 0 && lines[j].trim().startsWith("/**")) return "jsdoc";
    return "block-comment";
  }
  if (t.startsWith("//")) {
    // consecutive // lines still are not JSDoc
    return "line-comment";
  }
  return "none";
}

const EXPORT_RE =
  /^export\s+(?:default\s+)?(?:abstract\s+)?(async\s+)?(function|class|interface|type|enum|const|let|var)\s*\*?\s+?([A-Za-z_$][\w$]*)/;

for (const root of ROOTS) {
  for await (const path of walk(root)) {
    const rel = path;
    if (EXCLUDE_RE.test(rel)) continue;
    fileCount++;
    const text = await Deno.readTextFile(path);
    const lines = text.split("\n");
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      if (!line.startsWith("export")) continue;
      // skip re-exports and bare export blocks
      if (/^export\s*(\{|\*)/.test(line)) continue;
      // skip `export default <expr>` without a name (anonymous default)
      const m = line.match(EXPORT_RE);
      if (!m) {
        // catch `export default function (` anonymous or `export default {`
        if (/^export default (async )?function\s*\(/.test(line)) {
          findings.push({
            path: rel,
            line: idx + 1,
            name: "(anonymous default fn)",
            kind: "function",
            doc: docStatus(lines, idx),
          });
        }
        continue;
      }
      const decl = m[2];
      const name = m[3];
      if (decl === "type" && /=\s*\{?\s*$/.test(line) === false && false) {
        // no-op; types included
      }
      const kind = classify(
        name,
        decl,
        line.slice(line.indexOf(name) + name.length),
        lines[idx + 1] ?? "",
        rel.endsWith(".tsx"),
      );
      findings.push({
        path: rel,
        line: idx + 1,
        name,
        kind,
        doc: docStatus(lines, idx),
      });
    }
  }
}

console.log(JSON.stringify({ fileCount, findings }, null, 1));
