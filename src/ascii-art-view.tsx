import { For } from "solid-js";

import type { AsciiArt, AsciiRun, AsciiStyle } from "./ascii-art.ts";
import { theme } from "./theme.ts";

/** ASCII-art rendering inputs. */
export interface AsciiArtViewProps {
  readonly art: AsciiArt;
  readonly highlightPosition?: number | undefined;
  readonly revealProgress?: number | undefined;
}

interface DisplaySegment {
  readonly text: string;
  readonly style: AsciiStyle;
  readonly highlighted: boolean;
}

/** Render parsed plain or ANSI art without emitting terminal control bytes. */
export function AsciiArtView(props: AsciiArtViewProps) {
  return (
    <box width={props.art.width} height={props.art.height} flexDirection="column">
      <For each={props.art.lines}>
        {(line, lineIndex) => (
          <text height={1} wrapMode="none">
            <For each={line.runs}>
              {(run) => (
                <For
                  each={displaySegments(
                    run,
                    props.highlightPosition,
                    props.revealProgress,
                    props.art.width,
                    props.art.height,
                    lineIndex(),
                  )}
                >
                  {(segment) => (
                    <span
                      style={{
                        fg: segment.highlighted
                          ? theme.accentStrong
                          : (segment.style.fg ?? theme.text),
                        bg: segment.style.bg,
                        bold: segment.highlighted || segment.style.bold,
                      }}
                    >
                      {segment.text}
                    </span>
                  )}
                </For>
              )}
            </For>
          </text>
        )}
      </For>
    </box>
  );
}

function displaySegments(
  run: AsciiRun,
  highlightPosition: number | undefined,
  revealProgress: number | undefined,
  artWidth: number,
  artHeight: number,
  lineIndex: number,
): ReadonlyArray<DisplaySegment> {
  if ((highlightPosition === undefined && revealProgress === undefined) || run.text.length === 0) {
    return [{ text: run.text, style: run.style, highlighted: false }];
  }

  const bandWidth = Math.max(2, Math.round(artWidth * 0.12));
  const leadingEdge = (highlightPosition ?? -1) * (artWidth + bandWidth);
  const characters = Array.from(run.text);
  const segments: Array<DisplaySegment> = [];
  let segmentText = "";
  let segmentHighlight = false;
  let segmentVisible = true;

  for (const [index, character] of characters.entries()) {
    const column = run.startColumn + index;
    const visible = isVisible(run.style, column, lineIndex, artWidth, artHeight, revealProgress);
    const highlighted =
      visible &&
      highlightPosition !== undefined &&
      column <= leadingEdge &&
      column > leadingEdge - bandWidth;
    if (
      segmentText.length > 0 &&
      (highlighted !== segmentHighlight || visible !== segmentVisible)
    ) {
      segments.push({
        text: segmentText,
        style: segmentVisible ? run.style : {},
        highlighted: segmentHighlight,
      });
      segmentText = "";
    }
    segmentHighlight = highlighted;
    segmentVisible = visible;
    segmentText += visible ? character : " ";
  }
  if (segmentText.length > 0) {
    segments.push({
      text: segmentText,
      style: segmentVisible ? run.style : {},
      highlighted: segmentHighlight,
    });
  }
  return segments;
}

function isVisible(
  style: AsciiStyle,
  column: number,
  line: number,
  artWidth: number,
  artHeight: number,
  revealProgress: number | undefined,
): boolean {
  if (revealProgress === undefined) {
    return true;
  }
  const layer = revealLayer(style);
  const horizontalPosition = artWidth <= 1 ? 0 : column / (artWidth - 1);
  const verticalPosition = artHeight <= 1 ? 0 : line / (artHeight - 1);
  const activation = 0.02 + layer * 0.24 + horizontalPosition * 0.12 + verticalPosition * 0.08;
  return revealProgress >= activation;
}

function revealLayer(style: AsciiStyle): number {
  if (style.fg === "#7DCFFF" || style.bg === "#315D88" || style.bg === "#327574") {
    return 2;
  }
  if (style.fg === "#65C6C4") {
    return 1;
  }
  return 0;
}
