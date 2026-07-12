import { Database, type SQLQueryBindings } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  parseDirectoryKey,
  parseNoteId,
  type DirectoryAssociation,
  type Note,
  type NoteId,
} from "./notes.ts";
import { err, ok, safeCause, type Result } from "./result.ts";

/** A safe persistence failure suitable for the UI. */
export class StorageFailure extends Error {
  readonly _tag = "StorageFailure" as const;

  constructor(
    readonly operation: string,
    override readonly cause: unknown,
    message = `Storage failed during ${operation}`,
  ) {
    super(message);
  }
}

/** Data required to atomically create or update a note. */
export interface SaveNoteInput {
  readonly note: Note;
}

/** SQLite-backed source of truth for TUINotes. */
export class NoteStore {
  private constructor(
    private readonly database: Database,
    readonly databasePath: string,
  ) {}

  /** Open the production database and ensure its schema exists. */
  static open(dataRoot: string): Result<NoteStore, StorageFailure> {
    const databasePath = join(dataRoot, "notes.sqlite3");
    try {
      mkdirSync(dirname(databasePath), { recursive: true });
      const database = new Database(databasePath, { create: true, strict: true });
      const store = new NoteStore(database, databasePath);
      store.initialize();
      return ok(store);
    } catch (cause: unknown) {
      return err(
        new StorageFailure("open", cause, `Could not open ${databasePath}: ${safeCause(cause)}`),
      );
    }
  }

  /** Open a temporary or in-memory database for tests. */
  static openAt(databasePath: string): Result<NoteStore, StorageFailure> {
    try {
      if (databasePath !== ":memory:") {
        mkdirSync(dirname(databasePath), { recursive: true });
      }
      const database = new Database(databasePath, { create: true, strict: true });
      const store = new NoteStore(database, databasePath);
      store.initialize();
      return ok(store);
    } catch (cause: unknown) {
      return err(
        new StorageFailure("open", cause, `Could not open test database: ${safeCause(cause)}`),
      );
    }
  }

  /** Close the underlying database. */
  close(): void {
    this.database.close();
  }

  /** Load the note most recently opened for a directory. */
  loadRecent(directoryKey: string): Result<Note | undefined, StorageFailure> {
    try {
      const row: unknown = this.database
        .query(
          "SELECT * FROM notes WHERE directory_key = ? ORDER BY last_opened_at_ms DESC LIMIT 1",
        )
        .get(directoryKey);
      if (row === null) {
        return ok(undefined);
      }
      return parseNoteRow(row);
    } catch (cause: unknown) {
      return err(new StorageFailure("load recent note", cause));
    }
  }

  /** Load every note in global display order. */
  listNotes(): Result<ReadonlyArray<Note>, StorageFailure> {
    try {
      const rows: ReadonlyArray<unknown> = this.database
        .query("SELECT * FROM notes ORDER BY updated_at_ms DESC")
        .all();
      const notes: Array<Note> = [];
      for (const row of rows) {
        const parsed = parseNoteRow(row);
        if (parsed._tag === "err") {
          return parsed;
        }
        notes.push(parsed.value);
      }
      return ok(notes);
    } catch (cause: unknown) {
      return err(new StorageFailure("list notes", cause));
    }
  }

  /** Create or update a complete note in one transaction. */
  saveNote(input: SaveNoteInput): Result<Note, StorageFailure> {
    const note = input.note;
    try {
      const save = this.database.transaction(() => {
        this.database
          .query(
            `INSERT INTO notes (
              id, directory_key, directory_path, body, title,
              created_at_ms, updated_at_ms, last_opened_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              directory_key = excluded.directory_key,
              directory_path = excluded.directory_path,
              body = excluded.body,
              title = excluded.title,
              updated_at_ms = excluded.updated_at_ms,
              last_opened_at_ms = excluded.last_opened_at_ms`,
          )
          .run(
            note.id,
            note.directory.key,
            note.directory.path,
            note.body,
            note.title,
            note.createdAtMs,
            note.updatedAtMs,
            note.lastOpenedAtMs,
          );
      });
      save.immediate();
      return ok(note);
    } catch (cause: unknown) {
      return err(new StorageFailure("save note", cause));
    }
  }

  /** Record that an existing note was opened. */
  markOpened(noteId: NoteId, nowMs: number): Result<void, StorageFailure> {
    return this.run(
      "mark note opened",
      "UPDATE notes SET last_opened_at_ms = ? WHERE id = ?",
      nowMs,
      noteId,
    );
  }

  /** Reassociate a note with a different directory. */
  moveNote(
    noteId: NoteId,
    directory: DirectoryAssociation,
    nowMs: number,
  ): Result<void, StorageFailure> {
    return this.run(
      "move note",
      "UPDATE notes SET directory_key = ?, directory_path = ?, updated_at_ms = ? WHERE id = ?",
      directory.key,
      directory.path,
      nowMs,
      noteId,
    );
  }

  /** Permanently delete one note. */
  deleteNote(noteId: NoteId): Result<void, StorageFailure> {
    return this.run("delete note", "DELETE FROM notes WHERE id = ?", noteId);
  }

  /** Read the persisted launch-animation preference. */
  getAnimationEnabled(): Result<boolean, StorageFailure> {
    try {
      const row: unknown = this.database
        .query("SELECT launch_animation_enabled FROM app_settings WHERE singleton_id = 1")
        .get();
      if (
        !isRecord(row) ||
        (row.launch_animation_enabled !== 0 && row.launch_animation_enabled !== 1)
      ) {
        return err(
          new StorageFailure(
            "read animation setting",
            undefined,
            "Stored animation setting is invalid",
          ),
        );
      }
      return ok(row.launch_animation_enabled === 1);
    } catch (cause: unknown) {
      return err(new StorageFailure("read animation setting", cause));
    }
  }

  /** Persist the launch-animation preference. */
  setAnimationEnabled(enabled: boolean): Result<void, StorageFailure> {
    return this.run(
      "save animation setting",
      "UPDATE app_settings SET launch_animation_enabled = ? WHERE singleton_id = 1",
      enabled ? 1 : 0,
    );
  }

  private initialize(): void {
    this.database.exec("PRAGMA journal_mode = WAL");
    this.database.exec("PRAGMA synchronous = NORMAL");
    const versionRow: unknown = this.database.query("PRAGMA user_version").get();
    if (!isRecord(versionRow) || !isTimestamp(versionRow.user_version)) {
      throw new Error("Could not read the database schema version");
    }
    if (versionRow.user_version > 1) {
      throw new Error("This database was created by a newer TUINotes version");
    }
    if (versionRow.user_version === 1) {
      return;
    }
    const migrate = this.database.transaction(() =>
      this.database.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        directory_key TEXT NOT NULL,
        directory_path TEXT NOT NULL,
        body TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
        updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
        last_opened_at_ms INTEGER NOT NULL CHECK (last_opened_at_ms >= created_at_ms)
      );
      CREATE INDEX IF NOT EXISTS notes_by_directory
        ON notes (directory_key, updated_at_ms DESC);
      CREATE TABLE IF NOT EXISTS app_settings (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        launch_animation_enabled INTEGER NOT NULL CHECK (launch_animation_enabled IN (0, 1))
      );
      INSERT OR IGNORE INTO app_settings (singleton_id, launch_animation_enabled) VALUES (1, 1);
      PRAGMA user_version = 1;
    `),
    );
    migrate.immediate();
  }

  private run(
    operation: string,
    sql: string,
    ...bindings: SQLQueryBindings[]
  ): Result<void, StorageFailure> {
    try {
      this.database.query(sql).run(...bindings);
      return ok(undefined);
    } catch (cause: unknown) {
      return err(new StorageFailure(operation, cause));
    }
  }
}

function parseNoteRow(input: unknown): Result<Note, StorageFailure> {
  if (!isRecord(input)) {
    return invalidStoredNote("unknown");
  }
  const id = parseNoteId(input.id);
  if (id._tag === "err") {
    return invalidStoredNote(typeof input.id === "string" ? input.id : "unknown");
  }
  const directoryKey = parseDirectoryKey(input.directory_key);
  if (
    directoryKey._tag === "err" ||
    typeof input.directory_path !== "string" ||
    typeof input.body !== "string" ||
    typeof input.title !== "string" ||
    !isTimestamp(input.created_at_ms) ||
    !isTimestamp(input.updated_at_ms) ||
    !isTimestamp(input.last_opened_at_ms) ||
    input.updated_at_ms < input.created_at_ms ||
    input.last_opened_at_ms < input.created_at_ms
  ) {
    return invalidStoredNote(id.value);
  }

  return ok({
    id: id.value,
    directory: { key: directoryKey.value, path: input.directory_path },
    body: input.body,
    title: input.title,
    createdAtMs: input.created_at_ms,
    updatedAtMs: input.updated_at_ms,
    lastOpenedAtMs: input.last_opened_at_ms,
  });
}

function invalidStoredNote(noteId: string): Result<never, StorageFailure> {
  return err(new StorageFailure("parse note", undefined, `Stored note ${noteId} is invalid`));
}

function isTimestamp(input: unknown): input is number {
  return typeof input === "number" && Number.isSafeInteger(input) && input >= 0;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
