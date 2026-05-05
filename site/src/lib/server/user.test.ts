import { describe, expect, test } from 'vitest';
import { canUserChat, requireUser } from './user';

describe('user guards', () => {
	test('requireUser fails without a user and succeeds with a user', () => {
		expect(requireUser(null).ok).toBe(false);
		const out = requireUser({ id: 'u1' } as never);
		expect(out.ok).toBe(true);
	});

	test('canUserChat mirrors requireUser currently', async () => {
		expect((await canUserChat(undefined)).ok).toBe(false);
		expect((await canUserChat({ id: 'u1' } as never)).ok).toBe(true);
	});
});
