import { describe, expect, test } from 'vitest';
import { getRevealFrames, isCodeRenderElement, isMathRevealRoot } from './render_reveal';

describe('render reveal classification', () => {
	test('treats outer math containers as reveal roots', () => {
		expect(isMathRevealRoot('span', 'inline-math-chip')).toBe(true);
		expect(isMathRevealRoot('div', 'display-math-block')).toBe(true);
		expect(isMathRevealRoot('span', 'katex-display')).toBe(true);
		expect(isMathRevealRoot('span', 'katex')).toBe(true);
	});

	test('does not treat internal katex spans as reveal roots', () => {
		expect(isMathRevealRoot('span', 'mord mathnormal')).toBe(false);
		expect(isMathRevealRoot('span', 'katex-html')).toBe(false);
		expect(isMathRevealRoot('span', 'katex-mathml')).toBe(false);
		expect(isMathRevealRoot('span', 'base')).toBe(false);
	});

	test('identifies code render elements', () => {
		expect(isCodeRenderElement('code')).toBe(true);
		expect(isCodeRenderElement('pre')).toBe(true);
		expect(isCodeRenderElement('span')).toBe(false);
	});

	test('reads reveal-frame metadata from rendered elements', () => {
		const element = { dataset: { revealFrames: '12' } } as unknown as HTMLElement;
		expect(getRevealFrames(element)).toBe(12);

		const fallback = { dataset: {} } as unknown as HTMLElement;
		expect(getRevealFrames(fallback)).toBe(1);
	});
});
