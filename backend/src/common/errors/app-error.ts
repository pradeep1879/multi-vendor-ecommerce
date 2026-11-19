export type ErrorDetail = { field: string; issue: string };

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: ErrorDetail[];

  constructor(statusCode: number, code: string, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(details: ErrorDetail[]) {
    super(400, 'VALIDATION_ERROR', 'Request validation failed.', details);
    this.name = 'ValidationError';
  }
}
