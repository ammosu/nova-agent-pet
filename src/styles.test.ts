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

describe("layered eye rig", () => {
  it.each([
    "nova-pet-eye-depth-left.png",
    "nova-pet-eye-depth-right.png",
    "nova-pet-eye-pupil-left.png",
    "nova-pet-eye-pupil-right.png",
    "nova-pet-eye-glint-left.png",
    "nova-pet-eye-glint-right.png",
    "nova-pet-blink-left.png",
    "nova-pet-blink-right.png",
  ])("renders %s as an independent runtime layer", (filename) => {
    expect(appSource).toContain(`/assets/${filename}`);
  });

  it("keeps pointer focus variables neutral in reduced motion", () => {
    expect(appSource).toContain('setProperty("--eye-focus-x"');
    expect(appSource).toContain('setProperty("--eye-focus-y"');
    expect(styles).toMatch(/--eye-focus-x:\s*0px\s*!important/);
    expect(styles).toMatch(/--eye-focus-y:\s*0px\s*!important/);
  });

  it("uses different pupil ranges for listening and thinking", () => {
    expect(styles).toMatch(
      /\.state-listening \.rig-open-eyes\s*\{[^}]*--pupil-min:\s*1\.02;[^}]*--pupil-max:\s*1\.2;/s,
    );
    expect(styles).toMatch(
      /\.state-thinking \.rig-open-eyes\s*\{[^}]*--pupil-min:\s*0\.72;[^}]*--pupil-max:\s*0\.9;/s,
    );
  });
});
