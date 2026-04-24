export const APP_ERROR_CODES = [
	'BAD_REQUEST',
	'UNAUTHORIZED',
	'FORBIDDEN',
	'NOT_FOUND',
	'CONFLICT',
	'RATE_LIMITED',
	'INTERNAL',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export type PublicAppError = {
	code: AppErrorCode;
	message: string;
	requestId?: string;
	details?: unknown;
};

export type ApiErrorResponse = {
	success: false;
	error: PublicAppError;
};

export const isPublicAppError = (value: unknown): value is PublicAppError => {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const maybeError = value as Partial<PublicAppError>;
	return typeof maybeError.message === 'string' && typeof maybeError.code === 'string';
};
