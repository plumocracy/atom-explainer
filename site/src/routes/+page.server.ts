import type { PageServerLoad, Actions } from "./$types";
import { queryModel } from "$lib/server/openrouter";
import { db } from "$lib/server/db";
import { fail } from "@sveltejs/kit";


export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		console.log(`User: ${locals.user.name}`);
	}

	return { user: locals.user }
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
