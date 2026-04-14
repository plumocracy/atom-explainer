<script lang="ts">
	import Icon from '@iconify/svelte';
	import { signIn, signOut, type Provider } from '$lib/auth-client';

	let { loginPrompt, user } = $props();

	const LOGIN_PROVIDERS = [
		{
			providerName: 'github' as Provider,
			iconName: 'simple-icons:github',
			ariaLabel: 'login with gitub'
		},
		{
			providerName: 'google' as Provider,
			iconName: 'simple-icons:google',
			ariaLabel: 'login with google'
		}
	];

	let errorMessage = $state('');

	async function handleSignIn(provider: Provider) {
		const result = await signIn(provider);
		if (!result.success) {
			errorMessage = result.error;
		}
	}
</script>

{#if !user}
	<div class="flex h-screen w-full items-center justify-center text-zinc-300">
		<div class="flex h-1/4 w-1/3 flex-col items-center rounded-2xl">
			<div class="absolute mt-4 text-center text-4xl">
				{#if !loginPrompt}
					<h1>Login to <strong>Atom</strong></h1>
				{:else}
					<h1>{loginPrompt}</h1>
				{/if}
			</div>
			<div class="my-auto flex flex-row space-x-10 text-4xl">
				{#each LOGIN_PROVIDERS as provider}
					<button
						aria-label={provider.ariaLabel}
						onclick={() => handleSignIn(provider.providerName)}
					>
						<Icon icon={provider.iconName} class="hover:cursor-pointer hover:text-zinc-100"></Icon>
					</button>
				{/each}
			</div>

			{#if errorMessage}
				<span class="text-red-500">Sign In Error: {errorMessage}</span>
			{/if}
		</div>
	</div>
{:else}
	<div class="flex h-screen w-full flex-col items-center justify-center text-xl text-zinc-300">
		<h2>Logged in as {user.name}</h2>
		<h3>You must sign-out to change user.</h3>
		<button
			class="mt-4 rounded-md bg-zinc-800 px-4 hover:cursor-pointer hover:bg-zinc-700"
			onclick={async () => {
				await signOut();
				location.reload();
			}}
		>
			Sign Out
		</button>
	</div>
{/if}
