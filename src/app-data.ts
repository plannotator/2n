import { homedir } from "node:os";
import { join } from "node:path";

import { err, ok, type Result } from "./result.ts";

/** Environment values that affect the application-data location. */
export interface DataRootEnvironment {
  readonly HOME?: string | undefined;
  readonly XDG_DATA_HOME?: string | undefined;
  readonly LOCALAPPDATA?: string | undefined;
  readonly TUINOTES_DATA_HOME?: string | undefined;
}

/** Failure to determine a safe application-data location. */
export class DataRootUnavailable extends Error {
  readonly _tag = "DataRootUnavailable" as const;

  constructor(readonly platform: NodeJS.Platform) {
    super(`No application-data directory is available for ${platform}`);
  }
}

/** Resolve TUINotes' platform-specific data directory. */
export function resolveDataRoot(
  platform: NodeJS.Platform,
  environment: DataRootEnvironment,
  fallbackHome: string = homedir(),
): Result<string, DataRootUnavailable> {
  if (environment.TUINOTES_DATA_HOME !== undefined && environment.TUINOTES_DATA_HOME.length > 0) {
    return ok(environment.TUINOTES_DATA_HOME);
  }

  const home = environment.HOME ?? fallbackHome;
  if (platform === "darwin" && home.length > 0) {
    return ok(join(home, "Library", "Application Support", "2n"));
  }
  if (
    platform === "linux" &&
    environment.XDG_DATA_HOME !== undefined &&
    environment.XDG_DATA_HOME.length > 0
  ) {
    return ok(join(environment.XDG_DATA_HOME, "2n"));
  }
  if (platform === "linux" && home.length > 0) {
    return ok(join(home, ".local", "share", "2n"));
  }
  if (
    platform === "win32" &&
    environment.LOCALAPPDATA !== undefined &&
    environment.LOCALAPPDATA.length > 0
  ) {
    return ok(join(environment.LOCALAPPDATA, "2n"));
  }
  return err(new DataRootUnavailable(platform));
}
