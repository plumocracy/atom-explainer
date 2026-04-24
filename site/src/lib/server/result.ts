import { AppError, normalizeError } from './errors';

export type Result<T, E> =
	| {
			ok: true;
			data: T;
	  }
	| {
			ok: false;
			error: E;
	  };

export type ServerResult<T> = Result<T, AppError>;

export const ok = <T>(data: T): Result<T, never> => ({
	ok: true,
	data,
});

export const err = <E>(error: E): Result<never, E> => ({
	ok: false,
	error,
});

export const tryResult = async <T>(fn: () => Promise<T> | T): Promise<ServerResult<T>> => {
	try {
		return ok(await fn());
	} catch (error) {
		return err(normalizeError(error));
	}
};

export const unwrap = <T>(result: ServerResult<T>): T => {
	if (!result.ok) {
		throw result.error;
	}

	return result.data;
};
