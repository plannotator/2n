import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { isEditBufferRenderable } from "@opentui/core";
import { testRender } from "@opentui/solid";

import { App } from "./app.tsx";
import { createBlankNote, parseDirectoryKey, type DirectoryAssociation } from "./notes.ts";
import { NoteStore } from "./note-store.ts";

const temporaryDirectories: Array<string> = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("TUINotes UI", () => {
  test("starts focused and previews the latest editor contents", async () => {
    const setup = await createApp();
    try {
      await setup.renderer.renderOnce();
      expect(setup.renderer.captureCharFrame()).toContain("TUINotes");
      expect(setup.renderer.captureCharFrame()).toContain("Start typing");

      await setup.renderer.mockInput.typeText("# Latest composed character");
      setup.renderer.mockInput.pressKey("p", { ctrl: true });
      await setup.renderer.flush();
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await Bun.sleep(20);
        await setup.renderer.renderOnce();
        if (setup.renderer.captureCharFrame().includes("Latest composed character")) {
          break;
        }
      }
      expect(setup.renderer.captureCharFrame()).toContain("Latest composed character");

      setup.renderer.mockInput.pressEscape();
      setup.renderer.mockInput.pressKey("t", { ctrl: true });
      await setup.renderer.flush();
      expect(setup.renderer.captureCharFrame()).toContain("All notes");
    } finally {
      setup.renderer.renderer.destroy();
      setup.store.close();
    }
  });

  test("Ctrl+C flushes the live revision before requesting exit", async () => {
    const setup = await createApp();
    try {
      await setup.renderer.mockInput.typeText("Unicode 漢字\ncomplete");
      setup.renderer.mockInput.pressKey("c", { ctrl: true });
      await setup.renderer.waitFor(() => setup.exited());

      const listed = setup.store.listNotes();
      expect(listed._tag).toBe("ok");
      expect(listed._tag === "ok" && listed.value[0]?.body).toBe("Unicode 漢字\ncomplete");
    } finally {
      setup.renderer.renderer.destroy();
      setup.store.close();
    }
  });

  test("Cmd+C copies selected text without changing the note or exiting", async () => {
    const setup = await createApp();
    try {
      await setup.renderer.mockInput.typeText("copy this, not that");
      const editor = setup.renderer.renderer.root.findDescendantById("note-editor");
      expect(isEditBufferRenderable(editor)).toBe(true);
      if (!isEditBufferRenderable(editor)) {
        return;
      }
      editor.setSelection(0, 9);
      await setup.renderer.flush();
      expect(editor.getSelectedText()).toBe("copy this");

      setup.renderer.mockInput.pressKey("c", { super: true });
      await setup.renderer.flush();

      expect(setup.copiedText()).toEqual(["copy this"]);
      expect(editor.getSelectedText()).toBe("copy this");
      expect(editor.plainText).toBe("copy this, not that");
      expect(setup.exited()).toBe(false);
    } finally {
      setup.renderer.renderer.destroy();
      setup.store.close();
    }
  });

  test("leaves mouse selection to the terminal outside the notes tree", async () => {
    const setup = await createApp();
    try {
      await setup.renderer.flush();
      expect(setup.mouseInputStates()).toEqual([false]);

      setup.renderer.mockInput.pressKey("t", { ctrl: true });
      await setup.renderer.flush();
      expect(setup.mouseInputStates()).toEqual([false, true]);

      setup.renderer.mockInput.pressEscape();
      await setup.renderer.flush();
      expect(setup.mouseInputStates()).toEqual([false, true, false]);
    } finally {
      setup.renderer.renderer.destroy();
      setup.store.close();
    }
  });

  test("Cmd+Shift+Left selects to the start of a line for copying", async () => {
    const setup = await createApp();
    try {
      await setup.renderer.mockInput.typeText("first line\nsecond line");
      const editor = setup.renderer.renderer.root.findDescendantById("note-editor");
      expect(isEditBufferRenderable(editor)).toBe(true);
      if (!isEditBufferRenderable(editor)) {
        return;
      }
      expect(editor.logicalCursor).toMatchObject({ row: 1, col: 11 });
      setup.renderer.mockInput.pressArrow("left", { super: true, shift: true });
      expect(editor.getSelectedText()).toBe("second line");
      await setup.renderer.flush();
      expect(editor.getSelectedText()).toBe("second line");
      setup.renderer.mockInput.pressKey("c", { ctrl: true });
      await setup.renderer.flush();

      expect(setup.copiedText()).toEqual(["second line"]);
      expect(setup.exited()).toBe(false);
    } finally {
      setup.renderer.renderer.destroy();
      setup.store.close();
    }
  });

  test("keeps footer shortcuts fixed while save status changes", async () => {
    const setup = await createApp();
    try {
      await setup.renderer.renderOnce();
      const savedFooter = footerLine(setup.renderer.captureCharFrame());
      expect(savedFooter).toContain("Saved");
      const shortcutColumn = savedFooter.indexOf("Ctrl+N");

      await setup.renderer.mockInput.typeText("x");
      await setup.renderer.flush();
      const savingFooter = footerLine(setup.renderer.captureCharFrame());
      expect(savingFooter).toContain("Saving…");
      expect(savingFooter.indexOf("Ctrl+N")).toBe(shortcutColumn);
    } finally {
      setup.renderer.renderer.destroy();
      setup.store.close();
    }
  });
});

async function createApp() {
  const directoryPath = mkdtempSync(join(tmpdir(), "tuinotes-ui-"));
  temporaryDirectories.push(directoryPath);
  const storeResult = NoteStore.openAt(":memory:");
  if (storeResult._tag === "err") {
    throw storeResult.error;
  }
  const store = storeResult.value;
  const directory = association(directoryPath);
  const note = createBlankNote(directory, 1);
  let didExit = false;
  const clipboard: Array<string> = [];
  const mouseInputStates: Array<boolean> = [];
  const renderer = await testRender(
    () => (
      <App
        store={store}
        currentDirectory={directory}
        initialNote={note}
        initialSurface="editor"
        launchAnimationEligible={false}
        copyToClipboard={(text) => {
          clipboard.push(text);
          return true;
        }}
        setMouseInputEnabled={(enabled) => {
          mouseInputStates.push(enabled);
        }}
        onExit={() => {
          didExit = true;
        }}
      />
    ),
    { width: 80, height: 20, kittyKeyboard: true },
  );
  return {
    renderer,
    store,
    exited: () => didExit,
    copiedText: () => clipboard,
    mouseInputStates: () => mouseInputStates,
  };
}

function association(path: string): DirectoryAssociation {
  const key = parseDirectoryKey(path);
  if (key._tag === "err") {
    throw key.error;
  }
  return { key: key.value, path };
}

function footerLine(frame: string): string {
  return frame.split("\n").find((line) => line.includes("Ctrl+N")) ?? "";
}
