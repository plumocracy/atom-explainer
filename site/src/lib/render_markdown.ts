const escapeHtml = (value: string): string =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const renderInlineMarkdown = (value: string): string => {
	const segments = value.split(/(`[^`]+`)/g);

	return segments
		.map((segment) => {
			if (segment.startsWith('`') && segment.endsWith('`') && segment.length >= 2) {
				return `<code>${escapeHtml(segment.slice(1, -1))}</code>`;
			}

			let rendered = escapeHtml(segment);

			rendered = rendered.replace(
				/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
				(_, label: string, href: string) =>
					`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
			);
			rendered = rendered.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
			rendered = rendered.replace(/\*([^*]+)\*/g, '<em>$1</em>');
			return rendered;
		})
		.join('');
};

const renderParagraph = (lines: string[]): string =>
	`<p>${lines.map((line) => renderInlineMarkdown(line)).join('<br />')}</p>`;

const renderCodeBlock = (lines: string[]): string => `<pre><code>${escapeHtml(lines.join('\n'))}</code></pre>`;

export const renderMarkdown = (source: string): string => {
	const normalized = source.replaceAll('\r\n', '\n').trim();
	if (!normalized) {
		return '';
	}

	const lines = normalized.split('\n');
	const blocks: string[] = [];
	let index = 0;

	while (index < lines.length) {
		const line = lines[index] ?? '';
		const trimmed = line.trim();

		if (!trimmed) {
			index += 1;
			continue;
		}

		if (trimmed.startsWith('```')) {
			index += 1;
			const codeLines: string[] = [];
			while (index < lines.length && !(lines[index] ?? '').trim().startsWith('```')) {
				codeLines.push(lines[index] ?? '');
				index += 1;
			}
			if (index < lines.length) {
				index += 1;
			}
			blocks.push(renderCodeBlock(codeLines));
			continue;
		}

		const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
		if (headingMatch) {
			const level = headingMatch[1].length;
			blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
			index += 1;
			continue;
		}

		if (/^[-*+]\s+/.test(trimmed)) {
			const items: string[] = [];
			while (index < lines.length) {
				const nextLine = (lines[index] ?? '').trim();
				if (!/^[-*+]\s+/.test(nextLine)) {
					break;
				}
				items.push(`<li>${renderInlineMarkdown(nextLine.replace(/^[-*+]\s+/, ''))}</li>`);
				index += 1;
			}
			blocks.push(`<ul>${items.join('')}</ul>`);
			continue;
		}

		if (/^\d+\.\s+/.test(trimmed)) {
			const items: string[] = [];
			while (index < lines.length) {
				const nextLine = (lines[index] ?? '').trim();
				if (!/^\d+\.\s+/.test(nextLine)) {
					break;
				}
				items.push(`<li>${renderInlineMarkdown(nextLine.replace(/^\d+\.\s+/, ''))}</li>`);
				index += 1;
			}
			blocks.push(`<ol>${items.join('')}</ol>`);
			continue;
		}

		const paragraphLines = [line];
		index += 1;
		while (index < lines.length && (lines[index] ?? '').trim()) {
			const nextLine = lines[index] ?? '';
			if (
				nextLine.trim().startsWith('```') ||
				/^(#{1,6})\s+/.test(nextLine.trim()) ||
				/^[-*+]\s+/.test(nextLine.trim()) ||
				/^\d+\.\s+/.test(nextLine.trim())
			) {
				break;
			}
			paragraphLines.push(nextLine);
			index += 1;
		}

		blocks.push(renderParagraph(paragraphLines));
	}

	return blocks.join('');
};
