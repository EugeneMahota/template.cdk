/** Minimal replacement for http-errors: throw BadRequest('...') → 400 response */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const BadRequest = (message: string): HttpError => new HttpError(400, message);
