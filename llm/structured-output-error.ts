// Private recoverable payload; never include provider content in public error messages.
export class IncompleteStructuredOutputError extends Error {
  constructor(readonly partialOutput: string, readonly reason: string) {
    super(`STRUCTURED_OUTPUT_INCOMPLETE: ${reason}`);
    this.name = "IncompleteStructuredOutputError";
  }
}

// Only completed, accounted responses may request a bounded JSON-only repair.
export class KnownUsageStructuredParseError extends SyntaxError {
  constructor() { super("STRUCTURED_OUTPUT_PARSE_FAILED_WITH_KNOWN_USAGE"); this.name = "KnownUsageStructuredParseError"; }
}
