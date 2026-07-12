import { useTerminalDimensions, useTimeline } from "@opentui/solid";
import { createSignal, For } from "solid-js";

import { theme } from "./theme.ts";

const MARK = [
  "██████╗ ███╗   ██╗",
  "╚════██╗████╗  ██║",
  " █████╔╝██╔██╗ ██║",
  "██╔═══╝ ██║╚██╗██║",
  "███████╗██║ ╚████║",
  "╚══════╝╚═╝  ╚═══╝",
] as const;

/** Launch-mark component inputs. */
export interface LaunchAnimationProps {
  readonly onComplete: () => void;
  readonly onMouseDismiss: () => void;
}

/** Render the brief non-layout launch signature. */
export function LaunchAnimation(props: LaunchAnimationProps) {
  const dimensions = useTerminalDimensions();
  const animation = { opacity: 0, trace: 0 };
  const [opacity, setOpacity] = createSignal(0);
  const [trace, setTrace] = createSignal(0);
  const timeline = useTimeline({ duration: 2400, loop: false, onComplete: props.onComplete });

  timeline.add(
    animation,
    {
      opacity: 1,
      duration: 180,
      ease: "outQuad",
      onUpdate: () => setOpacity(animation.opacity),
    },
    0,
  );
  timeline.add(
    animation,
    {
      trace: 1,
      duration: 520,
      ease: "outQuad",
      onUpdate: () => setTrace(animation.trace),
    },
    180,
  );
  timeline.add(
    animation,
    {
      opacity: 0,
      duration: 300,
      ease: "outQuad",
      onUpdate: () => setOpacity(animation.opacity),
    },
    2100,
  );

  return (
    <box
      position="absolute"
      left={Math.max(1, Math.floor((dimensions().width - 19) / 2))}
      bottom={1}
      width={19}
      height={6}
      zIndex={20}
      opacity={opacity()}
      backgroundColor={theme.background}
      onMouseDown={() => props.onMouseDismiss()}
    >
      <For each={MARK}>
        {(line) => {
          const highlightedLength = () => Math.floor(line.length * trace());
          return (
            <text height={1} wrapMode="none">
              <span style={{ fg: theme.accentStrong }}>{line.slice(0, highlightedLength())}</span>
              <span style={{ fg: theme.faint }}>{line.slice(highlightedLength())}</span>
            </text>
          );
        }}
      </For>
    </box>
  );
}
