import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  const renderer = await testRender(
    () => (
      <App
        store={store}
        currentDirectory={directory}
        initialNote={note}
        initialSurface="editor"
        launchAnimationEligible={false}
        onExit={() => {
          didExit = true;
        }}
      />
    ),
    { width: 80, height: 20 },
  );
  return { renderer, store, exited: () => didExit };
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
