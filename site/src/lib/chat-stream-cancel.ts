let cancelActiveChatStreamImpl: (() => void) | null = null;

export const cancelActiveChatStream = (): void => {
	cancelActiveChatStreamImpl?.();
};

export const setActiveChatStreamCanceler = (next: (() => void) | null): void => {
	cancelActiveChatStreamImpl = next;
};
