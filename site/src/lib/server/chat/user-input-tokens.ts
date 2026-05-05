const TOKEN_REGEX = /\p{L}+|\p{N}+|[^\s\p{L}\p{N}]/gu;

export const estimateUserInputTokens = (message: string): number => {
	const normalized = message.trim();
	if (!normalized) {
		return 0;
	}

	// Track only user-authored text with a stable local estimate instead of provider prompt usage.
	const segments = normalized.match(TOKEN_REGEX) ?? [];
	return segments.length;
};
