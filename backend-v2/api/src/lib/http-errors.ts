type ExceptionResponse =
  | string
  | { message?: string | string[]; statusCode?: number; [key: string]: unknown };

export class HttpException extends Error {
  constructor(
    private readonly response: ExceptionResponse,
    private readonly status: number,
  ) {
    const msg =
      typeof response === 'string'
        ? response
        : Array.isArray(response.message)
          ? response.message.join(', ')
          : String(response.message);
    super(msg);
    this.name = new.target.name;
  }

  getStatus(): number {
    return this.status;
  }

  getResponse(): ExceptionResponse {
    return this.response;
  }
}

export class BadRequestException extends HttpException {
  constructor(objectOrError?: ExceptionResponse) {
    super(objectOrError ?? 'Bad Request', 400);
  }
}

export class UnauthorizedException extends HttpException {
  constructor(objectOrError?: ExceptionResponse) {
    super(objectOrError ?? 'Unauthorized', 401);
  }
}

export class ForbiddenException extends HttpException {
  constructor(objectOrError?: ExceptionResponse) {
    super(objectOrError ?? 'Forbidden', 403);
  }
}

export class NotFoundException extends HttpException {
  constructor(objectOrError?: ExceptionResponse) {
    super(objectOrError ?? 'Not Found', 404);
  }
}

export class ConflictException extends HttpException {
  constructor(objectOrError?: ExceptionResponse) {
    super(objectOrError ?? 'Conflict', 409);
  }
}

export class ServiceUnavailableException extends HttpException {
  constructor(objectOrError?: ExceptionResponse) {
    super(objectOrError ?? 'Service Unavailable', 503);
  }
}

export class TooManyRequestsException extends HttpException {
  constructor(objectOrError?: ExceptionResponse) {
    super(objectOrError ?? 'Too Many Requests', 429);
  }
}
