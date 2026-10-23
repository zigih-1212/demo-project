export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, "not_found", resource + " not found");
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, "validation_error", message, details);
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter: number) {
    super(429, "rate_limited", "Too many requests", { retryAfter });
  }
}