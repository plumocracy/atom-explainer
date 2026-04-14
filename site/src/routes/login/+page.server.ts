import type { PageServerLoad } from "./$types";
import { env } from '$env/dynamic/private';
import { redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ locals }) => {
	if (env.FLAG_CHAT_ENABLED == "FALSE") {
		redirect(302, "/");
	}


	return { user: locals.user, chatEnabled: env.FLAG_CHAT_ENABLED == "TRUE" }
}
