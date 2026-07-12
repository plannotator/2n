#!/usr/bin/env bun

import { createCliRenderer } from "@opentui/core";
import { render } from "@opentui/solid";

import { AsciiAuditions, type AuditionResult } from "./ascii-auditions.tsx";

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  targetFps: 30,
});

await render(
  () => (
    <AsciiAuditions
      reducedMotion={process.env.TUINOTES_REDUCE_MOTION === "1"}
      onExit={(result) => {
        renderer.destroy();
        queueMicrotask(() => printResult(result));
      }}
    />
  ),
  renderer,
);

function printResult(result: AuditionResult): void {
  const ratings = [...result.ratings].sort(
    (left, right) => right.rating - left.rating || left.optionNumber - right.optionNumber,
  );
  if (ratings.length === 0 && result.finalists.length === 0) {
    return;
  }
  const ratingSummary = ratings.map((entry) => `${entry.optionNumber}:${entry.rating}★`).join("  ");
  const finalistSummary = result.finalists.map((option) => `#${option}`).join(", ");
  if (ratingSummary.length > 0) {
    console.log(`Ratings: ${ratingSummary}`);
  }
  if (finalistSummary.length > 0) {
    console.log(`Finalists: ${finalistSummary}`);
  }
}
