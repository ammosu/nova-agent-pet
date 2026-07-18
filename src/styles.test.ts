import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectFile = (relativePath: string) =>
  fileURLToPath(new URL(`../${relativePath}`, import.meta.url));

const appSource = readFileSync(projectFile("src/App.tsx"), "utf8");
const styles = readFileSync(projectFile("src/styles.css"), "utf8");

const animatedSelectors = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([, , declarations]) => /\banimation\s*:/.test(declarations))
  .flatMap(([, selectors]) => selectors.split(","))
  .map((selector) => selector.trim());

describe("fixed front garments", () => {
  it.each(["rig-robe-front", "rig-collar-front"])(
    "keeps %s out of independently animated cloth layers",
    (layerClass) => {
      const imageTag = appSource.match(
        new RegExp(`<img\\s+className="[^"]*${layerClass}[^"]*"[^>]*?/>`),
      )?.[0];

      expect(imageTag).toBeDefined();
      expect(imageTag).not.toContain("rig-cloth");
    },
  );

  it("does not assign a second animation timeline to the robe or collar", () => {
    const independentlyAnimatedGarments = animatedSelectors.filter(
      (selector) =>
        selector.includes(".rig-robe") || selector.includes(".rig-collar"),
    );

    expect(independentlyAnimatedGarments).toEqual([]);
  });
});
