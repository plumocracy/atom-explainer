import { error as kitError, json } from '@sveltejs/kit';
import type { AppErrorCode, PublicAppError } from '$lib/types/app-error';

export { APP_ERROR_CODES } from '$lib/types/app-error';

type AppErrorOptions = {
	status: number;
	code: AppErrorCode;
	details?: unknown;
	cause?: unknown;
	expose?: boolean;
	requestId?: string;
};

type NormalizeErrorOptions = {
	status?: number;
	message?: string;
	requestId?: string;
};

type HttpErrorLike = {
	status: number;
	body?: {
		message?: string;
	};
	message?: string;
};

const INTERNAL_MESSAGE = 'Internal server error';

const codeByStatus = (status: number): AppErrorCode => {
	switch (status) {
		case 400:
			return 'BAD_REQUEST';
		case 401:
			return 'UNAUTHORIZED';
		case 403:
			return 'FORBIDDEN';
		case 404:
			return 'NOT_FOUND';
		case 409:
			return 'CONFLICT';
		case 429:
			return 'RATE_LIMITED';
		default:
			return 'INTERNAL';
	}
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
	return typeof value === 'object' && value !== null;
};

const isHttpErrorLike = (value: unknown): value is HttpErrorLike => {
	if (!isRecord(value)) {
		return false;
	}

	return typeof value.status === 'number';
};

export class AppError extends Error {
	readonly status: number;
	readonly code: AppErrorCode;
	readonly details?: unknown;
	readonly expose: boolean;
	readonly requestId?: string;

	constructor(message: string, options: AppErrorOptions) {
		super(message, { cause: options.cause });
		this.name = new.target.name;
		this.status = options.status;
		this.code = options.code;
		this.details = options.details;
		this.expose = options.expose ?? options.status < 500;
		this.requestId = options.requestId;
	}
}

const createError = (
	status: number,
	code: AppErrorCode,
	message: string,
	options: Omit<AppErrorOptions, 'status' | 'code'> = {}
): AppError => {
	return new AppError(message, {
		status,
		code,
		...options,
	});
};

export const appError = {
	badRequest: (message = 'Bad request', details?: unknown) =>
		createError(400, 'BAD_REQUEST', message, { details, expose: true }),
	unauthorized: (message = 'Unauthorized', details?: unknown) =>
		createError(401, 'UNAUTHORIZED', message, { details, expose: true }),
	forbidden: (message = 'Forbidden', details?: unknown) =>
		createError(403, 'FORBIDDEN', message, { details, expose: true }),
	notFound: (message = 'Not found', details?: unknown) =>
		createError(404, 'NOT_FOUND', message, { details, expose: true }),
	conflict: (message = 'Conflict', details?: unknown) =>
		createError(409, 'CONFLICT', message, { details, expose: true }),
	rateLimited: (message = 'Too many requests', details?: unknown) =>
		createError(429, 'RATE_LIMITED', message, { details, expose: true }),
	internal: (message = INTERNAL_MESSAGE, options: Omit<AppErrorOptions, 'status' | 'code'> = {}) =>
		createError(500, 'INTERNAL', message, { ...options, expose: false }),
};

export const normalizeError = (value: unknown, options: NormalizeErrorOptions = {}): AppError => {
	if (value instanceof AppError) {
		if (!options.requestId || value.requestId) {
			return value;
		}

		return new AppError(value.message, {
			status: value.status,
			code: value.code,
			details: value.details,
			cause: value.cause,
			expose: value.expose,
			requestId: options.requestId,
		});
	}

	if (isHttpErrorLike(value)) {
		const status = value.status;
		const statusCode = codeByStatus(status);
		const message =
			(typeof value.body?.message === 'string' && value.body.message) ||
			(typeof value.message === 'string' && value.message) ||
			options.message ||
			INTERNAL_MESSAGE;

		return new AppError(message, {
			status,
			code: statusCode,
			expose: status < 500,
			requestId: options.requestId,
			cause: value,
		});
	}

	const status = options.status ?? 500;
	const code = codeByStatus(status);
	const message = options.message ?? (value instanceof Error ? value.message : INTERNAL_MESSAGE);

	return new AppError(message, {
		status,
		code,
		expose: status < 500,
		requestId: options.requestId,
		cause: value,
	});
};

export const toPublicError = (value: unknown, options: NormalizeErrorOptions = {}): PublicAppError => {
	const normalized = normalizeError(value, options);

	return {
		code: normalized.code,
		message: normalized.expose ? normalized.message : INTERNAL_MESSAGE,
		requestId: normalized.requestId,
		details: normalized.expose ? normalized.details : undefined,
	};
};

export const toErrorResponse = (value: unknown, requestId?: string): Response => {
	const normalized = normalizeError(value, { requestId });

	return json(
		{
			success: false,
			error: toPublicError(normalized),
		},
		{ status: normalized.status }
	);
};

export const throwKitError = (value: unknown, requestId?: string): never => {
	const normalized = normalizeError(value, { requestId });
	const payload = toPublicError(normalized);
	throw kitError(normalized.status, payload);
};
