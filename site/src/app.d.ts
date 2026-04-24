import type { User, Session } from 'better-auth/minimal';
import type { AppErrorCode } from '$lib/types/app-error';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		interface Locals {
			user?: User;
			session?: Session;
			requestId: string;
		}

		interface Error {
			message: string;
			code?: AppErrorCode;
			requestId?: string;
			details?: unknown;
		}
		// interface PageData {}
		// interface PageState {}
	}
}

export { };
