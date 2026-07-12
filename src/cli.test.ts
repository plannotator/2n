import { describe, expect, test } from "bun:test";

import { parseArguments } from "./cli.ts";

describe("command line", () => {
  test("opens the editor by default", () => {
    expect(parseArguments([])).toEqual({
      _tag: "ok",
      value: { _tag: "open", initialSurface: "editor", animation: "configured" },
    });
  });

  test("supports the global tree and one-shot animation opt-out in either order", () => {
    expect(parseArguments(["--no-animation", "--all"])).toEqual({
      _tag: "ok",
      value: { _tag: "open", initialSurface: "notes", animation: "disabled" },
    });
  });

  test("parses persistent animation configuration", () => {
    expect(parseArguments(["config", "animation", "off"])).toEqual({
      _tag: "ok",
      value: { _tag: "set-animation", enabled: false },
    });
  });

  test("rejects unknown arguments", () => {
    expect(parseArguments(["--wat"])._tag).toBe("err");
  });
});
