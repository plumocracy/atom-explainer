import { describe, expect, test } from 'vitest';
import { accountRelations, sessionRelations, userRelations } from './auth.schema';

describe('auth schema relations', () => {
	test('relation objects are defined', () => {
		expect(userRelations).toBeTruthy();
		expect(sessionRelations).toBeTruthy();
		expect(accountRelations).toBeTruthy();
	});
});
