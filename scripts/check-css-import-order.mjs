import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const cssPath = resolve("app/globals.css");
const css = readFileSync(cssPath, "utf8");
const lines = css.split(/\r?\n/);

let inBlockComment = false;
let sawNonImportRule = false;

function stripComments(line) {
  let current = line;
  while (current.length > 0) {
    if (inBlockComment) {
      const end = current.indexOf("*/");
      if (end === -1) return "";
      current = current.slice(end + 2);
      inBlockComment = false;
      continue;
    }

    const start = current.indexOf("/*");
    if (start === -1) return current;

    const end = current.indexOf("*/", start + 2);
    if (end === -1) {
      inBlockComment = true;
      return current.slice(0, start);
    }

    current = `${current.slice(0, start)}${current.slice(end + 2)}`;
  }
  return current;
}

for (const [index, rawLine] of lines.entries()) {
  const line = stripComments(rawLine).trim();
  if (!line) continue;

  if (line.startsWith("@charset")) continue;

  if (line.startsWith("@import")) {
    if (cssPath.endsWith("app\\globals.css") || cssPath.endsWith("app/globals.css")) {
      throw new Error(
        `${cssPath}:${index + 1} uses CSS @import. ` +
        "Import third-party global CSS from app/layout.tsx before ./globals.css instead."
      );
    }
    if (sawNonImportRule) {
      throw new Error(
        `${cssPath}:${index + 1} has an @import after CSS/Tailwind rules. ` +
        "Keep all @import statements at the top of app/globals.css before @tailwind."
      );
    }
    continue;
  }

  sawNonImportRule = true;
}

console.log("CSS import order OK");
