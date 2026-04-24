import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	const chatEnabled = env.FLAG_CHAT_ENABLED == 'TRUE';

	if (!chatEnabled) {
		throw redirect(302, '/');
	}

	return { user: locals.user, chatEnabled };
};
