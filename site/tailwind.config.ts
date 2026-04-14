import type { Config } from 'tailwindcss';

export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			fontFamily: {
				mono: ['"Source Code Pro"', 'monospace'],
			},
		},
	},
} satisfies Config;
