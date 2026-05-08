<script lang="ts">
import ArrowRight from '@lucide/svelte/icons/arrow-right';
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
									{#if provider.providerName === 'github'}
										<svg
											class="h-[1.65rem] w-[1.65rem] text-[var(--museum-text)]"
											role="img"
											viewBox="0 0 24 24"
											aria-label="GitHub"
										>
											<path
												fill="currentColor"
												d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
											/>
										</svg>
									{:else}
										<svg
											class="h-[1.65rem] w-[1.65rem] text-[var(--museum-text)]"
											role="img"
											viewBox="0 0 24 24"
											aria-label="Google"
										>
											<path
												fill="currentColor"
												d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.345-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z"
											/>
										</svg>
									{/if}
									<div>
										<p class="text-sm font-semibold text-[var(--museum-text)] md:text-[0.98rem]">
											{provider.label}
										</p>
										<p class="mt-1 text-sm text-[var(--museum-subtext)]">{provider.note}</p>
									</div>
								</div>
								<ArrowRight
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
