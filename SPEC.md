# TuiNotes (`2n`) Specification

Status: Draft product and technical specification. This document defines the intended first release; it is not an implementation plan or a compatibility contract.

## Product statement

TuiNotes is a directory-aware notes application for the terminal.

Running `2n` opens a focused, full-screen editor associated with the current directory. Notes are saved automatically to the operating system's application-data location. The current directory is organizational context only: TuiNotes never writes note data into the working directory.

The primary experience is immediate writing:

```text
$ 2n

┌─ TuiNotes · ~/oss/2n ───────────────────────────────┐
│                                                     │
│  Start typing…                                      │
│                                                     │
│                                                     │
├─────────────────────────────────────────────────────┤
│ Saved  Ctrl+N New  Ctrl+T Notes  Ctrl+P Preview     │
└─────────────────────────────────────────────────────┘
```

There is no insert mode, save command, or command language. Typing inserts text. `Ctrl+C` saves any pending change and exits.

## Product principles

1. **Writing is the default.** The editor is focused and usable on the first interactive frame.
2. **Saving is invisible but trustworthy.** Users never invoke Save, but the UI exposes a quiet `Saving…`, `Saved`, or `Save failed` state.
3. **Directories organize; they do not store.** Notes are associated with the directory where they were written and stored centrally by TuiNotes.
4. **Nothing disappears implicitly.** Missing directories do not delete notes. Destructive actions require a direct user decision.
5. **Advanced behavior stays out of the way.** Notes browsing and Markdown preview are available without turning the editor into a modal command system.
6. **Motion never delays work.** The launch animation is decorative, non-blocking, dismissible, and configurable off.

## First-release scope

The first release includes:

- A multiline plain-text editor.
- Automatic persistence.
- Multiple notes associated with the same directory.
- Reopening the most recently used note for the current directory.
- A global tree of all notes grouped by associated directory.
- Detection of notes whose associated directory no longer exists.
- Moving an orphaned note to the current directory.
- Deleting a note with confirmation.
- Markdown source editing and rendered preview.
- A brief optional launch animation at the bottom of the editor.
- macOS, Linux, and Windows storage locations and standalone executables.

The first release does not include:

- Vim-compatible modes or commands.
- Manual Save or Save As.
- Notes stored inside repositories or working directories.
- Cloud sync, accounts, collaboration, or remote storage.
- Encryption.
- Attachments.
- Automatic guessing when a directory has moved.
- A plugin system.
- Annotation mode or structural line editing. The UI state should allow these to be added later without changing persistence.

## Command-line behavior

### `2n`

1. Resolve and normalize the current working directory.
2. Open the application database.
3. Load the most recently opened note associated with that directory.
4. If none exists, create an in-memory blank draft. It is persisted after its first edit.
5. Mount and focus the editor.
6. Start the launch animation only after the editor is ready to receive input.

### `2n --all`

Open directly into the global notes tree. The working directory remains the destination for **Move here**.

### `2n --no-animation`

Disable the launch animation for this invocation without changing the saved preference.

### `2n config animation on|off`

Persistently enable or disable the launch animation. It is enabled by default.

Invalid arguments print a short usage message and return a non-zero exit status without entering terminal UI mode.

## Directory association

The directory association is the normalized, canonical absolute path captured at note creation or move time.

- Symlinked paths resolve to the underlying canonical directory so the same physical directory does not create multiple groups.
- The original human-readable path is retained for display.
- Windows path comparison is case-insensitive; display casing is preserved.
- Each note has exactly one associated directory path.
- Directory association can change only through the explicit **Move here** action.

If the associated directory does not exist, the note appears beneath **Orphans** in the global notes tree. The note remains readable and editable.

An orphaned note has two actions:

- **Move here** — associate it with the directory from which the current `2n` process was launched.
- **Delete** — permanently delete it after confirmation.

There is no relink workflow, directory identity heuristic, automatic deletion, or automatic merge.

## Notes

### Identity

Every persisted note has a generated stable ID. IDs are not exposed in the normal UI.

### Title

The display title is derived automatically:

1. Use the first non-empty Markdown heading, without the leading `#` characters.
2. Otherwise use the first non-empty line.
3. Otherwise display `Untitled`.
4. Collapse whitespace and truncate the tree label to a reasonable terminal width.

Changing the note body updates the derived title during the next save. Users are never interrupted to name a note.

### Blank drafts

- A new blank draft exists only in memory until the first content change.
- Exiting an untouched blank draft creates no database row.
- Once a note has been persisted, clearing all of its content does not delete it. It remains as an `Untitled` note until explicitly deleted.

### Ordering

- Notes within a directory are ordered by most recently updated first.
- Directory groups are ordered by most recently updated note, with the current directory first.
- Orphans form one separate top-level group.

## Persistence

### Application-data location

The database is stored outside working directories:

| Platform | Default data directory |
| --- | --- |
| macOS | `~/Library/Application Support/2n/` |
| Linux | `$XDG_DATA_HOME/2n/`, falling back to `~/.local/share/2n/` |
| Windows | `%LOCALAPPDATA%\2n\` |

The primary database file is `notes.sqlite3`.

The data-root resolver must be a small platform boundary with tests for environment-variable handling and fallbacks. Tests inject a temporary data root; they never write to the developer's real application data.

### Source of truth

SQLite is the source of truth for note bodies, directory associations, timestamps, and settings. This provides atomic updates and a single file to back up.

Minimum logical schema:

```sql
CREATE TABLE notes (
  id                 TEXT PRIMARY KEY,
  directory_key      TEXT NOT NULL,
  directory_path     TEXT NOT NULL,
  body               TEXT NOT NULL,
  title              TEXT NOT NULL,
  created_at_ms      INTEGER NOT NULL,
  updated_at_ms      INTEGER NOT NULL,
  last_opened_at_ms  INTEGER NOT NULL
);

CREATE INDEX notes_by_directory
  ON notes (directory_key, updated_at_ms DESC);

CREATE TABLE app_settings (
  singleton_id               INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  launch_animation_enabled   INTEGER NOT NULL CHECK (launch_animation_enabled IN (0, 1))
);
```

Database rows are parsed before becoming application values. An invalid or contradictory row is reported as a storage failure rather than being trusted through a TypeScript cast.

### Autosave

The OpenTUI textarea is authoritative for the live body. Solid does not receive a copy of the complete body after every keystroke.

On a textarea content-change event:

1. Read `textarea.plainText`.
2. Record a new in-memory content revision.
3. Schedule a save after 250 ms without another edit.
4. Save the newest revision in one SQLite transaction.

Autosave rules:

- At most one database write for a note may be in flight at once.
- If the body changes during a write, queue another write for the newest revision.
- A completed older write must never mark a newer revision as saved.
- Every created promise is owned and observed; autosave is not fire-and-forget work.
- Successful saves update the body, derived title, and update timestamp atomically.
- `Ctrl+C` cancels the debounce, flushes the newest revision, and exits after the flush succeeds.

The normal save states are:

```text
clean -> pending -> saving -> clean
                      |
                      -> failed
```

The footer displays:

- `Saved` for clean.
- `Saving…` for pending or saving.
- `Save failed` for failed.

If a normal autosave fails, the editor remains usable and retains the live buffer. A later edit retries saving. The failure is shown without replacing the editor.

If `Ctrl+C` cannot flush the latest revision:

1. Remain in the editor.
2. Show `Couldn’t save. Ctrl+C again to exit without saving.`
3. A second `Ctrl+C` exits deliberately without claiming the note was saved.

No normal exit path silently discards known unsaved content.

## Terminal UI

### Runtime and binding

- Runtime: Bun.
- Terminal engine: `@opentui/core`.
- UI binding: `@opentui/solid`.
- The production application is distributed as a standalone executable per supported OS and architecture.

OpenTUI and Solid are confined to the UI and composition boundary. Persistence and note behavior are ordinary TypeScript modules with no Solid signals or OpenTUI types in their public contracts.

### Primary layout

The normal editing screen contains:

1. A compact one-row header with `TuiNotes`, the associated directory, and derived note title when space permits.
2. A textarea occupying the remaining body.
3. A one-row footer containing save state and visible shortcuts.
4. An optional temporary launch-animation overlay immediately above the footer.

The editor has focus on mount. Resizing the terminal preserves the note, cursor, and focus.

### Controls

The initial global controls are intentionally small:

| Input | Behavior |
| --- | --- |
| `Ctrl+C` | Flush pending autosave and exit |
| `Ctrl+N` | Start a new blank note for the current directory |
| `Ctrl+T` | Open or close the global notes tree |
| `Ctrl+P` | Toggle Markdown source and preview |
| `Escape` | Close the tree, confirmation, or preview and return to editing |

The footer spells out shortcuts using `Ctrl+…`; it does not use caret notation or command-mode vocabulary.

Textarea editing uses conventional platform shortcuts supplied by OpenTUI for cursor movement, selection, undo, redo, copy, paste, and deletion.

### Notes tree

The notes tree is a global view generated from stored directory paths; it is unrelated to the physical database layout.

Example:

```text
All notes
├── ~
│   └── oss
│       ├── 2n
│       │   ├── Product direction
│       │   └── Autosave notes
│       └── opentui
│           └── Renderer observations
└── Orphans
    └── ~/oss/old-project
        └── Migration notes
```

Tree behavior:

- Arrow keys move selection.
- Left and right collapse or expand a directory branch.
- Enter opens the selected note.
- Selecting an orphaned note exposes **Move here** and **Delete**.
- Escape returns to the editor without changing the open note.
- Mouse selection may be supported, but all behavior must remain keyboard-accessible.

Opening the tree may start a non-blocking existence check for unique stored directory paths. Results update the tree as they arrive. Filesystem checks use bounded concurrency and never delay the editor's initial frame.

### Markdown preview

- Preview renders the current textarea body with OpenTUI's Markdown component.
- Preview does not create or modify a second copy of the note.
- Entering preview first reads the current textarea body directly, ensuring the final composed character is included.
- `Ctrl+P` or Escape returns to source editing with the textarea and cursor preserved.
- Live side-by-side preview is not part of the first release.

## Launch animation

### Intent

The launch animation adds a brief signature without becoming a splash screen. It must never postpone editor mount, focus, input, note loading, or autosave.

### Placement

- Render as an absolute overlay at the bottom of the textarea, immediately above the persistent footer.
- Do not reserve layout height and do not resize the textarea when the animation appears or disappears.
- Do not capture focus, keyboard input, mouse input, or hit-testing.
- The overlay may cover its own rows briefly. The first editing input dismisses it immediately, so it cannot obscure an actively moving cursor.

### Eligibility

Show the animation only when all conditions hold at initial mount:

- The saved animation setting is enabled.
- `--no-animation` was not supplied.
- `TUINOTES_REDUCE_MOTION` is not `1`.
- Standard input and output are interactive terminals.
- The terminal is at least 28 columns wide.
- The terminal is tall enough for the selected ASCII mark plus the header, footer, and at least six unobscured editor rows. With a six-row mark, this means a minimum height of 14 rows.

If the terminal becomes too small during the animation, remove it immediately. Growing the terminal later does not start a delayed animation.

There is no portable terminal equivalent of the browser's `prefers-reduced-motion`. The persistent setting, one-shot flag, and `TUINOTES_REDUCE_MOTION=1` provide explicit opt-out paths.

### Visual asset

The existing files in `ascii/` are candidate static `2n` marks, not animation frames. A single final mark will be selected before implementation.

- Plain and ANSI-colored candidates may be considered.
- If an ANSI-colored asset is selected, parse it into OpenTUI styled spans; do not render raw control sequences as text.
- Preserve the source asset's character-cell proportions.
- Do not cycle between the candidate files.

### Motion sequence

Default total presence: 2.4 seconds.

| Time | Behavior |
| --- | --- |
| `0–180 ms` | Mark enters with a quick ease-out opacity ramp |
| `180–700 ms` | A single restrained highlight or horizontal trace resolves across the static mark |
| `700–2100 ms` | Mark remains quiet and fully legible; no looping pulse, bounce, or spinner |
| `2100–2400 ms` | Mark exits with a short ease-out fade and is removed |

Actual movement is brief even though the area remains present for 2.4 seconds. The animation uses a fixed-size overlay and must not animate layout dimensions.

Interruption rules:

- The first printable key, edit command, paste, mouse click in the editor, or global shortcut starts a 120 ms dismissal.
- `Ctrl+C` skips dismissal and proceeds directly through the save-and-exit path.
- Opening the notes tree or preview removes the animation rather than moving it with the new view.
- Repeated launches may show the animation, but it never animates subsequent in-app navigation.

Rendering rules:

- Target at most 30 frames per second while motion is active.
- Stop continuous rendering when the animation is removed.
- Avoid bounce and spring motion.
- Paired mark and trace changes use the same timing.
- Color choices derive from the active theme and retain readable contrast in light and dark terminals.

### Animation configuration

Precedence from strongest to weakest:

1. `--no-animation`
2. `TUINOTES_REDUCE_MOTION=1`
3. Persisted `2n config animation on|off` value
4. Default: on

Configuration changes affect future launches. They do not restart or stop another running `2n` process.

## Application state

UI state should use explicit variants rather than overlapping booleans:

```ts
type Surface =
  | { readonly kind: "editor" }
  | { readonly kind: "preview" }
  | { readonly kind: "notes" }
  | { readonly kind: "confirm-delete"; readonly noteId: NoteId }
```

Save state should likewise be explicit:

```ts
type SaveState =
  | { readonly kind: "clean"; readonly revision: number }
  | { readonly kind: "pending"; readonly revision: number }
  | { readonly kind: "saving"; readonly revision: number }
  | { readonly kind: "failed"; readonly revision: number; readonly message: string }
```

The precise shapes may evolve during implementation, but illegal combinations such as simultaneous preview and delete confirmation should remain unrepresentable.

## Suggested code boundaries

Keep the project small. The intended responsibilities are:

```text
src/
├── main.tsx                 # Parse CLI input, open resources, mount UI, own shutdown
├── app.tsx                  # Solid/OpenTUI screen composition
├── notes.ts                 # Note identity, title derivation, and directory association
├── note-store.ts            # SQLite reads and atomic writes
├── autosave.ts              # Debounce, revision ordering, flush, and save state
├── app-data.ts              # Cross-platform application-data path resolution
├── launch-animation.tsx     # Eligibility, lifecycle, and visual rendering
└── notes-tree.tsx           # Logical tree projection and interactions
```

This is a responsibility map, not a requirement to create every file before behavior exists. Files should be combined when separation would only produce pass-through wrappers.

Resource ownership:

- `main.tsx` owns the database connection, renderer, signal handlers, and final cleanup.
- The note store owns SQLite translation and row parsing.
- Autosave owns every scheduled timer and write promise.
- The launch animation owns and cancels its timeline on dismissal or unmount.
- Solid cleanup must not be relied upon as the only place to flush user data.

## Failure behavior

### Startup failure

If the application-data directory or database cannot be opened safely, do not present an editable-but-unsavable buffer. Restore the terminal, print a concise diagnostic with the data path and safe cause summary, and exit non-zero.

### Invalid stored data

Reject invalid rows at the storage boundary. Do not cast decoded database values into note types. Report which record could not be loaded without printing note contents.

### Rendering failure

Restore terminal state before reporting the failure. Persisted notes remain intact; an unsaved live revision follows the same explicit failed-exit behavior as an autosave failure when recovery is still possible.

### Missing directory

A missing associated directory is normal application state, not an error. Display the note beneath **Orphans**.

## Verification

### Domain tests

- Title derivation handles headings, whitespace, empty notes, Unicode, and truncation.
- Path normalization is stable and idempotent for each supported platform shape.
- UI and save-state variants handle every case exhaustively.

### Persistence integration tests

Use a real temporary SQLite database and production migrations.

- Create, load, update, move, and delete a note.
- Multiple notes can share a directory.
- Body, title, association, and timestamps update atomically.
- Invalid persisted rows are rejected.
- Concurrent writes to different notes do not corrupt the database.

### Autosave tests

Use a controllable clock and a recording or temporary-database store supplied through the real autosave boundary.

- Rapid edits coalesce.
- A change during an active save queues the newest revision.
- Completion of an older revision cannot mark a newer revision clean.
- `flush()` writes the latest revision.
- Save failure retains the latest body and exposes failed state.
- Every timer and promise is settled or cancelled on shutdown.

### UI tests

Use OpenTUI's test renderer and frame capture.

- The editor is focused on the first frame.
- Typing modifies the textarea before the launch animation completes.
- `Ctrl+C` flushes and destroys the renderer.
- The tree groups notes by directory and separates orphans.
- **Move here** updates the selected note and removes it from Orphans.
- Delete requires confirmation.
- Preview includes the latest textarea contents and returns with cursor state preserved.

### Animation tests

Drive animation with a manual clock.

- Eligible terminals show the overlay without changing editor dimensions.
- Small terminals do not show it.
- Saved setting, `--no-animation`, and `TUINOTES_REDUCE_MOTION=1` disable it.
- The mark enters, holds, exits, and unregisters continuous rendering at the specified times.
- First input dismisses it within 120 ms while preserving the input.
- Resize below the minimum removes it immediately.
- Captured frames contain no raw ANSI escape bytes.

### End-to-end terminal test

At least one pseudo-terminal test should:

1. Launch `2n` with an isolated data root.
2. Type Unicode and multiline Markdown.
3. Press `Ctrl+C` without invoking Save.
4. Relaunch from the same directory.
5. Verify that the complete note returns.
6. Verify that terminal modes are restored after exit.

## First-release acceptance criteria

The first release is complete when:

1. `2n` opens directly into a focused editor for the current directory.
2. The user can type immediately, including while the launch animation is present.
3. Content persists automatically and survives `Ctrl+C` exit and relaunch.
4. No note files or metadata are written into the working directory.
5. `Ctrl+T` exposes every saved note in a directory-shaped global tree.
6. Missing directories place notes under **Orphans** without deleting them.
7. An orphan can be moved to the current directory or explicitly deleted.
8. Markdown preview renders the latest editor content.
9. The launch animation appears only when eligible, never changes editor layout, ends within 2.4 seconds, and can be disabled persistently or per launch.
10. macOS, Linux, and Windows builds resolve their correct application-data locations.
11. Expected storage failures are visible and never masquerade as successful saves.
12. Terminal state is restored on every controlled exit path.

## Deferred decisions

- Select the final launch mark from `ascii/`.
- Choose the initial light and dark color palettes.
- Decide whether a later release should export notes as ordinary Markdown files.
- Decide how a later release should handle simultaneous editing of the same note from two `2n` processes.
