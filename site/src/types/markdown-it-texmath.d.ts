declare module 'markdown-it-texmath' {
	import type MarkdownIt from 'markdown-it';

	type TexmathOptions = {
		engine?: { renderToString: (source: string, options?: Record<string, unknown>) => string };
		delimiters?: string | string[];
		katexOptions?: Record<string, unknown>;
	};

	const texmath: (markdown: MarkdownIt, options?: TexmathOptions) => void;
	export default texmath;
}
