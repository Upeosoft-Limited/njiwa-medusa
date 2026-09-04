/**
 * Anything Njiwa refused, or could not be asked.
 *
 * `code` is the stable, machine readable reason and is the thing to branch
 * on. The wording of the message can change; the code does not. `docs` is the
 * page explaining that exact code.
 */
export class NjiwaError extends Error {
  readonly code: string
  readonly status: number
  readonly docs?: string

  constructor(message: string, code = "unknown", status = 0, docs?: string) {
    super(message)
    this.name = "NjiwaError"
    this.code = code
    this.status = status
    this.docs = docs
  }
}
