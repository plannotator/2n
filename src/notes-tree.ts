import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { parse, relative, sep } from "node:path";

import type { DirectoryKey, Note, NoteId } from "./notes.ts";

/** One keyboard-selectable row in the global notes tree. */
export type TreeRow =
  | {
      readonly _tag: "directory";
      readonly id: string;
      readonly depth: number;
      readonly label: string;
      readonly expanded: boolean;
      readonly orphanGroup: boolean;
    }
  | {
      readonly _tag: "note";
      readonly id: string;
      readonly depth: number;
      readonly label: string;
      readonly noteId: NoteId;
      readonly orphan: boolean;
    };

/** Snapshot used to build global tree rows. */
export interface NotesTreeInput {
  readonly notes: ReadonlyArray<Note>;
  readonly currentDirectoryKey: DirectoryKey;
  readonly collapsed: ReadonlySet<string>;
  readonly homeDirectory?: string;
  readonly directoryExists?: (path: string) => boolean;
}

interface Branch {
  readonly id: string;
  readonly label: string;
  readonly children: Map<string, Branch>;
  readonly notes: Array<Note>;
  maximumUpdatedAtMs: number;
  containsCurrentDirectory: boolean;
}

/** Project stored directory associations into visible, collapsible tree rows. */
export function buildNotesTree(input: NotesTreeInput): ReadonlyArray<TreeRow> {
  const directoryExists = input.directoryExists ?? existsSync;
  const homeDirectory = input.homeDirectory ?? homedir();
  const regular: Array<Note> = [];
  const orphans: Array<Note> = [];
  for (const note of input.notes) {
    if (directoryExists(note.directory.path)) {
      regular.push(note);
    } else {
      orphans.push(note);
    }
  }

  const root = makeBranch("root", "All notes");
  for (const note of regular) {
    insertNote(root, note, input.currentDirectoryKey, homeDirectory);
  }

  const rows: Array<TreeRow> = [];
  const sortedRoots = [...root.children.values()].sort(compareBranches);
  for (const branch of sortedRoots) {
    flattenBranch(branch, 0, false, input.collapsed, rows);
  }

  if (orphans.length > 0) {
    const orphanId = "orphans";
    const expanded = !input.collapsed.has(orphanId);
    rows.push({
      _tag: "directory",
      id: orphanId,
      depth: 0,
      label: "Orphans",
      expanded,
      orphanGroup: true,
    });
    if (expanded) {
      const byPath = groupOrphans(orphans);
      for (const [path, notes] of byPath) {
        const id = `orphan:${path}`;
        const pathExpanded = !input.collapsed.has(id);
        rows.push({
          _tag: "directory",
          id,
          depth: 1,
          label: compactHome(path, homeDirectory),
          expanded: pathExpanded,
          orphanGroup: true,
        });
        if (pathExpanded) {
          for (const note of notes) {
            rows.push(noteRow(note, 2, true));
          }
        }
      }
    }
  }
  return rows;
}

function insertNote(
  root: Branch,
  note: Note,
  currentDirectoryKey: DirectoryKey,
  homeDirectory: string,
): void {
  const parts = displayParts(note.directory.path, homeDirectory);
  let branch = root;
  let branchPath = "";
  for (const part of parts) {
    branchPath = `${branchPath}/${part}`;
    let child = branch.children.get(part);
    if (child === undefined) {
      child = makeBranch(`dir:${branchPath}`, part);
      branch.children.set(part, child);
    }
    child.maximumUpdatedAtMs = Math.max(child.maximumUpdatedAtMs, note.updatedAtMs);
    child.containsCurrentDirectory ||= note.directory.key === currentDirectoryKey;
    branch = child;
  }
  branch.notes.push(note);
}

function flattenBranch(
  branch: Branch,
  depth: number,
  orphanGroup: boolean,
  collapsed: ReadonlySet<string>,
  rows: Array<TreeRow>,
): void {
  const expanded = !collapsed.has(branch.id);
  rows.push({
    _tag: "directory",
    id: branch.id,
    depth,
    label: branch.label,
    expanded,
    orphanGroup,
  });
  if (!expanded) {
    return;
  }
  const children = [...branch.children.values()].sort(compareBranches);
  for (const child of children) {
    flattenBranch(child, depth + 1, orphanGroup, collapsed, rows);
  }
  const notes = [...branch.notes].sort((left, right) => right.updatedAtMs - left.updatedAtMs);
  for (const note of notes) {
    rows.push(noteRow(note, depth + 1, false));
  }
}

function noteRow(note: Note, depth: number, orphan: boolean): TreeRow {
  return {
    _tag: "note",
    id: `note:${note.id}`,
    depth,
    label: note.title,
    noteId: note.id,
    orphan,
  };
}

function displayParts(path: string, homeDirectory: string): ReadonlyArray<string> {
  const fromHome = relative(homeDirectory, path);
  if (fromHome.length === 0) {
    return ["~"];
  }
  if (!fromHome.startsWith("..") && !parse(fromHome).root) {
    return ["~", ...fromHome.split(sep).filter((part) => part.length > 0)];
  }
  const parsed = parse(path);
  const rest = path
    .slice(parsed.root.length)
    .split(/[\\/]+/u)
    .filter((part) => part.length > 0);
  return [parsed.root || "/", ...rest];
}

function compactHome(path: string, homeDirectory: string): string {
  const fromHome = relative(homeDirectory, path);
  if (fromHome.length === 0) {
    return "~";
  }
  if (!fromHome.startsWith("..") && !parse(fromHome).root) {
    return `~/${fromHome.split(sep).join("/")}`;
  }
  return path;
}

function groupOrphans(
  notes: ReadonlyArray<Note>,
): ReadonlyArray<readonly [string, ReadonlyArray<Note>]> {
  const grouped = new Map<string, Array<Note>>();
  for (const note of notes) {
    const group = grouped.get(note.directory.path);
    if (group === undefined) {
      grouped.set(note.directory.path, [note]);
    } else {
      group.push(note);
    }
  }
  return [...grouped.entries()]
    .map(
      ([path, groupedNotes]) =>
        [path, groupedNotes.sort((a, b) => b.updatedAtMs - a.updatedAtMs)] as const,
    )
    .sort((left, right) => (right[1][0]?.updatedAtMs ?? 0) - (left[1][0]?.updatedAtMs ?? 0));
}

function makeBranch(id: string, label: string): Branch {
  return {
    id,
    label,
    children: new Map(),
    notes: [],
    maximumUpdatedAtMs: 0,
    containsCurrentDirectory: false,
  };
}

function compareBranches(left: Branch, right: Branch): number {
  if (left.containsCurrentDirectory !== right.containsCurrentDirectory) {
    return left.containsCurrentDirectory ? -1 : 1;
  }
  return (
    right.maximumUpdatedAtMs - left.maximumUpdatedAtMs || left.label.localeCompare(right.label)
  );
}
