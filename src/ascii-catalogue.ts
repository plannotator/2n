import o1 from "../ascii/o1.txt" with { type: "text" };
import o10 from "../ascii/o10.txt" with { type: "text" };
import o11 from "../ascii/o11.txt" with { type: "text" };
import o12 from "../ascii/o12.txt" with { type: "text" };
import o13 from "../ascii/o13.txt" with { type: "text" };
import o14 from "../ascii/o14.txt" with { type: "text" };
import o15 from "../ascii/o15.txt" with { type: "text" };
import o16 from "../ascii/o16.txt" with { type: "text" };
import o17 from "../ascii/o17.txt" with { type: "text" };
import o18 from "../ascii/o18.txt" with { type: "text" };
import o2 from "../ascii/o2.txt" with { type: "text" };
import o3 from "../ascii/o3.txt" with { type: "text" };
import o4 from "../ascii/o4.txt" with { type: "text" };
import o5 from "../ascii/o5.txt" with { type: "text" };
import o6 from "../ascii/o6.txt" with { type: "text" };
import o7 from "../ascii/o7-needs2.txt" with { type: "text" };
import o9 from "../ascii/o9.txt" with { type: "text" };

import { parseAsciiArt, type AsciiArt } from "./ascii-art.ts";

/** One named candidate available to the audition application. */
export interface AsciiCandidate {
  readonly id: string;
  readonly optionNumber: number;
  readonly filename: string;
  readonly note?: string | undefined;
  readonly art: AsciiArt;
}

const ESCAPE = "\u001B[";
const RESET = `${ESCAPE}0m`;
const AUDITION_WIDTH = 40;

const auditionColors = {
  blue: "0;94;1;40m",
  cyan: "0;96;1;40m",
  dim: "0;37;40m",
  green: "0;92;1;40m",
  red: "0;91;1;40m",
  white: "0;97;1;40m",
  yellow: "0;93;1;40m",
} as const;

type AuditionColor = keyof typeof auditionColors;

interface AuditionSegment {
  readonly color: AuditionColor;
  readonly text: string;
}

const twoGlyph = ["▀▀▀▀▀▀▄", "     ▄█", "  ▄▄█▀ ", "▄█▀    ", "███████"] as const;
const nGlyph = ["█▄    ██", "██▄   ██", "██▀▄  ██", "██  ▀▄██", "██    ▀█"] as const;

function segment(color: AuditionColor, text: string): AuditionSegment {
  return { color, text };
}

function renderAuditionLine(left: ReadonlyArray<AuditionSegment>, glyphRow?: number): string {
  const segments = [...left];
  let visibleWidth = left.reduce((width, part) => width + Array.from(part.text).length, 0);

  if (glyphRow !== undefined) {
    const two = twoGlyph[glyphRow];
    const n = nGlyph[glyphRow];
    if (two === undefined || n === undefined) {
      throw new Error(`Option 8 glyph row ${glyphRow} does not exist`);
    }
    const glyphWidth = Array.from(two).length + 2 + Array.from(n).length;
    const gap = AUDITION_WIDTH - visibleWidth - glyphWidth;
    if (gap < 0) {
      throw new Error(`Option 8 row exceeds ${AUDITION_WIDTH} cells`);
    }
    segments.push(segment("dim", " ".repeat(gap)));
    segments.push(segment("blue", two));
    segments.push(segment("dim", "  "));
    segments.push(segment("white", n));
    visibleWidth += gap + glyphWidth;
  }

  if (visibleWidth > AUDITION_WIDTH) {
    throw new Error(`Option 8 row exceeds ${AUDITION_WIDTH} cells`);
  }
  segments.push(segment("dim", " ".repeat(AUDITION_WIDTH - visibleWidth)));
  return `${segments
    .map((part) => `${ESCAPE}${auditionColors[part.color]}${part.text}`)
    .join("")}${RESET}`;
}

const option8AuditionSource = [
  renderAuditionLine([
    segment("green", "call"),
    segment("white", " "),
    segment("blue", "backnotprop"),
  ]),
  renderAuditionLine([], 0),
  renderAuditionLine([segment("white", "Use 2n to write")], 1),
  renderAuditionLine([segment("white", "directory based notes..")], 2),
  renderAuditionLine([], 3),
  renderAuditionLine([], 4),
  renderAuditionLine([segment("yellow", "PHONE:")]),
  renderAuditionLine([
    segment("cyan", "08142-570104"),
    segment("red", "--"),
    segment("cyan", "08142-6698"),
  ]),
  renderAuditionLine([
    segment("red", "write notes"),
    segment("white", ", "),
    segment("blue", "tui style"),
  ]),
  renderAuditionLine([]),
  renderAuditionLine([]),
  renderAuditionLine([segment("yellow", "P.S. Made by Plannotator, bitch")]),
].join("\n");

const sources = [
  { optionNumber: 1, filename: "o1.txt", source: o1 },
  { optionNumber: 2, filename: "o2.txt", source: o2 },
  { optionNumber: 3, filename: "o3.txt", source: o3 },
  { optionNumber: 4, filename: "o4.txt", source: o4 },
  { optionNumber: 5, filename: "o5.txt", source: o5 },
  { optionNumber: 6, filename: "o6.txt", source: o6 },
  {
    optionNumber: 7,
    filename: "o7-needs2.txt",
    source: o7,
    note: "needs a clearer 2",
  },
  {
    optionNumber: 8,
    filename: "o8.txt",
    source: option8AuditionSource,
    note: "custom 2e audition edit",
  },
  { optionNumber: 9, filename: "o9.txt", source: o9 },
  { optionNumber: 10, filename: "o10.txt", source: o10 },
  { optionNumber: 11, filename: "o11.txt", source: o11 },
  { optionNumber: 12, filename: "o12.txt", source: o12 },
  { optionNumber: 13, filename: "o13.txt", source: o13 },
  { optionNumber: 14, filename: "o14.txt", source: o14 },
  { optionNumber: 15, filename: "o15.txt", source: o15 },
  { optionNumber: 16, filename: "o16.txt", source: o16 },
  { optionNumber: 17, filename: "o17.txt", source: o17 },
  { optionNumber: 18, filename: "o18.txt", source: o18 },
] as const;

/** Every parsed audition candidate, in numeric order. */
export const asciiCandidates: ReadonlyArray<AsciiCandidate> = sources.map((candidate) => {
  const parsed = parseAsciiArt(candidate.source);
  if (parsed._tag === "err") {
    throw new Error(`${candidate.filename}: ${parsed.error.message}`);
  }
  return {
    id: `option-${candidate.optionNumber}`,
    optionNumber: candidate.optionNumber,
    filename: candidate.filename,
    note: "note" in candidate ? candidate.note : undefined,
    art: parsed.value,
  };
});
