#!/usr/bin/env bun

import { createCliRenderer } from "@opentui/core";
import { render } from "@opentui/solid";

import { App } from "./app.tsx";
import { resolveDataRoot } from "./app-data.ts";
import { parseArguments, USAGE } from "./cli.ts";
import { createBlankNote, resolveDirectoryAssociation } from "./notes.ts";
import { NoteStore } from "./note-store.ts";

const command = parseArguments(process.argv.slice(2));
if (command._tag === "err") {
  console.error(USAGE);
  process.exit(2);
}

const dataRoot = resolveDataRoot(process.platform, {
  HOME: process.env.HOME,
  XDG_DATA_HOME: process.env.XDG_DATA_HOME,
  LOCALAPPDATA: process.env.LOCALAPPDATA,
  TUINOTES_DATA_HOME: process.env.TUINOTES_DATA_HOME,
});
if (dataRoot._tag === "err") {
  console.error(dataRoot.error.message);
  process.exit(1);
}

const openedStore = NoteStore.open(dataRoot.value);
if (openedStore._tag === "err") {
  console.error(openedStore.error.message);
  process.exit(1);
}
const store = openedStore.value;
let storeClosed = false;
const closeStore = (): void => {
  if (!storeClosed) {
    storeClosed = true;
    store.close();
  }
};

if (command.value._tag === "set-animation") {
  const result = store.setAnimationEnabled(command.value.enabled);
  closeStore();
  if (result._tag === "err") {
    console.error(result.error.message);
    process.exit(1);
  }
  console.log(`TUINotes launch animation ${command.value.enabled ? "enabled" : "disabled"}.`);
  process.exit(0);
}
const openCommand = command.value;

const directory = await resolveDirectoryAssociation(process.cwd());
if (directory._tag === "err") {
  closeStore();
  console.error(directory.error.message);
  process.exit(1);
}

const recent = store.loadRecent(directory.value.key);
if (recent._tag === "err") {
  closeStore();
  console.error(recent.error.message);
  process.exit(1);
}
const nowMs = Date.now();
let initialNote = recent.value ?? createBlankNote(directory.value, nowMs);
if (recent.value !== undefined) {
  const marked = store.markOpened(recent.value.id, nowMs);
  if (marked._tag === "err") {
    closeStore();
    console.error(marked.error.message);
    process.exit(1);
  }
  initialNote = { ...recent.value, lastOpenedAtMs: nowMs };
}

const animationSetting = store.getAnimationEnabled();
if (animationSetting._tag === "err") {
  closeStore();
  console.error(animationSetting.error.message);
  process.exit(1);
}
const launchAnimationEligible =
  animationSetting.value &&
  openCommand.animation !== "disabled" &&
  process.env.TUINOTES_REDUCE_MOTION !== "1" &&
  process.stdin.isTTY === true &&
  process.stdout.isTTY === true;

try {
  let requestControlledExit: (() => void) | undefined;
  let exitSignalReceived = false;
  const handleExitSignal = (): void => {
    exitSignalReceived = true;
    requestControlledExit?.();
  };
  const removeSignalHandlers = (): void => {
    process.off("SIGINT", handleExitSignal);
    process.off("SIGTERM", handleExitSignal);
    process.off("SIGHUP", handleExitSignal);
  };
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    exitSignals: [],
    targetFps: 30,
    onDestroy: () => {
      removeSignalHandlers();
      closeStore();
    },
  });
  process.on("SIGINT", handleExitSignal);
  process.on("SIGTERM", handleExitSignal);
  process.on("SIGHUP", handleExitSignal);
  const copyToClipboard = (text: string): boolean => {
    const command =
      process.platform === "darwin"
        ? ["pbcopy"]
        : process.platform === "win32"
          ? ["clip.exe"]
          : Bun.which("wl-copy") !== null
            ? ["wl-copy"]
            : Bun.which("xclip") !== null
              ? ["xclip", "-selection", "clipboard"]
              : undefined;
    if (command !== undefined) {
      try {
        const copied = Bun.spawnSync(command, {
          stdin: new Blob([text]),
          stdout: "ignore",
          stderr: "ignore",
        });
        if (copied.success) {
          return true;
        }
      } catch {
        // Fall through to the terminal clipboard protocol.
      }
    }
    return renderer.copyToClipboardOSC52(text);
  };
  await render(
    () => (
      <App
        store={store}
        currentDirectory={directory.value}
        initialNote={initialNote}
        initialSurface={openCommand.initialSurface}
        launchAnimationEligible={launchAnimationEligible}
        copyToClipboard={copyToClipboard}
        onExit={() => renderer.destroy()}
        registerExitHandler={(handler) => {
          requestControlledExit = handler;
          if (exitSignalReceived) {
            handler();
          }
        }}
      />
    ),
    renderer,
  );
} catch (cause: unknown) {
  closeStore();
  console.error(cause instanceof Error ? cause.message : "TUINotes could not start");
  process.exit(1);
}
