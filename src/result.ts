/** A successful or expected failed operation. */
export type Result<T, E> =
  | { readonly _tag: "ok"; readonly value: T }
  | { readonly _tag: "err"; readonly error: E };

/** Construct a successful result. */
export function ok<T>(value: T): Result<T, never> {
  return { _tag: "ok", value };
}

/** Construct a failed result. */
export function err<E>(error: E): Result<never, E> {
  return { _tag: "err", error };
}

/** Return a safe, short message for an unknown thrown value. */
export function safeCause(cause: unknown): string {
  return cause instanceof Error && cause.message.length > 0 ? cause.message : "Unknown failure";
}
