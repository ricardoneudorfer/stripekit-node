export class StripeKitError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly cause?: unknown;

  constructor(message: string, code = 'stripekit_error', statusCode = 400, cause?: unknown) {
    super(message);
    this.name = 'StripeKitError';
    this.code = code;
    this.statusCode = statusCode;
    this.cause = cause;
    Object.setPrototypeOf(this, StripeKitError.prototype);
  }
}

export class ValidationError extends StripeKitError {
  public readonly fieldErrors?: Record<string, string>;

  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message, 'validation_error', 422);
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class ConfigurationError extends StripeKitError {
  constructor(message: string) {
    super(message, 'configuration_error', 500);
    this.name = 'ConfigurationError';
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

export class NotFoundError extends StripeKitError {
  constructor(message: string) {
    super(message, 'not_found', 404);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class StripeOperationError extends StripeKitError {
  constructor(message: string, cause?: unknown) {
    super(message, 'stripe_operation_error', 422, cause);
    this.name = 'StripeOperationError';
    Object.setPrototypeOf(this, StripeOperationError.prototype);
  }
}

export class WebhookVerificationError extends StripeKitError {
  constructor(message: string, cause?: unknown) {
    super(message, 'webhook_verification_error', 400, cause);
    this.name = 'WebhookVerificationError';
    Object.setPrototypeOf(this, WebhookVerificationError.prototype);
  }
}

export function toStripeOperationError(error: unknown, fallbackMessage: string): StripeOperationError {
  if (error instanceof Error) {
    return new StripeOperationError(error.message || fallbackMessage, error);
  }
  return new StripeOperationError(fallbackMessage, error);
}
