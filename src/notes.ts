import { realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { err, ok, type Result } from "./result.ts";

declare const noteIdBrand: unique symbol;
declare const directoryKeyBrand: unique symbol;

/** Stable internal identity for a note. */
export type NoteId = string & { readonly [noteIdBrand]: true };

/** Canonical path used to compare directory associations. */
export type DirectoryKey = string & { readonly [directoryKeyBrand]: true };

/** A note's canonical identity and human-readable directory path. */
export interface DirectoryAssociation {
  readonly key: DirectoryKey;
  readonly path: string;
}

/** Complete persisted note. */
export interface Note {
  readonly id: NoteId;
  readonly directory: DirectoryAssociation;
  readonly body: string;
  readonly title: string;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly lastOpenedAtMs: number;
}

/** An invalid identifier read from storage. */
export class InvalidNoteId extends Error {
  readonly _tag = "InvalidNoteId" as const;

  constructor() {
    super("Stored note ID is invalid");
  }
}

/** A directory that could not be resolved. */
export class DirectoryResolutionFailed extends Error {
  readonly _tag = "DirectoryResolutionFailed" as const;

  constructor(
    readonly path: string,
    override readonly cause: unknown,
  ) {
    super(`Could not resolve directory: ${path}`);
  }
}

/** Parse a stored note identifier. */
export function parseNoteId(input: unknown): Result<NoteId, InvalidNoteId> {
  if (
    typeof input !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(input)
  ) {
    return err(new InvalidNoteId());
  }

  // SAFETY: the UUID v4 shape above establishes the NoteId invariant.
  return ok(input as NoteId);
}

/** Generate a cryptographically random note identifier. */
export function createNoteId(): NoteId {
  const parsed = parseNoteId(crypto.randomUUID());
  if (parsed._tag === "err") {
    throw new Error("The runtime generated an invalid UUID");
  }
  return parsed.value;
}

/** Parse a canonical absolute directory key. */
export function parseDirectoryKey(input: unknown): Result<DirectoryKey, DirectoryResolutionFailed> {
  if (typeof input !== "string" || input.length === 0 || !isAbsolute(input)) {
    return err(
      new DirectoryResolutionFailed(typeof input === "string" ? input : "<invalid>", undefined),
    );
  }

  // SAFETY: the absolute, non-empty path check establishes the DirectoryKey invariant.
  return ok(input as DirectoryKey);
}

/** Resolve a directory into its stable association. */
export async function resolveDirectoryAssociation(
  input: string,
  platform: NodeJS.Platform = process.platform,
): Promise<Result<DirectoryAssociation, DirectoryResolutionFailed>> {
  const displayPath = resolve(input);
  try {
    const canonicalPath = await realpath(displayPath);
    const comparisonPath =
      platform === "win32" ? canonicalPath.toLocaleLowerCase("en-US") : canonicalPath;
    const key = parseDirectoryKey(comparisonPath);
    if (key._tag === "err") {
      return key;
    }
    return ok({ key: key.value, path: displayPath });
  } catch (cause: unknown) {
    return err(new DirectoryResolutionFailed(displayPath, cause));
  }
}

/** Derive a quiet display title from note content. */
export function deriveTitle(body: string, maximumLength = 72): string {
  const lines = body.split(/\r?\n/u);
  let firstText: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    firstText ??= trimmed;
    const heading = /^#{1,6}\s+(.+?)\s*#*$/u.exec(trimmed);
    if (heading?.[1] !== undefined) {
      return truncateTitle(heading[1], maximumLength);
    }
  }

  return firstText === undefined ? "Untitled" : truncateTitle(firstText, maximumLength);
}

/** Create an unsaved blank note associated with a directory. */
export function createBlankNote(
  directory: DirectoryAssociation,
  nowMs: number,
  id: NoteId = createNoteId(),
): Note {
  return {
    id,
    directory,
    body: "",
    title: "Untitled",
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    lastOpenedAtMs: nowMs,
  };
}

/** Replace a note's saved body and derived fields. */
export function withSavedBody(note: Note, body: string, nowMs: number): Note {
  return {
    ...note,
    body,
    title: deriveTitle(body),
    updatedAtMs: nowMs,
  };
}

function truncateTitle(input: string, maximumLength: number): string {
  const collapsed = input.replace(/\s+/gu, " ").trim();
  if (collapsed.length <= maximumLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, Math.max(1, maximumLength - 1)).trimEnd()}…`;
}
