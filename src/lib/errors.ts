/**
 * The one error type the vault layer throws. It lives at the root of `src/lib/`
 * rather than inside `vault/` because `filesystem/paths.ts` throws it too, and
 * `filesystem/` sits *below* `vault/` in the import graph — putting it in
 * `vault/` would invert that.
 *
 * `code` exists so callers can branch without matching on message text; the
 * message is written for a human and is safe to show in the UI. Never put a
 * repository path, a remote URL or a stack trace in one.
 */
export type VaultErrorCode =
  /** `DEVVAULT_PATH` is unset or empty. */
  | 'VAULT_PATH_UNSET'
  /** `DEVVAULT_PATH` points at something that is not an existing directory. */
  | 'VAULT_PATH_INVALID'
  /** A path derived from user input tried to escape the vault root. */
  | 'PATH_ESCAPE'
  /** `.devvault/config.json` exists but is not valid. */
  | 'CONFIG_INVALID'
  /** A record was asked for by id and the vault does not hold it. */
  | 'ITEM_NOT_FOUND'
  | 'COLLECTION_NOT_FOUND'
  /** A write was refused because the record does not satisfy the schema. */
  | 'ITEM_INVALID'
  /**
   * A create was refused because a record already occupies the file it would
   * write. Only reachable for binary items, whose path comes from `fileName`
   * rather than from an id a suffix could free.
   */
  | 'ITEM_EXISTS'
  /** An asset was requested and no readable file sits at that path. */
  | 'ASSET_NOT_FOUND'
  /**
   * A write was refused because Git has the file in conflict.
   *
   * `coding-standards.md` forbids silently overwriting user changes, and a save
   * landing on a conflicted file would do exactly that — resolving the conflict
   * to whatever the app happened to hold in memory, discarding the other side
   * without anyone choosing.
   */
  | 'PATH_CONFLICTED'
  /** A file could not be handed to the operating system's default application. */
  | 'OPEN_FAILED'

export class VaultError extends Error {
  readonly code: VaultErrorCode

  constructor(code: VaultErrorCode, message: string) {
    super(message)
    this.name = 'VaultError'
    this.code = code
  }
}
