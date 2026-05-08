const MATH_REVEAL_ROOT_CLASSES = new Set(['inline-math-chip', 'display-math-block', 'katex-display']);

export const isMathRevealRoot = (tagName: string, className: string): boolean => {
	const classes = className.split(/\s+/).filter(Boolean);
	if (classes.some((value) => MATH_REVEAL_ROOT_CLASSES.has(value))) {
		return true;
	}

	// Fallback for bare KaTeX output if it is not wrapped by one of the usual roots.
	return classes.includes('katex');
};

export const isCodeRenderElement = (tagName: string): boolean => {
	const normalized = tagName.toLowerCase();
	return normalized === 'code' || normalized === 'pre';
};

export const getRevealFrames = (element: HTMLElement): number => {
	const rawValue = element.dataset.revealFrames;
	const parsed = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};
