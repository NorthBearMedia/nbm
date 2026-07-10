// Syntax-check every source file so a typo can never reach Railway's
// auto-deploy. Run via `npm test`.
import { readdirSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

function collect(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(full));
    else if (entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

let failed = false;
for (const file of collect("src")) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf-8" });
  if (result.status !== 0) {
    console.error(`✗ ${file}\n${result.stderr}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("✓ all source files parse");
