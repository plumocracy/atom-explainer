<script lang="ts">
	import { goto } from '$app/navigation';
	import { showErrorToast } from '$lib/toast.svelte';

	let { error, status }: { error: App.Error; status: number } = $props();

	let hasNotified = $state(false);

	$effect(() => {
		if (!hasNotified) {
			hasNotified = true;
			showErrorToast(error, `Request failed with status ${status}`);
		}
	});
</script>

<section class="museum-shell">
	<div class="museum-frame flex items-center justify-center px-6 py-10 md:px-8">
		<article class="museum-panel w-full max-w-2xl rounded-2xl px-6 py-7 md:px-8 md:py-9">
			<p class="museum-kicker">Exhibit Interruption · Error {status}</p>
			<h1 class="mt-3 text-[2.3rem] leading-none md:text-[2.9rem]">
				{error?.message ?? 'Something went wrong in the gallery'}
			</h1>

			<p class="mt-3 max-w-[62ch] text-sm text-[var(--museum-subtext)] md:text-[0.95rem]">
				The simulation is temporarily unavailable. You can return to the main gallery, or go back to
				your previous view and try again.
			</p>

			<div
				class="mt-5 h-px w-full bg-[linear-gradient(90deg,rgba(184,138,71,0.55),rgba(184,138,71,0.08))]"
			></div>

			<div class="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--museum-subtext)]">
				{#if error?.code}
					<span
						class="rounded-full border border-[var(--museum-stroke-strong)] bg-[rgba(184,138,71,0.11)] px-2.5 py-1"
					>
						Code: {error.code}
					</span>
				{/if}

				{#if error?.requestId}
					<span
						class="rounded-full border border-[var(--museum-stroke)] bg-[rgba(255,255,255,0.45)] px-2.5 py-1"
					>
						Request ID: {error.requestId}
					</span>
				{/if}
			</div>

			<div class="mt-8 flex flex-wrap gap-3">
				<button
					type="button"
					class="museum-button rounded-full px-4 py-2 text-sm font-semibold hover:cursor-pointer"
					onclick={() => goto('/')}
				>
					Return to Gallery
				</button>
				<button
					type="button"
					class="rounded-full border border-[var(--museum-stroke-strong)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--museum-text)] transition hover:cursor-pointer hover:bg-[rgba(44,61,75,0.08)]"
					onclick={() => history.back()}
				>
					Go Back
				</button>
			</div>
		</article>
	</div>
</section>
