const TOKEN_REGEX = /\p{L}+|\p{N}+|[^\s\p{L}\p{N}]/gu;

export const estimateTextTokens = (text: string): number => {
	const normalized = text.trim();
	if (!normalized) {
		return 0;
	}

	const segments = normalized.match(TOKEN_REGEX) ?? [];
	return segments.length;
};

export const estimateUserInputTokens = (message: string): number => {
	// Track only user-authored text with a stable local estimate instead of provider prompt usage.
	return estimateTextTokens(message);
};
