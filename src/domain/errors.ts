/**
 * Errors meant to be shown to people. `message` is a short sentence,
 * `hint` an optional next step. Anything that is not a SojaError is a bug
 * and gets a generic message (details only with SOJA_DEBUG=1).
 */
export class SojaError extends Error {
  readonly hint: string | undefined;

  constructor(message: string, options: { hint?: string; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.hint = options.hint;
  }
}

export class NotFoundError extends SojaError {}
export class ValidationError extends SojaError {}
export class ConflictError extends SojaError {}
export class StorageError extends SojaError {}
export class ConfigError extends SojaError {}
