import type { ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard, useTerminalDimensions, useTimeline } from "@opentui/solid";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import { AsciiArtView } from "./ascii-art-view.tsx";
import { asciiCandidates, type AsciiCandidate } from "./ascii-catalogue.ts";
import { theme } from "./theme.ts";

const CARD_HEIGHT = 17;
const ROW_GAP = 1;
const MINIMUM_CARD_WIDTH = 46;

/** Ratings returned when an audition session exits. */
export interface AuditionResult {
  readonly ratings: ReadonlyArray<{ readonly optionNumber: number; readonly rating: number }>;
  readonly finalists: ReadonlyArray<number>;
}

/** ASCII audition application inputs. */
export interface AsciiAuditionsProps {
  readonly reducedMotion: boolean;
  readonly onExit: (result: AuditionResult) => void;
}

type Surface = "grid" | "audition";

/** Display every candidate in a responsive evaluation grid and focused motion stage. */
export function AsciiAuditions(props: AsciiAuditionsProps) {
  const dimensions = useTerminalDimensions();
  const [surface, setSurface] = createSignal<Surface>("grid");
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [ratings, setRatings] = createSignal<ReadonlyMap<string, number>>(new Map());
  const [finalists, setFinalists] = createSignal<ReadonlySet<string>>(new Set());
  const [replay, setReplay] = createSignal(0);
  let gridScroll: ScrollBoxRenderable | undefined;

  const columns = createMemo(() =>
    Math.max(
      1,
      Math.min(
        4,
        Math.floor(Math.max(MINIMUM_CARD_WIDTH, dimensions().width - 1) / MINIMUM_CARD_WIDTH),
      ),
    ),
  );
  const cardWidth = createMemo(() =>
    Math.max(1, Math.floor((dimensions().width - (columns() - 1) * ROW_GAP) / columns())),
  );
  const selectedCandidate = createMemo(
    () => asciiCandidates[selectedIndex()] ?? asciiCandidates[0],
  );

  useKeyboard((key) => {
    if ((key.ctrl && key.name === "c") || key.name === "q") {
      key.preventDefault();
      key.stopPropagation();
      exit();
      return;
    }

    if (surface() === "audition") {
      if (key.name === "escape" || key.name === "g") {
        key.preventDefault();
        key.stopPropagation();
        setSurface("grid");
        return;
      }
      if (key.name === "r" || key.name === "return") {
        key.preventDefault();
        key.stopPropagation();
        setReplay((value) => value + 1);
        return;
      }
      if (isRatingKey(key.name)) {
        rateSelected(Number(key.name));
      }
      return;
    }

    if (key.name === "left") {
      moveSelection(-1);
    } else if (key.name === "right") {
      moveSelection(1);
    } else if (key.name === "up") {
      moveSelection(-columns());
    } else if (key.name === "down") {
      moveSelection(columns());
    } else if (key.name === "home") {
      select(0);
    } else if (key.name === "end") {
      select(asciiCandidates.length - 1);
    } else if (key.name === "return") {
      setSurface("audition");
      setReplay((value) => value + 1);
    } else if (key.name === "space") {
      toggleFinalist();
    } else if (isRatingKey(key.name)) {
      rateSelected(Number(key.name));
    } else {
      return;
    }
    key.preventDefault();
    key.stopPropagation();
  });

  function moveSelection(delta: number): void {
    select(Math.max(0, Math.min(asciiCandidates.length - 1, selectedIndex() + delta)));
  }

  function select(index: number): void {
    setSelectedIndex(index);
    const row = Math.floor(index / columns());
    gridScroll?.scrollTo(Math.max(0, row * (CARD_HEIGHT + ROW_GAP) - 1));
  }

  function rateSelected(rating: number): void {
    const candidate = selectedCandidate();
    if (candidate === undefined) {
      return;
    }
    const next = new Map(ratings());
    next.set(candidate.id, rating);
    setRatings(next);
  }

  function toggleFinalist(): void {
    const candidate = selectedCandidate();
    if (candidate === undefined) {
      return;
    }
    const next = new Set(finalists());
    if (next.has(candidate.id)) {
      next.delete(candidate.id);
    } else {
      next.add(candidate.id);
    }
    setFinalists(next);
  }

  function exit(): void {
    props.onExit({
      ratings: asciiCandidates.flatMap((candidate) => {
        const rating = ratings().get(candidate.id);
        return rating === undefined ? [] : [{ optionNumber: candidate.optionNumber, rating }];
      }),
      finalists: asciiCandidates
        .filter((candidate) => finalists().has(candidate.id))
        .map((candidate) => candidate.optionNumber),
    });
  }

  return (
    <box width="100%" height="100%" flexDirection="column" backgroundColor={theme.background}>
      <Show
        when={surface() === "grid"}
        fallback={
          <AuditionStage
            candidate={selectedCandidate()}
            replay={replay()}
            reducedMotion={props.reducedMotion}
            ratings={ratings()}
            finalists={finalists()}
          />
        }
      >
        <box
          height={1}
          flexDirection="row"
          paddingLeft={1}
          paddingRight={1}
          backgroundColor={theme.panel}
        >
          <text fg={theme.accentStrong}>
            <strong>2E · ASCII Auditions</strong>
          </text>
          <text fg={theme.faint}>
            {" "}
            {asciiCandidates.length} candidates · plain + ANSI rendered safely
          </text>
        </box>

        <scrollbox
          ref={(value: ScrollBoxRenderable) => {
            gridScroll = value;
          }}
          flexGrow={1}
          focused
          scrollY
          scrollX={false}
          backgroundColor={theme.background}
        >
          <box width="100%" flexDirection="row" flexWrap="wrap" gap={ROW_GAP}>
            <For each={asciiCandidates}>
              {(candidate, index) => (
                <CandidateCard
                  candidate={candidate}
                  width={cardWidth()}
                  selected={selectedIndex() === index()}
                  rating={ratings().get(candidate.id) ?? 0}
                  finalist={finalists().has(candidate.id)}
                  onSelect={() => select(index())}
                />
              )}
            </For>
          </box>
        </scrollbox>

        <box
          height={1}
          paddingLeft={1}
          paddingRight={1}
          flexDirection="row"
          backgroundColor={theme.panel}
        >
          <text fg={theme.muted}>←↑↓→ Select Enter Audition 1–5 Rate Space Finalist Q Exit</text>
          <text fg={theme.faint}> {columns()} columns</text>
        </box>
      </Show>
    </box>
  );
}

interface CandidateCardProps {
  readonly candidate: AsciiCandidate;
  readonly width: number;
  readonly selected: boolean;
  readonly rating: number;
  readonly finalist: boolean;
  readonly onSelect: () => void;
}

function CandidateCard(props: CandidateCardProps) {
  const rating = () => `${"★".repeat(props.rating)}${"☆".repeat(5 - props.rating)}`;
  return (
    <box
      width={props.width}
      height={CARD_HEIGHT}
      border
      borderStyle={props.selected ? "double" : "single"}
      borderColor={props.selected ? theme.accent : theme.border}
      backgroundColor={props.selected ? theme.panelRaised : theme.background}
      flexDirection="column"
      onMouseDown={props.onSelect}
    >
      <box
        height={1}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="row"
        justifyContent="space-between"
      >
        <text fg={props.selected ? theme.accentStrong : theme.text}>
          <strong>Option {String(props.candidate.optionNumber).padStart(2, "0")}</strong>
        </text>
        <text fg={props.candidate.art.format === "ansi" ? theme.warning : theme.muted}>
          {props.candidate.art.format === "ansi" ? "ANSI" : "plain"}
        </text>
      </box>
      <box height={12} alignItems="center" justifyContent="center" overflow="hidden">
        <AsciiArtView art={props.candidate.art} />
      </box>
      <box
        height={1}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="row"
        justifyContent="space-between"
      >
        <text fg={theme.faint} wrapMode="none">
          {props.candidate.filename} · {props.candidate.art.width}×{props.candidate.art.height}
        </text>
        <text fg={props.rating > 0 ? theme.warning : theme.faint}>{rating()}</text>
        <text fg={props.finalist ? theme.accentStrong : theme.faint}>
          {props.finalist ? "◆" : "◇"}
        </text>
      </box>
    </box>
  );
}

interface AuditionStageProps {
  readonly candidate: AsciiCandidate | undefined;
  readonly replay: number;
  readonly reducedMotion: boolean;
  readonly ratings: ReadonlyMap<string, number>;
  readonly finalists: ReadonlySet<string>;
}

function AuditionStage(props: AuditionStageProps) {
  const candidate = () => requireCandidate(props.candidate);
  return (
    <box flexGrow={1} flexDirection="column" backgroundColor={theme.background}>
      <box
        height={1}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="row"
        backgroundColor={theme.panel}
      >
        <text fg={theme.accentStrong}>
          <strong>TUINotes</strong>
        </text>
        <text fg={theme.faint}> · ~/oss/2n · Animation audition</text>
      </box>
      <box flexGrow={1} position="relative" backgroundColor={theme.background}>
        <text fg={theme.faint}>Start typing…</text>
        <Show when={props.replay > 0}>
          <AuditionMotion
            candidate={candidate()}
            replay={props.replay}
            reducedMotion={props.reducedMotion}
          />
        </Show>
      </box>
      <box
        height={1}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="row"
        backgroundColor={theme.panel}
      >
        <text fg={theme.success}>Saved</text>
        <text fg={theme.muted}> R/Enter Replay Esc Grid 1–5 Rate Q Exit</text>
      </box>
      <box
        height={1}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="row"
        backgroundColor={theme.panelRaised}
      >
        <text fg={theme.text}>
          Option {String(candidate()?.optionNumber ?? 0).padStart(2, "0")} · {candidate()?.filename}
        </text>
        <text fg={theme.warning}> {ratingLabel(candidate(), props.ratings)}</text>
        <text fg={theme.accentStrong}>
          {candidate() !== undefined && props.finalists.has(candidate()?.id ?? "")
            ? "  ◆ finalist"
            : ""}
        </text>
        <text fg={theme.faint}> {motionLabel(candidate())}</text>
      </box>
    </box>
  );
}

interface AuditionMotionProps {
  readonly candidate: AsciiCandidate;
  readonly replay: number;
  readonly reducedMotion: boolean;
}

function AuditionMotion(props: AuditionMotionProps) {
  const dimensions = useTerminalDimensions();
  const isOption18 = props.candidate.optionNumber === 18;
  const animation = {
    opacity: props.reducedMotion ? 1 : 0,
    sweep: props.reducedMotion ? 2 : -0.2,
    reveal: props.reducedMotion || !isOption18 ? 1 : 0,
  };
  const [opacity, setOpacity] = createSignal(animation.opacity);
  const [sweep, setSweep] = createSignal(animation.sweep);
  const [reveal, setReveal] = createSignal(animation.reveal);
  const timeline = useTimeline({ duration: 2400, loop: false, autoplay: false });

  timeline.add(
    animation,
    { opacity: 1, duration: 180, ease: "outQuad", onUpdate: () => setOpacity(animation.opacity) },
    0,
  );
  if (isOption18) {
    timeline.add(
      animation,
      { reveal: 1, duration: 620, ease: "outQuad", onUpdate: () => setReveal(animation.reveal) },
      80,
    );
    timeline.add(
      animation,
      { sweep: 1.2, duration: 320, ease: "outQuad", onUpdate: () => setSweep(animation.sweep) },
      520,
    );
  } else {
    timeline.add(
      animation,
      { sweep: 1.2, duration: 520, ease: "outQuad", onUpdate: () => setSweep(animation.sweep) },
      180,
    );
  }
  timeline.add(
    animation,
    { opacity: 0, duration: 300, ease: "outQuad", onUpdate: () => setOpacity(animation.opacity) },
    2100,
  );

  createEffect(() => {
    props.replay;
    animation.opacity = props.reducedMotion ? 1 : 0;
    animation.sweep = props.reducedMotion ? 2 : -0.2;
    animation.reveal = props.reducedMotion || !isOption18 ? 1 : 0;
    setOpacity(animation.opacity);
    setSweep(animation.sweep);
    setReveal(animation.reveal);
    if (!props.reducedMotion) {
      timeline.restart();
    }
  });

  return (
    <box
      position="absolute"
      left={Math.max(0, Math.floor((dimensions().width - props.candidate.art.width) / 2))}
      bottom={1}
      width={props.candidate.art.width}
      height={props.candidate.art.height}
      opacity={opacity()}
      zIndex={10}
      backgroundColor={theme.background}
    >
      <AsciiArtView
        art={props.candidate.art}
        highlightPosition={sweep()}
        revealProgress={isOption18 ? reveal() : undefined}
      />
    </box>
  );
}

function isRatingKey(name: string): boolean {
  return name === "1" || name === "2" || name === "3" || name === "4" || name === "5";
}

function ratingLabel(
  candidate: AsciiCandidate | undefined,
  ratings: ReadonlyMap<string, number>,
): string {
  if (candidate === undefined) {
    return "☆☆☆☆☆";
  }
  const rating = ratings.get(candidate.id) ?? 0;
  return `${"★".repeat(rating)}${"☆".repeat(5 - rating)}`;
}

function requireCandidate(candidate: AsciiCandidate | undefined): AsciiCandidate {
  if (candidate === undefined) {
    throw new Error("The ASCII audition catalogue is empty");
  }
  return candidate;
}

function motionLabel(candidate: AsciiCandidate): string {
  return candidate.optionNumber === 18
    ? "180ms in · 620ms layered reveal · 320ms pulse · 300ms out"
    : "180ms in · 520ms trace · 1.4s hold · 300ms out";
}
