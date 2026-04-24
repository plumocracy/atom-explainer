<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';
	import { showErrorToast } from '$lib/toast.svelte';

	let { form }: { form: ActionData } = $props();

	let lastToastRequestId = $state<string | null>(null);

	$effect(() => {
		const error = form?.error;
		if (!error) {
			return;
		}

		const toastKey = `${error.requestId ?? 'no-request'}:${error.message}`;
		if (lastToastRequestId === toastKey) {
			return;
		}

		lastToastRequestId = toastKey;
		showErrorToast(error, 'Authentication failed');
	});
</script>

<h1>Login</h1>
<form method="post" action="?/signInEmail" use:enhance>
	<label>
		Email
		<input
			type="email"
			name="email"
			class="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
		/>
	</label>
	<label>
		Password
		<input
			type="password"
			name="password"
			class="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
		/>
	</label>
	<label>
		Name (for registration)
		<input
			name="name"
			class="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
		/>
	</label>
	<button class="rounded-md bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
		>Login</button
	>
	<button
		formaction="?/signUpEmail"
		class="rounded-md bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
		>Register</button
	>
</form>
{#if form?.error}
	<p class="mt-4 text-red-400">{form.error.message}</p>
{/if}
