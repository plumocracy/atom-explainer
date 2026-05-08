import { browser } from '$app/environment';
import { isPublicAppError, type ApiErrorResponse, type PublicAppError } from '$lib/types/app-error';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export type Toast = {
	id: number;
	tone: ToastTone;
	title: string;
	message: string;
	requestId?: string;
	durationMs: number;
	actionLabel?: string;
	onAction?: () => void;
};

type ToastInput = {
	tone?: ToastTone;
	title?: string;
	message: string;
	requestId?: string;
	durationMs?: number;
	actionLabel?: string;
	onAction?: () => void;
};

let nextToastId = 1;

export const toasts = $state<Toast[]>([]);

export const dismissToast = (id: number) => {
	const index = toasts.findIndex((toast) => toast.id === id);
	if (index >= 0) {
		toasts.splice(index, 1);
	}
};

export const showToast = (input: ToastInput) => {
	const toast: Toast = {
		id: nextToastId++,
		tone: input.tone ?? 'info',
		title: input.title ?? 'Notice',
		message: input.message,
		requestId: input.requestId,
		durationMs: input.durationMs ?? 5000,
		actionLabel: input.actionLabel,
		onAction: input.onAction
	};

	toasts.push(toast);

	if (browser && toast.durationMs > 0) {
		setTimeout(() => {
			dismissToast(toast.id);
		}, toast.durationMs);
	}

	return toast.id;
};

export const isApiErrorResponse = (value: unknown): value is ApiErrorResponse => {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const maybeResponse = value as Partial<ApiErrorResponse>;
	return maybeResponse.success === false && isPublicAppError(maybeResponse.error);
};

export const parsePublicError = (value: unknown): PublicAppError | null => {
	if (isPublicAppError(value)) {
		return value;
	}

	if (isApiErrorResponse(value)) {
		return value.error;
	}

	return null;
};

export const showErrorToast = (value: unknown, fallback = 'Something went wrong') => {
	const publicError = parsePublicError(value);

	if (publicError) {
		return showToast({
			tone: 'error',
			title: publicError.code,
			message: publicError.message,
			requestId: publicError.requestId,
			durationMs: 7000,
		});
	}

	if (value instanceof Error) {
		return showToast({
			tone: 'error',
			title: 'Error',
			message: value.message || fallback,
			durationMs: 7000,
		});
	}

	if (typeof value === 'string' && value) {
		return showToast({
			tone: 'error',
			title: 'Error',
			message: value,
			durationMs: 7000,
		});
	}

	return showToast({
		tone: 'error',
		title: 'Error',
		message: fallback,
		durationMs: 7000,
	});
};
