import { env } from '$env/dynamic/private';

export const flags = {
	chatEnabled: env.CHAT_ENABLED == "TRUE"
}
