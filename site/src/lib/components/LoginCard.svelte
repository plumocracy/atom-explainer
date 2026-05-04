<script lang="ts">
	import Icon from '@iconify/svelte';
	import { signIn, signOut, type Provider } from '$lib/auth-client';
	import { showErrorToast } from '$lib/toast.svelte';

	let { loginPrompt, user } = $props();

	const LOGIN_PROVIDERS = [
		{
			providerName: 'github' as Provider,
			iconName: 'simple-icons:github',
			ariaLabel: 'login with github',
			label: 'Continue with GitHub',
			note: 'Best for contributors and code review sessions.'
		},
		{
			providerName: 'google' as Provider,
			iconName: 'simple-icons:google',
			ariaLabel: 'login with google',
			label: 'Continue with Google',
			note: 'Use your existing academic or personal profile.'
		}
	];

	let errorMessage = $state('');

	async function handleSignIn(provider: Provider) {
		const result = await signIn(provider);
		if (!result.success) {
			errorMessage = result.error;
			showErrorToast(result.error, 'Sign in failed');
		}
	}
</script>

{#if !user}
	<div class="museum-shell">
		<section class="museum-frame px-4 py-6 md:px-8 md:py-10">
			<div class="mx-auto w-full max-w-3xl lg:min-h-[calc(100dvh-5rem)]">
				<article
					class="museum-panel rounded-[2rem] border px-6 py-7 shadow-[var(--museum-shadow)] md:px-8 md:py-9"
				>
					<p class="museum-kicker">Sign In</p>
					<h2 class="museum-title mt-3 text-[2.2rem] md:text-[2.5rem]">Choose your entrance</h2>
					<p class="mt-3 text-sm leading-6 text-[var(--museum-subtext)] md:text-[0.98rem]">
						Use an existing account to continue into the gallery. Your provider is only used to
						identify your saved sessions.
					</p>

					<div class="mt-8 grid gap-3 sm:grid-cols-3">
						<div class="rounded-2xl border border-[var(--museum-stroke)] bg-white/45 p-4">
							<p class="museum-kicker !tracking-[0.12em]">Collection</p>
							<p class="mt-2 text-lg font-semibold">Orbital studies</p>
							<p class="mt-1 text-sm text-[var(--museum-subtext)]">
								Live atomic visualizations with guided commentary.
							</p>
						</div>
						<div class="rounded-2xl border border-[var(--museum-stroke)] bg-white/45 p-4">
							<p class="museum-kicker !tracking-[0.12em]">Archive</p>
							<p class="mt-2 text-lg font-semibold">Saved transcripts</p>
							<p class="mt-1 text-sm text-[var(--museum-subtext)]">
								Keep curator conversations attached to your account.
							</p>
						</div>
						<div class="rounded-2xl border border-[var(--museum-stroke)] bg-white/45 p-4">
							<p class="museum-kicker !tracking-[0.12em]">Access</p>
							<p class="mt-2 text-lg font-semibold">Member entry</p>
							<p class="mt-1 text-sm text-[var(--museum-subtext)]">
								Choose the provider you already trust to continue.
							</p>
						</div>
					</div>

					<div class="mt-8 space-y-3">
						{#each LOGIN_PROVIDERS as provider}
							<button
								type="button"
								aria-label={provider.ariaLabel}
								class="group flex w-full items-center justify-between rounded-[1.4rem] border border-[var(--museum-stroke)] bg-[linear-gradient(180deg,rgba(255,255,255,0.65),rgba(239,231,219,0.88))] px-4 py-4 text-left transition hover:cursor-pointer hover:border-[rgba(184,138,71,0.7)] hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.85),rgba(239,231,219,0.96))]"
								onclick={() => handleSignIn(provider.providerName)}
							>
								<div class="flex items-center gap-4">
									<Icon icon={provider.iconName} class="text-[1.65rem] text-[var(--museum-text)]" />
									<div>
										<p class="text-sm font-semibold text-[var(--museum-text)] md:text-[0.98rem]">
											{provider.label}
										</p>
										<p class="mt-1 text-sm text-[var(--museum-subtext)]">{provider.note}</p>
									</div>
								</div>
								<Icon
									icon="solar:alt-arrow-right-linear"
									class="text-xl text-[var(--museum-subtext)] transition group-hover:text-[var(--museum-accent)]"
								/>
							</button>
						{/each}
					</div>

					{#if errorMessage}
						<p
							class="mt-5 rounded-2xl border border-[rgba(146,76,59,0.35)] bg-[rgba(146,76,59,0.08)] px-4 py-3 text-sm text-[rgb(124,64,49)]"
						>
							Sign in failed: {errorMessage}
						</p>
					{/if}

					<p class="mt-6 text-xs leading-5 text-[var(--museum-subtext)]">
						By continuing, you are entering the archived experience for this installation.
					</p>
				</article>
			</div>
		</section>
	</div>
{:else}
	<div class="museum-shell">
		<section class="museum-frame flex items-center justify-center px-4 py-6 md:px-8 md:py-10">
			<article
				class="museum-panel w-full max-w-2xl rounded-[2rem] border px-6 py-7 text-center shadow-[var(--museum-shadow)] md:px-8 md:py-9"
			>
				<p class="museum-kicker">Signed In</p>
				<h1 class="museum-title mt-3">Welcome back{user.name ? `, ${user.name}` : ''}</h1>
				<p class="mt-4 text-sm leading-6 text-[var(--museum-subtext)] md:text-[0.98rem]">
					This installation is already registered to your current session. Sign out if you want to
					enter under a different account.
				</p>
				<div
					class="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-[var(--museum-subtext)]"
				>
					<span class="museum-chip rounded-full px-2.5 py-1">Active visitor</span>
					{#if user.email}
						<span class="rounded-full border border-[var(--museum-stroke)] bg-white/40 px-2.5 py-1"
							>{user.email}</span
						>
					{/if}
				</div>
				<button
					type="button"
					class="museum-button mt-8 rounded-full px-5 py-2.5 text-sm font-semibold hover:cursor-pointer"
					onclick={async () => {
						await signOut();
						location.reload();
					}}
				>
					Sign Out
				</button>
			</article>
		</section>
	</div>
{/if}
