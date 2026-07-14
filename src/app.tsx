import type { ScrollBoxRenderable, TextareaRenderable } from "@opentui/core";
import { useKeyboard, usePaste, useTerminalDimensions } from "@opentui/solid";
import { createEffect, createMemo, createSignal, For, onMount, Show } from "solid-js";

import { Autosave, systemAutosaveRuntime, type SaveState } from "./autosave.ts";
import { LaunchAnimation } from "./launch-animation.tsx";
import { createBlankNote, type DirectoryAssociation, type Note, type NoteId } from "./notes.ts";
import { buildNotesTree, type TreeRow } from "./notes-tree.ts";
import type { NoteStore } from "./note-store.ts";
import { markdownSyntaxStyle, theme } from "./theme.ts";

const SAVE_STATUS_WIDTH = 11;

/** The one active application surface. */
export type Surface =
  | { readonly _tag: "editor" }
  | { readonly _tag: "preview" }
  | { readonly _tag: "notes" }
  | { readonly _tag: "confirm-delete"; readonly noteId: NoteId };

/** Root TUINotes component inputs. */
export interface AppProps {
  readonly store: NoteStore;
  readonly currentDirectory: DirectoryAssociation;
  readonly initialNote: Note;
  readonly initialSurface: "editor" | "notes";
  readonly launchAnimationEligible: boolean;
  readonly copyToClipboard: (text: string) => boolean;
  readonly setMouseInputEnabled: (enabled: boolean) => void;
  readonly onExit: () => void;
  readonly registerExitHandler?: ((handler: () => void) => void) | undefined;
}

/** Compose the editor, preview, global notes tree, and save lifecycle. */
export function App(props: AppProps) {
  const dimensions = useTerminalDimensions();
  const [surface, setSurface] = createSignal<Surface>({ _tag: props.initialSurface });
  const [currentNote, setCurrentNote] = createSignal(props.initialNote);
  const [saveState, setSaveState] = createSignal<SaveState>({ _tag: "clean", revision: 0 });
  const [notes, setNotes] = createSignal<ReadonlyArray<Note>>([]);
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(new Set());
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [previewBody, setPreviewBody] = createSignal("");
  const [message, setMessage] = createSignal<string | undefined>();
  const [animationVisible, setAnimationVisible] = createSignal(false);
  const [exiting, setExiting] = createSignal(false);
  let exitWithoutSavingArmed = false;
  let textarea: TextareaRenderable | undefined;
  let treeScroll: ScrollBoxRenderable | undefined;
  let actionQueue: Promise<void> = Promise.resolve();
  let commandSelectionAnchor: number | undefined;

  const makeAutosave = (note: Note): Autosave =>
    new Autosave(note, props.store, systemAutosaveRuntime, {
      onStateChange: setSaveState,
      onSaved: setCurrentNote,
    });
  let autosave = makeAutosave(props.initialNote);

  const treeRows = createMemo(() =>
    buildNotesTree({
      notes: notes(),
      currentDirectoryKey: props.currentDirectory.key,
      collapsed: collapsed(),
    }),
  );
  const selectedRow = createMemo<TreeRow | undefined>(() => treeRows()[selectedIndex()]);
  const selectedNote = createMemo<Note | undefined>(() => {
    const row = selectedRow();
    if (row?._tag !== "note") {
      return undefined;
    }
    return notes().find((note) => note.id === row.noteId);
  });
  const animationFits = createMemo(() => dimensions().width >= 28 && dimensions().height >= 14);

  onMount(() => {
    props.registerExitHandler?.(requestExit);
    if (props.initialSurface === "notes") {
      refreshNotes();
      return;
    }
    textarea?.focus();
    if (props.launchAnimationEligible && animationFits()) {
      setAnimationVisible(true);
    }
  });

  createEffect(() => {
    if (animationVisible() && !animationFits()) {
      setAnimationVisible(false);
    }
  });

  createEffect(() => {
    props.setMouseInputEnabled(surface()._tag === "notes");
  });

  usePaste(() => {
    dismissAnimation();
  });

  useKeyboard((key) => {
    if (exiting()) {
      key.preventDefault();
      return;
    }
    if (animationVisible()) {
      dismissAnimation();
    }
    const commandArrowSelection =
      surface()._tag === "editor" &&
      key.super === true &&
      key.shift &&
      selectWithCommandArrow(key.name);
    if (commandArrowSelection) {
      key.preventDefault();
      key.stopPropagation();
      return;
    }
    commandSelectionAnchor = undefined;
    const selectedText = surface()._tag === "editor" ? (textarea?.getSelectedText() ?? "") : "";
    const copyWithCommand = key.super === true && key.name === "c";
    const copyWithControl = key.ctrl && key.name === "c" && selectedText.length > 0;
    if (copyWithCommand || copyWithControl) {
      key.preventDefault();
      key.stopPropagation();
      if (selectedText.length === 0) {
        setMessage("Select text to copy");
      } else if (!props.copyToClipboard(selectedText)) {
        setMessage("Couldn’t access the system clipboard");
      } else {
        setMessage(undefined);
      }
      return;
    }
    if (key.ctrl && key.name === "c") {
      key.preventDefault();
      key.stopPropagation();
      requestExit();
      return;
    }
    if (key.ctrl && key.name === "n") {
      key.preventDefault();
      key.stopPropagation();
      enqueue(startNewNote);
      return;
    }
    if (key.ctrl && key.name === "t") {
      key.preventDefault();
      key.stopPropagation();
      if (surface()._tag === "notes") {
        returnToEditor();
      } else {
        showNotes();
      }
      return;
    }
    if (key.ctrl && key.name === "p") {
      key.preventDefault();
      key.stopPropagation();
      if (surface()._tag === "preview") {
        returnToEditor();
      } else {
        showPreview();
      }
      return;
    }

    const activeSurface = surface();
    if (key.name === "escape" && activeSurface._tag !== "editor") {
      key.preventDefault();
      key.stopPropagation();
      if (activeSurface._tag === "confirm-delete") {
        setSurface({ _tag: "notes" });
      } else {
        returnToEditor();
      }
      return;
    }
    if (activeSurface._tag === "notes") {
      handleTreeKey(key.name);
      key.preventDefault();
      key.stopPropagation();
      return;
    }
    if (activeSurface._tag === "confirm-delete") {
      key.preventDefault();
      key.stopPropagation();
      if (key.name === "y") {
        deleteConfirmed(activeSurface.noteId);
      } else if (key.name === "n") {
        setSurface({ _tag: "notes" });
      }
    }
  });

  function enqueue(action: () => void | Promise<void>): void {
    actionQueue = actionQueue.then(action).catch((cause: unknown) => {
      setMessage(cause instanceof Error ? cause.message : "Unexpected application failure");
      setExiting(false);
    });
  }

  function selectWithCommandArrow(keyName: string): boolean {
    if (textarea === undefined) {
      return false;
    }
    const cursor = textarea.cursorOffset;
    const selection = textarea.getSelection();
    const anchor =
      commandSelectionAnchor ??
      (selection === null ? cursor : cursor === selection.start ? selection.end : selection.start);
    switch (keyName) {
      case "left":
        textarea.gotoVisualLineHome();
        break;
      case "right":
        textarea.gotoVisualLineEnd();
        break;
      case "up":
        textarea.gotoBufferHome();
        break;
      case "down":
        textarea.gotoBufferEnd();
        break;
      default:
        return false;
    }
    const target = textarea.cursorOffset;
    textarea.setSelection(Math.min(anchor, target), Math.max(anchor, target));
    commandSelectionAnchor = anchor;
    return true;
  }

  function dismissAnimation(): void {
    setAnimationVisible(false);
  }

  function refreshNotes(): void {
    const result = props.store.listNotes();
    if (result._tag === "err") {
      setMessage(result.error.message);
      return;
    }
    setNotes(result.value);
    setSelectedIndex((index) => Math.min(index, Math.max(0, treeRows().length - 1)));
  }

  function showNotes(): void {
    dismissAnimation();
    textarea?.blur();
    refreshNotes();
    setSurface({ _tag: "notes" });
  }

  function showPreview(): void {
    dismissAnimation();
    setPreviewBody(textarea?.plainText ?? autosave.getBody());
    textarea?.blur();
    setSurface({ _tag: "preview" });
  }

  function returnToEditor(): void {
    setSurface({ _tag: "editor" });
    queueMicrotask(() => textarea?.focus());
  }

  async function startNewNote(): Promise<void> {
    const flushed = await autosave.flush();
    if (flushed._tag === "err") {
      setMessage(flushed.error.message);
      return;
    }
    replaceCurrentNote(createBlankNote(props.currentDirectory, Date.now()));
  }

  async function openNote(note: Note): Promise<void> {
    const flushed = await autosave.flush();
    if (flushed._tag === "err") {
      setMessage(flushed.error.message);
      return;
    }
    const openedAt = Date.now();
    const marked = props.store.markOpened(note.id, openedAt);
    if (marked._tag === "err") {
      setMessage(marked.error.message);
      return;
    }
    replaceCurrentNote({ ...note, lastOpenedAtMs: openedAt });
  }

  function replaceCurrentNote(note: Note): void {
    autosave = makeAutosave(note);
    setCurrentNote(note);
    setSaveState({ _tag: "clean", revision: 0 });
    textarea?.setText(note.body);
    textarea?.gotoBufferEnd();
    exitWithoutSavingArmed = false;
    setMessage(undefined);
    returnToEditor();
  }

  function requestExit(): void {
    if (exitWithoutSavingArmed) {
      setExiting(true);
      enqueue(async () => {
        await autosave.settle();
        props.onExit();
      });
      return;
    }
    setExiting(true);
    enqueue(async () => {
      const flushed = await autosave.flush();
      if (flushed._tag === "err") {
        exitWithoutSavingArmed = true;
        setExiting(false);
        setMessage("Couldn’t save. Ctrl+C again to exit without saving.");
        return;
      }
      props.onExit();
    });
  }

  function handleTreeKey(name: string): void {
    const rows = treeRows();
    if (name === "up") {
      moveSelection(-1, rows.length);
      return;
    }
    if (name === "down") {
      moveSelection(1, rows.length);
      return;
    }
    const row = selectedRow();
    if (row === undefined) {
      return;
    }
    if (name === "left" && row._tag === "directory" && row.expanded) {
      toggleBranch(row.id);
      return;
    }
    if (name === "right" && row._tag === "directory" && !row.expanded) {
      toggleBranch(row.id);
      return;
    }
    if (name === "return") {
      if (row._tag === "directory") {
        toggleBranch(row.id);
      } else {
        const note = selectedNote();
        if (note !== undefined) {
          enqueue(() => openNote(note));
        }
      }
      return;
    }
    if (row._tag === "note" && row.orphan && name === "m") {
      moveSelectedHere(row.noteId);
      return;
    }
    if (row._tag === "note" && row.orphan && name === "d") {
      setSurface({ _tag: "confirm-delete", noteId: row.noteId });
    }
  }

  function moveSelection(delta: number, rowCount: number): void {
    if (rowCount === 0) {
      return;
    }
    const next = Math.max(0, Math.min(rowCount - 1, selectedIndex() + delta));
    setSelectedIndex(next);
    treeScroll?.scrollTo(Math.max(0, next - 3));
  }

  function toggleBranch(id: string): void {
    const next = new Set(collapsed());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setCollapsed(next);
  }

  function moveSelectedHere(noteId: NoteId): void {
    const result = props.store.moveNote(noteId, props.currentDirectory, Date.now());
    if (result._tag === "err") {
      setMessage(result.error.message);
      return;
    }
    setMessage("Moved to the current directory");
    refreshNotes();
  }

  function deleteConfirmed(noteId: NoteId): void {
    const result = props.store.deleteNote(noteId);
    if (result._tag === "err") {
      setMessage(result.error.message);
      setSurface({ _tag: "notes" });
      return;
    }
    setMessage("Note deleted");
    refreshNotes();
    setSurface({ _tag: "notes" });
  }

  function saveLabel(): string {
    switch (saveState()._tag) {
      case "clean":
        return "Saved";
      case "pending":
      case "saving":
        return "Saving…";
      case "failed":
        return "Save failed";
    }
  }

  function footerHelp(): string {
    const activeSurface = surface();
    if (activeSurface._tag === "notes") {
      const row = selectedRow();
      return row?._tag === "note" && row.orphan
        ? "↑↓ Select  Enter Open  M Move here  D Delete  Esc Close"
        : "↑↓ Select  ←→ Fold  Enter Open  Esc Close";
    }
    if (activeSurface._tag === "confirm-delete") {
      return "Y Delete permanently  N Cancel";
    }
    if (activeSurface._tag === "preview") {
      return "Ctrl+P Source  Esc Source";
    }
    return "Ctrl+N New  Ctrl+T Notes  Ctrl+P Preview  Ctrl+C Exit";
  }

  return (
    <box width="100%" height="100%" flexDirection="column" backgroundColor={theme.background}>
      <box
        height={1}
        flexDirection="row"
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={theme.panel}
      >
        <text fg={theme.accentStrong} wrapMode="none">
          <strong>TUINotes</strong>
        </text>
        <text fg={theme.faint}> · </text>
        <text fg={theme.muted} wrapMode="none" flexShrink={1}>
          {currentNote().directory.path}
        </text>
        <text fg={theme.faint}> · </text>
        <text fg={theme.text} wrapMode="none" flexShrink={1}>
          {currentNote().title}
        </text>
      </box>

      <box flexGrow={1} position="relative" minHeight={1}>
        <textarea
          id="note-editor"
          ref={(value: TextareaRenderable) => {
            textarea = value;
            if (props.initialSurface === "editor") {
              value.focus();
            }
          }}
          visible={surface()._tag === "editor"}
          position="absolute"
          width="100%"
          height="100%"
          initialValue={props.initialNote.body}
          placeholder="Start typing…"
          wrapMode="word"
          textColor={theme.text}
          focusedTextColor={theme.text}
          placeholderColor={theme.faint}
          backgroundColor={theme.background}
          focusedBackgroundColor={theme.background}
          selectionBg={theme.selection}
          selectionFg={theme.text}
          cursorColor={theme.accent}
          onContentChange={() => {
            if (textarea !== undefined) {
              autosave.change(textarea.plainText);
            }
          }}
          onMouseDown={() => {
            commandSelectionAnchor = undefined;
            dismissAnimation();
          }}
        />

        <Show when={surface()._tag === "preview"}>
          <box
            position="absolute"
            zIndex={5}
            width="100%"
            height="100%"
            backgroundColor={theme.background}
          >
            <scrollbox
              flexGrow={1}
              paddingLeft={1}
              paddingRight={1}
              focused
              scrollY
              scrollX={false}
              backgroundColor={theme.background}
            >
              <markdown
                id="tuinotes-preview"
                width="100%"
                content={previewBody()}
                syntaxStyle={markdownSyntaxStyle}
                fg={theme.text}
                bg={theme.background}
                conceal
                internalBlockMode="top-level"
                flexShrink={0}
              />
            </scrollbox>
          </box>
        </Show>

        <Show when={surface()._tag === "notes" || surface()._tag === "confirm-delete"}>
          <box
            position="absolute"
            zIndex={5}
            width="100%"
            height="100%"
            flexDirection="column"
            backgroundColor={theme.background}
          >
            <box height={1} paddingLeft={1} backgroundColor={theme.panelRaised}>
              <text fg={theme.text}>
                <strong>All notes</strong>
              </text>
            </box>
            <scrollbox
              ref={(value: ScrollBoxRenderable) => {
                treeScroll = value;
              }}
              flexGrow={1}
              focused={surface()._tag === "notes"}
              backgroundColor={theme.background}
              viewportCulling
            >
              <Show when={treeRows().length === 0}>
                <text fg={theme.muted}> No saved notes yet.</text>
              </Show>
              <For each={treeRows()}>
                {(row, index) => (
                  <box
                    height={1}
                    paddingLeft={1}
                    backgroundColor={
                      selectedIndex() === index() ? theme.selection : theme.background
                    }
                    onMouseDown={() => setSelectedIndex(index())}
                  >
                    <text
                      fg={
                        selectedIndex() === index()
                          ? theme.accentStrong
                          : row._tag === "directory"
                            ? theme.muted
                            : theme.text
                      }
                      wrapMode="none"
                    >
                      {"  ".repeat(row.depth)}
                      {row._tag === "directory" ? (row.expanded ? "▾ " : "▸ ") : "• "}
                      {row.label}
                    </text>
                  </box>
                )}
              </For>
            </scrollbox>
          </box>
        </Show>

        <Show when={surface()._tag === "confirm-delete"}>
          <box
            position="absolute"
            left="15%"
            top="35%"
            width="70%"
            height={5}
            zIndex={30}
            border
            borderStyle="single"
            borderColor={theme.danger}
            backgroundColor={theme.panelRaised}
            padding={1}
          >
            <text fg={theme.text}>Delete this note permanently?</text>
            <text fg={theme.muted}>Press Y to delete or N to cancel.</text>
          </box>
        </Show>

        <Show when={animationVisible() && surface()._tag === "editor"}>
          <LaunchAnimation
            onComplete={() => setAnimationVisible(false)}
            onMouseDismiss={dismissAnimation}
          />
        </Show>
      </box>

      <box
        height={1}
        flexDirection="row"
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={theme.panel}
      >
        <text
          width={SAVE_STATUS_WIDTH}
          flexShrink={0}
          fg={
            saveState()._tag === "failed"
              ? theme.danger
              : saveState()._tag === "clean"
                ? theme.success
                : theme.warning
          }
        >
          {saveLabel()}
        </text>
        <text fg={theme.faint}> </text>
        <text
          fg={message() === undefined ? theme.muted : theme.warning}
          wrapMode="none"
          flexShrink={1}
        >
          {message() ?? footerHelp()}
        </text>
      </box>
    </box>
  );
}
