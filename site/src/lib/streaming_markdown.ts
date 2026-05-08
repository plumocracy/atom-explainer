const isEscaped = (source: string, index: number): boolean => {
	let backslashCount = 0;

	for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) {
		backslashCount += 1;
	}

	return backslashCount % 2 === 1;
};

export const findStableMarkdownBoundary = (source: string): number => {
	let lastBoundary = 0;
	let inInlineCode = false;
	let inCodeFence = false;
	let inInlineMath = false;
	let inBlockMathDollars = false;
	let inBlockMathBrackets = false;

	for (let index = 0; index < source.length; index += 1) {
		if (inCodeFence) {
			if (source.startsWith('```', index)) {
				inCodeFence = false;
				index += 2;
			}
			continue;
		}

		if (inBlockMathBrackets) {
			if (source.startsWith('\\]', index) && !isEscaped(source, index)) {
				inBlockMathBrackets = false;
				index += 1;
			}
			continue;
		}

		if (inBlockMathDollars) {
			if (source.startsWith('$$', index) && !isEscaped(source, index)) {
				inBlockMathDollars = false;
				index += 1;
			}
			continue;
		}

		if (inInlineCode) {
			if (source[index] === '`' && !isEscaped(source, index)) {
				inInlineCode = false;
			}
			continue;
		}

		if (inInlineMath) {
			if (source[index] === '$' && !isEscaped(source, index) && source[index + 1] !== '$') {
				inInlineMath = false;
			}
			continue;
		}

		if (source.startsWith('```', index)) {
			inCodeFence = true;
			index += 2;
			continue;
		}

		if (source.startsWith('\\[', index) && !isEscaped(source, index)) {
			inBlockMathBrackets = true;
			index += 1;
			continue;
		}

		if (source.startsWith('$$', index) && !isEscaped(source, index)) {
			inBlockMathDollars = true;
			index += 1;
			continue;
		}

		if (source[index] === '`' && !isEscaped(source, index)) {
			inInlineCode = true;
			continue;
		}

		if (source[index] === '$' && !isEscaped(source, index) && source[index + 1] !== '$') {
			inInlineMath = true;
			continue;
		}

		if (source.startsWith('\n\n', index)) {
			lastBoundary = index + 2;
			index += 1;
			continue;
		}

		if (/[.!?]/.test(source[index] ?? '')) {
			const next = source[index + 1];
			if (next === undefined || /\s/.test(next)) {
				lastBoundary = index + 1;
			}
		}
	}

	return lastBoundary;
};
