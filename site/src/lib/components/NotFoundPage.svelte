<script lang="ts">
	import { goto } from '$app/navigation';

	let { showBackButton = true }: { showBackButton?: boolean } = $props();
</script>

<section class="museum-shell">
	<div class="museum-frame flex items-center justify-center px-6 py-10 md:px-8">
		<article class="museum-panel w-full max-w-2xl rounded-2xl px-6 py-7 md:px-8 md:py-9">
			<p class="museum-kicker">Gallery Map · 404</p>
			<h1 class="mt-3 text-[2.3rem] leading-none md:text-[2.9rem]">This room does not exist</h1>

			<p class="mt-3 max-w-[62ch] text-sm text-[var(--museum-subtext)] md:text-[0.95rem]">
				The page you requested is not part of this exhibit, or its location has changed. Return to the
				main gallery to continue exploring the visualizations and chat tools.
			</p>

			<div
				class="mt-5 h-px w-full bg-[linear-gradient(90deg,rgba(184,138,71,0.55),rgba(184,138,71,0.08))]"
			></div>

			<div class="mt-8 flex flex-wrap gap-3">
				<button
					type="button"
					class="museum-button rounded-full px-4 py-2 text-sm font-semibold hover:cursor-pointer"
					onclick={() => goto('/')}
				>
					Return to Gallery
				</button>
				{#if showBackButton}
					<button
						type="button"
						class="rounded-full border border-[var(--museum-stroke-strong)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--museum-text)] transition hover:cursor-pointer hover:bg-[rgba(44,61,75,0.08)]"
						onclick={() => history.back()}
					>
						Go Back
					</button>
				{/if}
			</div>
		</article>
	</div>
</section>
