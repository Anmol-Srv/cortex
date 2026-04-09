export class AppError extends Error {
  static codes = {
    VALIDATION_ERROR: { message: 'Validation error', statusCode: 400 },
    NOT_FOUND: { message: 'Resource not found', statusCode: 404 },
    BAD_REQUEST: { message: 'Bad request', statusCode: 400 },
    CONFLICT: { message: 'Resource conflict', statusCode: 409 },
    INTERNAL: { message: 'Internal server error', statusCode: 500 },
    SERVICE_UNAVAILABLE: { message: 'Service unavailable', statusCode: 503 },
    LLM_ERROR: { message: 'LLM provider error', statusCode: 502 },
    DB_ERROR: { message: 'Database error', statusCode: 500 },
  };

  constructor({ errorCode, message, data } = {}) {
    const defaults = AppError.codes[errorCode] || AppError.codes.INTERNAL;

    super(message || defaults.message);

    this.name = 'AppError';
    this.statusCode = defaults.statusCode;
    this.errorCode = errorCode || 'INTERNAL';
    this.data = data;
  }
}
