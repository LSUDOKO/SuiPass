// SuiPass: Typed refusals for AI agents (unchanged from EVM version)

export class RefusalError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "RefusalError";
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      refusal: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export class EngineError extends Error {
  readonly stage: string;

  constructor(stage: string, message: string, cause?: unknown) {
    super(message);
    this.name = "EngineError";
    this.stage = stage;
    this.cause = cause;
  }
}
