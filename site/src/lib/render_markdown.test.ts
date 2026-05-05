import { describe, expect, test } from 'vitest';
import { renderMarkdown } from './render_markdown';

describe('renderMarkdown', () => {
	test('renders emphasis and escapes html', () => {
		expect(renderMarkdown('**orbital** <script>alert(1)</script> *shape*')).toBe(
			'<p><strong>orbital</strong> &lt;script&gt;alert(1)&lt;/script&gt; <em>shape</em></p>'
		);
	});

	test('renders lists and paragraphs', () => {
		expect(renderMarkdown('- one\n- two\n\nA paragraph')).toBe(
			'<ul><li>one</li><li>two</li></ul><p>A paragraph</p>'
		);
	});

	test('renders fenced code blocks without parsing markdown inside', () => {
		expect(renderMarkdown('```\n**not bold**\n```')).toBe(
			'<pre><code>**not bold**</code></pre>'
		);
	});
});
