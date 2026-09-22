// Private recoverable payload; never include provider content in public error messages.
export class IncompleteStructuredOutputError extends Error {
  constructor(readonly partialOutput: string, readonly reason: string) {
    super(`STRUCTURED_OUTPUT_INCOMPLETE: ${reason}`);
    this.name = "IncompleteStructuredOutputError";
  }
}
