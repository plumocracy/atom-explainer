import type { User } from 'better-auth';
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
