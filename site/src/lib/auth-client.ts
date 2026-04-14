import { createAuthClient } from "better-auth/client"
const authClient = createAuthClient()

export type Provider = "github" | "google" | "apple";
export type SignInResult = { success: true } | { success: false, error: string }

export async function signIn(provider: Provider): Promise<SignInResult> {
	const { data, error } = await authClient.signIn.social({ provider });

	if (error) {
		return { success: false, error: error.message ?? "Sign in failed" };
	}

	return { success: true };
}

export async function signOut() {
	await authClient.signOut();
}

