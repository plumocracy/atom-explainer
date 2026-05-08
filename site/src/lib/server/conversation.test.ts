import { describe, expect, test, vi } from 'vitest';

const { where, set, update } = vi.hoisted(() => {
	const whereMock = vi.fn(async () => undefined);
	const setMock = vi.fn(() => ({ where: whereMock }));
	const updateMock = vi.fn(() => ({ set: setMock }));
	return { where: whereMock, set: setMock, update: updateMock };
});

vi.mock('./db', () => ({ db: { update } }));

import { deleteConversationForUser, restoreConversationForUser, touchConversation } from './conversation';

describe('conversation', () => {
	test('deleteConversationForUser marks deletedAt and returns ok', async () => {
		const result = await deleteConversationForUser('u1', 'c1');
		expect(result.ok).toBe(true);
		expect(update).toHaveBeenCalled();
		expect(set).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: expect.any(Date) }));
	});

	test('touchConversation updates updatedAt and returns ok', async () => {
		const result = await touchConversation('c1');
		expect(result.ok).toBe(true);
		expect(update).toHaveBeenCalled();
		expect(set).toHaveBeenCalled();
	});

	test('restoreConversationForUser clears deletedAt and returns ok', async () => {
		const result = await restoreConversationForUser('u1', 'c1');
		expect(result.ok).toBe(true);
		expect(update).toHaveBeenCalled();
		expect(set).toHaveBeenCalledWith({ deletedAt: null });
	});
});
