import type { PageServerLoad, Actions } from "./$types";
import { fail } from "@sveltejs/kit";
import { env } from '$env/dynamic/private';


export const load: PageServerLoad = async ({ locals }) => {
	const { user } = locals;
	return { user, chatEnabled: env.FLAG_CHAT_ENABLED == "TRUE" }
}

export const actions = {
	chat: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) {
			return fail(403, { error: "Must be logged in to use chat service." });
		}

		const data = await request.formData();
		const message = data.get('message');
		if (!message) {
			return fail(400, { missing: "Must provide a message!" });
		}

		console.log(message);
		return { success: message }
	}
} satisfies Actions;
