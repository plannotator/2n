import { withSavedBody, type Note } from "./notes.ts";
import { StorageFailure, type NoteStore } from "./note-store.ts";
import { err, ok, safeCause, type Result } from "./result.ts";

/** Visible persistence state for the current editor revision. */
export type SaveState =
  | { readonly _tag: "clean"; readonly revision: number }
  | { readonly _tag: "pending"; readonly revision: number }
  | { readonly _tag: "saving"; readonly revision: number }
  | { readonly _tag: "failed"; readonly revision: number; readonly message: string };

/** Time and scheduling dependencies used by autosave. */
export interface AutosaveRuntime {
  readonly now: () => number;
  readonly setTimer: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  readonly clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
}

/** Autosave lifecycle notifications. */
export interface AutosaveEvents {
  readonly onStateChange: (state: SaveState) => void;
  readonly onSaved: (note: Note) => void;
}

/** Owns debounce timers, revision ordering, writes, and flush behavior for one note. */
export class Autosave {
  private body: string;
  private revision = 0;
  private savedRevision = 0;
  private state: SaveState = { _tag: "clean", revision: 0 };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> | undefined;

  constructor(
    private note: Note,
    private readonly store: Pick<NoteStore, "saveNote">,
    private readonly runtime: AutosaveRuntime,
    private readonly events: AutosaveEvents,
    private readonly debounceMs = 250,
  ) {
    this.body = note.body;
  }

  /** Return the current save state. */
  getState(): SaveState {
    return this.state;
  }

  /** Return the current live body. */
  getBody(): string {
    return this.body;
  }

  /** Record a new editor revision and schedule it for persistence. */
  change(body: string): void {
    if (body === this.body) {
      return;
    }
    this.body = body;
    this.revision += 1;
    this.setState({ _tag: "pending", revision: this.revision });
    this.cancelTimer();
    this.timer = this.runtime.setTimer(() => {
      this.timer = undefined;
      this.ensureSaveStarted();
    }, this.debounceMs);
  }

  /** Persist the newest revision and wait for all required writes. */
  async flush(): Promise<Result<void, StorageFailure>> {
    this.cancelTimer();
    while (this.savedRevision < this.revision) {
      this.ensureSaveStarted();
      const active = this.inFlight;
      if (active !== undefined) {
        await active;
      }
      if (this.state._tag === "failed") {
        return err(new StorageFailure("flush note", undefined, this.state.message));
      }
    }
    return ok(undefined);
  }

  /** Cancel pending debounce work and await any active database write. */
  async settle(): Promise<void> {
    this.cancelTimer();
    if (this.inFlight !== undefined) {
      await this.inFlight;
    }
  }

  private ensureSaveStarted(): void {
    if (this.inFlight !== undefined || this.savedRevision >= this.revision) {
      return;
    }
    const owned = this.saveNewest()
      .catch((cause: unknown) => {
        this.setState({
          _tag: "failed",
          revision: this.revision,
          message: `Unexpected save failure: ${safeCause(cause)}`,
        });
      })
      .finally(() => {
        if (this.inFlight === owned) {
          this.inFlight = undefined;
        }
        if (this.savedRevision < this.revision && this.state._tag !== "failed") {
          this.ensureSaveStarted();
        }
      });
    this.inFlight = owned;
  }

  private async saveNewest(): Promise<void> {
    const savingRevision = this.revision;
    const savingBody = this.body;
    this.setState({ _tag: "saving", revision: savingRevision });
    await Promise.resolve();
    const savedNote = withSavedBody(this.note, savingBody, this.runtime.now());
    const result = this.store.saveNote({ note: savedNote });
    if (result._tag === "err") {
      this.setState({ _tag: "failed", revision: savingRevision, message: result.error.message });
      return;
    }
    this.note = result.value;
    this.savedRevision = savingRevision;
    this.events.onSaved(result.value);
    if (this.revision === savingRevision) {
      this.setState({ _tag: "clean", revision: savingRevision });
    }
  }

  private setState(state: SaveState): void {
    this.state = state;
    this.events.onStateChange(state);
  }

  private cancelTimer(): void {
    if (this.timer === undefined) {
      return;
    }
    this.runtime.clearTimer(this.timer);
    this.timer = undefined;
  }
}

/** Production time and timer implementation. */
export const systemAutosaveRuntime: AutosaveRuntime = {
  now: Date.now,
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (timer) => clearTimeout(timer),
};
