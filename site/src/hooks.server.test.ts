import { describe, expect, test } from 'vitest';
import { contentSecurityPolicy, setSecurityHeaders } from './hooks.server';

describe('security headers', () => {
	test('sets CSP and common hardening headers', () => {
		const response = new Response('ok');
		setSecurityHeaders(response);

		expect(response.headers.get('Content-Security-Policy')).toBe(contentSecurityPolicy);
		expect(response.headers.get('Content-Security-Policy')).toContain(
			"script-src 'self' 'unsafe-inline'"
		);
		expect(response.headers.get('Content-Security-Policy')).toContain(
			'img-src \'self\' data: blob: https://avatars.githubusercontent.com'
		);
		expect(response.headers.get('Content-Security-Policy')).toContain("script-src-attr 'none'");
		expect(response.headers.get('Strict-Transport-Security')).toBe(
			'max-age=31536000; includeSubDomains; preload'
		);
		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
		expect(response.headers.get('Permissions-Policy')).toContain('camera=()');
	});
});
