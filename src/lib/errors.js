export class CortexError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = 'CortexError';
    this.code = code;
    this.statusCode = options.statusCode || 500;
  }
}
