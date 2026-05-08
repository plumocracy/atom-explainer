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

export const codeByStatus = (status: number): AppErrorCode => {
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

export const isAppErrorCode = (value: unknown): value is AppErrorCode => {
	return typeof value === 'string' && APP_ERROR_CODES.includes(value as AppErrorCode);
};

export const isPublicAppError = (value: unknown): value is PublicAppError => {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const maybeError = value as Partial<PublicAppError>;
	return typeof maybeError.message === 'string' && typeof maybeError.code === 'string';
};
