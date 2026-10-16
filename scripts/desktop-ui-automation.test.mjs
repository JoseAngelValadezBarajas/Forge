import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "desktop-ui-automation.ps1");

test("Windows UI Automation helper compiles before validating its target process", {
  skip: process.platform !== "win32",
}, () => {
  const result = spawnSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script,
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      FORGE_UIA_ACTION: "inspect",
      FORGE_UIA_PROCESS_ID: "0",
      FORGE_UIA_CONTROL_TYPE: "*",
      FORGE_UIA_NAME: "",
      FORGE_UIA_MATCH: "exact",
      FORGE_UIA_TIMEOUT_SECONDS: "1",
    },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 1, output);
  assert.match(output, /FORGE_UIA_PROCESS_ID must identify/);
  assert.doesNotMatch(output, /Add-Type|SOURCE_CODE_ERROR|CompilerError/);
});
