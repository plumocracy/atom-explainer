import { describe, expect, test } from 'vitest';
import { renderMarkdown } from './render_markdown';

describe('renderMarkdown', () => {
	test('renders emphasis and escapes html', () => {
		const rendered = renderMarkdown('**orbital** <script>alert(1)</script> *shape*');

		expect(rendered).toContain('<strong>orbital</strong>');
		expect(rendered).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(rendered).toContain('<em>shape</em>');
	});

	test('renders lists and paragraphs', () => {
		const rendered = renderMarkdown('- one\n- two\n\nA paragraph');

		expect(rendered).toContain('<ul>');
		expect(rendered).toContain('<li>one</li>');
		expect(rendered).toContain('<li>two</li>');
		expect(rendered).toContain('<p>A paragraph</p>');
	});

	test('renders fenced code blocks without parsing markdown inside', () => {
		const rendered = renderMarkdown('```\n**not bold**\n```');

		expect(rendered).toContain('<pre><code>**not bold**');
		expect(rendered).not.toContain('<strong>not bold</strong>');
	});

	test('renders inline math with katex', () => {
		const rendered = renderMarkdown('Probability is $\\phi^2$.');

		expect(rendered).toContain('<span class="inline-math-chip">');
		expect(rendered).toContain('<span class="katex">');
		expect(rendered).toContain('Probability is ');
	});

	test('renders block math with katex display mode', () => {
		const rendered = renderMarkdown('$$\n\\int_0^1 x^2 \\, dx\n$$');

		expect(rendered).toContain('katex-display');
		expect(rendered).toContain('mord');
	});

	test('renders bracketed display math with katex display mode', () => {
		const rendered = renderMarkdown('\\[\n\\sum_{n=1}^{\\infty} \\frac{1}{n^2}\n\\]');

		expect(rendered).toContain('katex-display');
		expect(rendered).toContain('mfrac');
	});

	test('renders mixed markdown and math without malformed emphasis parsing', () => {
		const rendered = renderMarkdown(`The wavefunction ($\\psi$) is the fundamental mathematical description.

Key properties:

- Contains probabilities: The square of the wavefunction, $|\\psi|^2$, gives the probability density.
- Complex-valued: Wavefunctions are generally complex, which is why we use $|\\psi|^2 = \\psi \\psi^*$.
- Solves Schrödinger equation:
\\[
\\hat{H}\\psi = E\\psi
\\]
Where $\\hat{H}$ is the Hamiltonian operator and $E$ is energy.

Normalized:
\\[
\\int |\\psi|^2 \\, dV = 1
\\]
The total probability equals 1.`);

		expect(rendered).toContain('<ul>');
		expect(rendered).toContain('<span class="inline-math-chip">');
		expect(rendered).toContain('katex-display');
		expect(rendered).toContain('Hamiltonian operator');
		expect(rendered).not.toContain('<em>|');
		expect(rendered).not.toContain('\\[');
	});
});
