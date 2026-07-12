import { describe, expect, test } from "bun:test";

import { resolveDataRoot } from "./app-data.ts";

describe("application data root", () => {
  test("uses the macOS Application Support directory", () => {
    const result = resolveDataRoot("darwin", { HOME: "/Users/me" });
    expect(result._tag === "ok" && result.value).toBe("/Users/me/Library/Application Support/2n");
  });

  test("prefers XDG_DATA_HOME on Linux and otherwise uses the standard fallback", () => {
    const xdg = resolveDataRoot("linux", { HOME: "/home/me", XDG_DATA_HOME: "/data" });
    const fallback = resolveDataRoot("linux", { HOME: "/home/me" });
    expect(xdg._tag === "ok" && xdg.value).toBe("/data/2n");
    expect(fallback._tag === "ok" && fallback.value).toBe("/home/me/.local/share/2n");
  });

  test("uses LOCALAPPDATA on Windows", () => {
    const result = resolveDataRoot("win32", { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" });
    expect(result._tag).toBe("ok");
    expect(result._tag === "ok" && result.value.endsWith("2n")).toBe(true);
  });

  test("allows tests and portable runs to isolate the data root", () => {
    const result = resolveDataRoot("linux", { TUINOTES_DATA_HOME: "/tmp/tuinotes-test" });
    expect(result).toEqual({ _tag: "ok", value: "/tmp/tuinotes-test" });
  });
});
