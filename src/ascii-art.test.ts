import { describe, expect, test } from "bun:test";

import plainSource from "../ascii/o2.txt" with { type: "text" };
import ansiSource from "../ascii/o16.txt" with { type: "text" };
import { parseAsciiArt } from "./ascii-art.ts";
import { asciiCandidates } from "./ascii-catalogue.ts";

describe("ASCII art parsing", () => {
  test("parses plain candidates without changing their cell dimensions", () => {
    const parsed = parseAsciiArt(plainSource);
    expect(parsed._tag).toBe("ok");
    expect(parsed._tag === "ok" && parsed.value.format).toBe("plain");
    expect(parsed._tag === "ok" && [parsed.value.width, parsed.value.height]).toEqual([18, 7]);
  });

  test("translates ANSI colors into styled runs without retaining control bytes", () => {
    const parsed = parseAsciiArt(ansiSource);
    expect(parsed._tag).toBe("ok");
    if (parsed._tag === "err") {
      return;
    }
    expect(parsed.value.format).toBe("ansi");
    expect(
      parsed.value.lines.flatMap((line) => line.runs).some((run) => run.style.fg !== undefined),
    ).toBe(true);
    expect(
      parsed.value.lines.flatMap((line) => line.runs).some((run) => run.text.includes("\u001B")),
    ).toBe(false);
  });

  test("rejects unsupported terminal control sequences", () => {
    expect(parseAsciiArt("ok\u001B]0;title\u0007")._tag).toBe("err");
  });

  test("embeds and parses all 18 supplied candidates", () => {
    expect(asciiCandidates).toHaveLength(18);
    expect(asciiCandidates.filter((candidate) => candidate.art.format === "plain")).toHaveLength(5);
    expect(asciiCandidates.filter((candidate) => candidate.art.format === "ansi")).toHaveLength(13);
  });

  test("uses the custom 2n copy and complete 2n mark for option 8", () => {
    const option8 = asciiCandidates.find((candidate) => candidate.optionNumber === 8);
    expect(option8).toBeDefined();
    if (option8 === undefined) {
      return;
    }

    const lines = option8.art.lines.map((line) => line.runs.map((run) => run.text).join(""));
    const text = lines.join("\n");

    expect([option8.art.width, option8.art.height]).toEqual([40, 12]);
    expect(text).toContain("call backnotprop");
    expect(lines[2]?.startsWith("Use 2n to write")).toBe(true);
    expect(lines[3]?.startsWith("directory based notes..")).toBe(true);
    expect(lines[6]?.startsWith("PHONE:")).toBe(true);
    expect(lines[7]?.startsWith("08142-570104--08142-6698")).toBe(true);
    expect(text).toContain("write notes, tui style");
    expect(text).toContain("P.S. Made by Plannotator, bitch");
    expect(lines.slice(1, 6).map((line) => line.slice(23))).toEqual([
      "▀▀▀▀▀▀▄  █▄    ██",
      "     ▄█  ██▄   ██",
      "  ▄▄█▀   ██▀▄  ██",
      "▄█▀      ██  ▀▄██",
      "███████  ██    ▀█",
    ]);
    expect(
      option8.art.lines[11]?.runs
        .filter((run) => run.text.trim().length > 0)
        .every((run) => run.style.fg === "#FFD27D"),
    ).toBe(true);
  });
});
