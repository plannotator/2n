import { RGBA, SyntaxStyle } from "@opentui/core";

/** Shared TUINotes terminal colors. */
export const theme = {
  background: "#111318",
  panel: "#181B22",
  panelRaised: "#20242D",
  text: "#E8EAF0",
  muted: "#9298A8",
  faint: "#616878",
  accent: "#7DCFFF",
  accentStrong: "#B4F0FF",
  danger: "#FF7A90",
  warning: "#FFD27D",
  success: "#88D498",
  selection: "#26394A",
  border: "#353B48",
} as const;

/** Syntax colors used by Markdown preview and fenced code. */
export const markdownSyntaxStyle = SyntaxStyle.fromStyles({
  keyword: { fg: RGBA.fromHex("#FF8FA3"), bold: true },
  string: { fg: RGBA.fromHex("#B7E4A8") },
  comment: { fg: RGBA.fromHex("#7D8597"), italic: true },
  number: { fg: RGBA.fromHex("#C9A7FF") },
  boolean: { fg: RGBA.fromHex("#C9A7FF") },
  function: { fg: RGBA.fromHex("#7DCFFF") },
  type: { fg: RGBA.fromHex("#FFD27D") },
  operator: { fg: RGBA.fromHex("#FF8FA3") },
  variable: { fg: RGBA.fromHex("#E8EAF0") },
  property: { fg: RGBA.fromHex("#7DCFFF") },
  punctuation: { fg: RGBA.fromHex("#B6BBC8") },
  default: { fg: RGBA.fromHex("#E8EAF0") },
});
