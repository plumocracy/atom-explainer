type RetryInput = {
	attempts?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
	signal?: AbortSignal;
	shouldRetry?: (error: unknown, attempt: number) => boolean;
};

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 2_000;

const wait = (delayMs: number, signal?: AbortSignal): Promise<void> =>
	new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason ?? new DOMException('Request aborted', 'AbortError'));
			return;
		}

		const timeout = setTimeout(resolve, delayMs);
		signal?.addEventListener(
			'abort',
			() => {
				clearTimeout(timeout);
				reject(signal.reason ?? new DOMException('Request aborted', 'AbortError'));
			},
			{ once: true }
		);
	});

export const isAbortError = (error: unknown): boolean => {
	return error instanceof DOMException && error.name === 'AbortError';
};

export const retryAsync = async <T>(fn: () => Promise<T>, input: RetryInput = {}): Promise<T> => {
	const attempts = Math.max(1, input.attempts ?? DEFAULT_ATTEMPTS);
	const baseDelayMs = Math.max(0, input.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
	const maxDelayMs = Math.max(baseDelayMs, input.maxDelayMs ?? DEFAULT_MAX_DELAY_MS);
	let lastError: unknown;

	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (
				attempt >= attempts ||
				input.signal?.aborted ||
				isAbortError(error) ||
				input.shouldRetry?.(error, attempt) === false
			) {
				throw error;
			}

			const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
			await wait(exponentialDelay, input.signal);
		}
	}

	throw lastError;
};
