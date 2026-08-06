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

export class VaultError extends Error {
  readonly code: VaultErrorCode

  constructor(code: VaultErrorCode, message: string) {
    super(message)
    this.name = 'VaultError'
    this.code = code
  }
}
