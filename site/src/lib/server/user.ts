import type { User } from 'better-auth';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { adminUsers } from './db/schema';
import { appError } from './errors';
import { err, ok, type ServerResult } from './result';

export const requireUser = (user: User | null | undefined): ServerResult<User> => {
	if (!user) {
		return err(appError.unauthorized('Unauthenticated'));
	}

	return ok(user);
};

export async function canUserChat(user: User | null | undefined): Promise<ServerResult<void>> {
	const userResult = requireUser(user);
	if (!userResult.ok) {
		return userResult;
	}

	// TODO: This needs more logic like timeouts and such.

	return ok(undefined);
}

export const isAdminUser = async (userId: string): Promise<ServerResult<boolean>> => {
	try {
		const [adminRow] = await db
			.select({ id: adminUsers.id })
			.from(adminUsers)
			.where(eq(adminUsers.userId, userId))
			.limit(1);

		return ok(Boolean(adminRow));
	} catch (error) {
		return err(appError.internal('Could not determine admin access', { cause: error }));
	}
};
