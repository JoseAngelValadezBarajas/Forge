import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const tokenFile = join(dirname(fileURLToPath(import.meta.url)), "../src/styles/tokens.css");
const css = readFileSync(tokenFile, "utf8");

function lightThemeTokens() {
  const block = css.match(/:root\[data-theme="light"\]\s*\{([^}]*)\}/);
  assert.ok(block, "Light Mode token block must exist");
  return Object.fromEntries(
    [...block[1].matchAll(/--([\w-]+):\s*(#[\da-f]{6})\s*;/gi)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

function relativeLuminance(hex) {
  const channels = hex.match(/[\da-f]{2}/gi)?.map((channel) => parseInt(channel, 16) / 255);
  assert.equal(channels?.length, 3, `Expected a six-digit RGB color: ${hex}`);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first, second) {
  const luminances = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

function assertTextContrast(textColor, surfaces, minimum = 4.5) {
  const ratios = {};
  for (const [name, background] of Object.entries(surfaces)) {
    const ratio = contrastRatio(textColor, background);
    ratios[name] = ratio;
    assert.ok(
      ratio >= minimum,
      `${textColor} has ${ratio.toFixed(2)}:1 contrast on --${name} (${background}); need ${minimum}:1`,
    );
  }
  return ratios;
}

test("Light Mode subtle text meets WCAG AA on every product surface", (context) => {
  const tokens = lightThemeTokens();
  const surfaces = Object.fromEntries(
    [
      "bg",
      "surface-sidebar",
      "surface",
      "surface-interactive",
      "surface-raised",
      "surface-tag",
    ].map((name) => {
      assert.ok(tokens[name], `Light Mode must define --${name}`);
      return [name, tokens[name]];
    }),
  );
  assert.ok(tokens["text-subtle"], "Light Mode must define --text-subtle");
  const ratios = assertTextContrast(tokens["text-subtle"], surfaces);
  context.diagnostic(
    Object.entries(ratios)
      .map(([name, ratio]) => `--${name}: ${ratio.toFixed(2)}:1`)
      .join(", "),
  );
});

test("contrast assertion rejects an insufficient token using a real surface value", () => {
  const tokens = lightThemeTokens();
  const surfaces = Object.fromEntries(
    ["bg", "surface-sidebar", "surface", "surface-interactive", "surface-raised", "surface-tag"].map(
      (name) => [name, tokens[name]],
    ),
  );
  assert.throws(() => assertTextContrast(tokens.surface, surfaces), /contrast on --/);
});
