import { describe, expect, test } from "bun:test";

import { testRender } from "@opentui/solid";

import { AsciiAuditions, type AuditionResult } from "./ascii-auditions.tsx";

describe("2E ASCII auditions", () => {
  test("renders the candidate grid and returns ratings and finalists", async () => {
    let result: AuditionResult | undefined;
    const setup = await testRender(
      () => (
        <AsciiAuditions
          reducedMotion
          onExit={(value) => {
            result = value;
          }}
        />
      ),
      { width: 100, height: 35 },
    );

    try {
      await setup.renderOnce();
      const grid = setup.captureCharFrame();
      expect(grid).toContain("2E · ASCII Auditions");
      expect(grid).toContain("Option 01");
      expect(grid).toContain("Option 02");
      expect(grid).not.toContain("\u001B[");

      setup.mockInput.pressArrow("right");
      setup.mockInput.pressKey("5");
      setup.mockInput.pressKey(" ");
      setup.mockInput.pressEnter();
      await setup.flush();
      const stage = setup.captureCharFrame();
      expect(stage).toContain("Animation audition");
      expect(stage).toContain("Option 02");
      expect(stage).toContain("★★★★★");
      expect(stage).toContain("◆ finalist");

      setup.mockInput.pressEscape();
      setup.mockInput.pressKey("q");
      await setup.flush();
      expect(result).toEqual({ ratings: [{ optionNumber: 2, rating: 5 }], finalists: [2] });
    } finally {
      setup.renderer.destroy();
    }
  });

  test("uses the option 18 layered choreography", async () => {
    const setup = await testRender(
      () => <AsciiAuditions reducedMotion onExit={() => undefined} />,
      { width: 100, height: 35 },
    );

    try {
      setup.mockInput.pressKey("END");
      setup.mockInput.pressEnter();
      await setup.flush();
      const stage = setup.captureCharFrame();
      expect(stage).toContain("Option 18");
      expect(stage).toContain("620ms layered reveal");
      expect(stage).toContain("▀▀▀▀▀");
    } finally {
      setup.renderer.destroy();
    }
  });
});
