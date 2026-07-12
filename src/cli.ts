import { err, ok, type Result } from "./result.ts";

/** Parsed command-line behavior. */
export type Command =
  | {
      readonly _tag: "open";
      readonly initialSurface: "editor" | "notes";
      readonly animation: "configured" | "disabled";
    }
  | { readonly _tag: "set-animation"; readonly enabled: boolean };

/** Invalid command-line input. */
export class InvalidArguments extends Error {
  readonly _tag = "InvalidArguments" as const;

  constructor() {
    super("Invalid arguments");
  }
}

/** Short command-line help. */
export const USAGE = `Usage:
  2n [--all] [--no-animation]
  2n config animation on|off`;

/** Parse TUINotes command-line arguments. */
export function parseArguments(
  arguments_: ReadonlyArray<string>,
): Result<Command, InvalidArguments> {
  if (arguments_.length === 0) {
    return ok({ _tag: "open", initialSurface: "editor", animation: "configured" });
  }
  if (arguments_.length === 1 && arguments_[0] === "--all") {
    return ok({ _tag: "open", initialSurface: "notes", animation: "configured" });
  }
  if (arguments_.length === 1 && arguments_[0] === "--no-animation") {
    return ok({ _tag: "open", initialSurface: "editor", animation: "disabled" });
  }
  if (
    arguments_.length === 2 &&
    arguments_.includes("--all") &&
    arguments_.includes("--no-animation")
  ) {
    return ok({ _tag: "open", initialSurface: "notes", animation: "disabled" });
  }
  if (arguments_.length === 3 && arguments_[0] === "config" && arguments_[1] === "animation") {
    if (arguments_[2] === "on") {
      return ok({ _tag: "set-animation", enabled: true });
    }
    if (arguments_[2] === "off") {
      return ok({ _tag: "set-animation", enabled: false });
    }
  }
  return err(new InvalidArguments());
}
