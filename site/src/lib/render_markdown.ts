import katex from 'katex';
import MarkdownIt from 'markdown-it';
// markdown-it-texmath ships without types.
import texmath from 'markdown-it-texmath';

const fallbackEscapeHtml = (value: string): string =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const renderMath = (expression: string, displayMode: boolean): string => {
	try {
		const rendered = katex.renderToString(expression, {
			displayMode,
			throwOnError: false,
			strict: 'ignore'
		});

		return displayMode ? rendered : `<span class="inline-math-chip">${rendered}</span>`;
	} catch {
		const escapedExpression = fallbackEscapeHtml(expression);
		return displayMode
			? `<pre><code>${escapedExpression}</code></pre>`
			: `<span class="inline-math-chip"><code>${escapedExpression}</code></span>`;
	}
};

const normalizeDisplayMathBlocks = (source: string): string =>
	source
		.replace(/([^\n])\n(\\\[\n)/g, '$1\n\n$2')
		.replace(/([^\n])\n(\$\$\n)/g, '$1\n\n$2')
		.replace(/(\n\\\])\n([^\n])/g, '$1\n\n$2')
		.replace(/(\n\$\$)\n([^\n])/g, '$1\n\n$2');

const markdown = new MarkdownIt({
	breaks: false,
	html: false,
	linkify: false
});

markdown.use(texmath, {
	engine: katex,
	delimiters: ['dollars', 'brackets'],
	katexOptions: {
		strict: 'ignore',
		throwOnError: false
	}
});

markdown.renderer.rules.link_open = (tokens: any[], idx: number, options: any, _env: any, self: any) => {
	tokens[idx]?.attrSet('target', '_blank');
	tokens[idx]?.attrSet('rel', 'noopener noreferrer');
	return self.renderToken(tokens, idx, options);
};

markdown.renderer.rules.math_inline = (tokens: any[], idx: number) =>
	renderMath(tokens[idx]?.content ?? '', false);
markdown.renderer.rules.math_block = (tokens: any[], idx: number) =>
	`${renderMath(tokens[idx]?.content ?? '', true)}\n`;
markdown.renderer.rules.math_block_eqno = (tokens: any[], idx: number) => {
	const equation = renderMath(tokens[idx]?.content ?? '', true);
	const label = fallbackEscapeHtml(tokens[idx]?.info ?? '');
	return `<div class="math-block-eqno">${equation}<span class="math-eqno">(${label})</span></div>\n`;
};

export const renderMarkdown = (source: string): string => {
	const normalized = normalizeDisplayMathBlocks(source.replaceAll('\r\n', '\n')).trim();
	if (!normalized) {
		return '';
	}

	return markdown.render(normalized).trim();
};
