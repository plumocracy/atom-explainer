import { describe, expect, test } from 'vitest';
import { findStableMarkdownBoundary } from './streaming_markdown';

describe('findStableMarkdownBoundary', () => {
	test('reveals plain sentences only at sentence boundaries', () => {
		expect(findStableMarkdownBoundary('Hello there')).toBe(0);
		expect(findStableMarkdownBoundary('Hello there. More')).toBe('Hello there.'.length);
	});

	test('reveals completed paragraphs at blank-line boundaries', () => {
		const content = 'First paragraph\n\nSecond paragraph without ending';
		expect(findStableMarkdownBoundary(content)).toBe('First paragraph\n\n'.length);
	});

	test('does not reveal unclosed inline code or math', () => {
		expect(findStableMarkdownBoundary('Use `orbital')).toBe(0);
		expect(findStableMarkdownBoundary('Wavefunction $\\psi')).toBe(0);
	});

	test('does not reveal closed inline code and math until surrounding prose reaches a boundary', () => {
		expect(findStableMarkdownBoundary('Use `orbital`')).toBe(0);
		expect(findStableMarkdownBoundary('Wavefunction $\\psi$')).toBe(0);
		expect(findStableMarkdownBoundary('Use `orbital` here. More')).toBe('Use `orbital` here.'.length);
		expect(findStableMarkdownBoundary('Wavefunction $\\psi$ explains it. More')).toBe(
			'Wavefunction $\\psi$ explains it.'.length
		);
	});

	test('does not reveal closed code fences and display math blocks until a block boundary follows', () => {
		const codeFence = '```ts\nconst n = 1;\n```';
		const displayMath = '$$\nx^2\n$$';
		const bracketMath = '\\[\nx^2\n\\]';
		const codeFenceWithParagraph = '```ts\nconst n = 1;\n```\n\nNext paragraph';
		const displayMathWithParagraph = '$$\nx^2\n$$\n\nNext paragraph';
		const bracketMathWithParagraph = '\\[\nx^2\n\\]\n\nNext paragraph';

		expect(findStableMarkdownBoundary(codeFence)).toBe(0);
		expect(findStableMarkdownBoundary(displayMath)).toBe(0);
		expect(findStableMarkdownBoundary(bracketMath)).toBe(0);
		expect(findStableMarkdownBoundary(codeFenceWithParagraph)).toBe(codeFence.length + 2);
		expect(findStableMarkdownBoundary(displayMathWithParagraph)).toBe(displayMath.length + 2);
		expect(findStableMarkdownBoundary(bracketMathWithParagraph)).toBe(bracketMath.length + 2);
	});

	test('stops at the last safe boundary before an unfinished construct', () => {
		const content = 'First sentence.\n\nThen `unfinished';
		expect(findStableMarkdownBoundary(content)).toBe('First sentence.\n\n'.length);
	});
});
