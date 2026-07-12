import { err, ok, type Result } from "./result.ts";

/** Text styling reconstructed from ANSI SGR codes. */
export interface AsciiStyle {
  readonly fg?: string | undefined;
  readonly bg?: string | undefined;
  readonly bold?: boolean | undefined;
}

/** One same-style section of an ASCII-art line. */
export interface AsciiRun {
  readonly text: string;
  readonly startColumn: number;
  readonly style: AsciiStyle;
}

/** One parsed line of an ASCII-art candidate. */
export interface AsciiLine {
  readonly runs: ReadonlyArray<AsciiRun>;
  readonly width: number;
}

/** ASCII art reconstructed without terminal control bytes. */
export interface AsciiArt {
  readonly format: "plain" | "ansi";
  readonly lines: ReadonlyArray<AsciiLine>;
  readonly width: number;
  readonly height: number;
}

/** Invalid or unsupported ANSI content. */
export class InvalidAsciiArt extends Error {
  readonly _tag = "InvalidAsciiArt" as const;

  constructor(readonly reason: string) {
    super(`Could not parse ASCII art: ${reason}`);
  }
}

const STANDARD_FOREGROUNDS = [
  "#111318",
  "#D95D72",
  "#78C091",
  "#E6C56C",
  "#6FA8DC",
  "#B48ECA",
  "#65C6C4",
  "#D7DAE0",
] as const;

const BRIGHT_FOREGROUNDS = [
  "#616878",
  "#FF7A90",
  "#88D498",
  "#FFD27D",
  "#7DCFFF",
  "#D9A7FF",
  "#8BE9FD",
  "#FFFFFF",
] as const;

const STANDARD_BACKGROUNDS = [
  "#111318",
  "#8F3145",
  "#376B49",
  "#806A2D",
  "#315D88",
  "#634577",
  "#327574",
  "#B7BBC4",
] as const;

const BRIGHT_BACKGROUNDS = [
  "#343945",
  "#D95D72",
  "#78C091",
  "#E6C56C",
  "#6FA8DC",
  "#B48ECA",
  "#65C6C4",
  "#E8EAF0",
] as const;

/** Parse plain or ANSI-colored ASCII art into safe styled lines. */
export function parseAsciiArt(input: string): Result<AsciiArt, InvalidAsciiArt> {
  const format = input.includes("\u001B[") ? "ansi" : "plain";
  const normalized = input.replaceAll("\r\n", "\n").replace(/\n+$/u, "");
  const rawLines = normalized.length === 0 ? [""] : normalized.split("\n");
  const lines: Array<AsciiLine> = [];

  for (const rawLine of rawLines) {
    const parsed = parseLine(rawLine);
    if (parsed._tag === "err") {
      return parsed;
    }
    lines.push(parsed.value);
  }

  return ok({
    format,
    lines,
    width: Math.max(0, ...lines.map((line) => line.width)),
    height: lines.length,
  });
}

function parseLine(input: string): Result<AsciiLine, InvalidAsciiArt> {
  const runs: Array<AsciiRun> = [];
  let style: AsciiStyle = {};
  let column = 0;
  let cursor = 0;
  const sequence = /\u001B\[([0-9;]*)m/gu;

  for (const match of input.matchAll(sequence)) {
    if (match.index === undefined) {
      return err(new InvalidAsciiArt("ANSI sequence has no location"));
    }
    if (match.index > cursor) {
      const text = input.slice(cursor, match.index);
      if (text.includes("\u001B")) {
        return err(new InvalidAsciiArt("unsupported terminal control sequence"));
      }
      runs.push({ text, startColumn: column, style });
      column += Array.from(text).length;
    }
    const applied = applySgr(style, match[1] ?? "");
    if (applied._tag === "err") {
      return applied;
    }
    style = applied.value;
    cursor = match.index + match[0].length;
  }

  if (cursor < input.length) {
    const text = input.slice(cursor);
    if (text.includes("\u001B")) {
      return err(new InvalidAsciiArt("unsupported terminal control sequence"));
    }
    runs.push({ text, startColumn: column, style });
    column += Array.from(text).length;
  }

  return ok({ runs, width: column });
}

function applySgr(current: AsciiStyle, parameters: string): Result<AsciiStyle, InvalidAsciiArt> {
  let style = current;
  const codes = parameters.length === 0 ? [0] : parameters.split(";").map(Number);
  for (const code of codes) {
    if (!Number.isInteger(code)) {
      return err(new InvalidAsciiArt("invalid SGR parameter"));
    }
    if (code === 0) {
      style = {};
    } else if (code === 1) {
      style = { ...style, bold: true };
    } else if (code === 22) {
      style = { ...style, bold: undefined };
    } else if (code >= 30 && code <= 37) {
      style = { ...style, fg: STANDARD_FOREGROUNDS[code - 30] };
    } else if (code >= 90 && code <= 97) {
      style = { ...style, fg: BRIGHT_FOREGROUNDS[code - 90] };
    } else if (code === 39) {
      style = { ...style, fg: undefined };
    } else if (code >= 40 && code <= 47) {
      style = { ...style, bg: STANDARD_BACKGROUNDS[code - 40] };
    } else if (code >= 100 && code <= 107) {
      style = { ...style, bg: BRIGHT_BACKGROUNDS[code - 100] };
    } else if (code === 49) {
      style = { ...style, bg: undefined };
    } else {
      return err(new InvalidAsciiArt(`unsupported SGR code ${code}`));
    }
  }
  return ok(style);
}
