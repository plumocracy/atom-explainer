import { beforeEach, describe, expect, test, vi } from 'vitest';

const { signInSocial, signOutFn } = vi.hoisted(() => ({
	signInSocial: vi.fn(),
	signOutFn: vi.fn()
}));

vi.mock('better-auth/client', () => ({
	createAuthClient: () => ({
		signIn: { social: signInSocial },
		signOut: signOutFn
	})
}));

import { signIn, signOut } from './auth-client';

describe('auth-client', () => {
	beforeEach(() => {
		signInSocial.mockReset();
		signOutFn.mockReset();
	});

	test('signIn returns failure when provider sign-in errors', async () => {
		signInSocial.mockResolvedValue({ data: null, error: { message: 'nope' } });
		expect(await signIn('github')).toEqual({ success: false, error: 'nope' });
	});

	test('signIn returns success on no error', async () => {
		signInSocial.mockResolvedValue({ data: { ok: true }, error: null });
		expect(await signIn('google')).toEqual({ success: true });
	});

	test('signOut delegates to auth client', async () => {
		signOutFn.mockResolvedValue(undefined);
		await signOut();
		expect(signOutFn).toHaveBeenCalledTimes(1);
	});
});
