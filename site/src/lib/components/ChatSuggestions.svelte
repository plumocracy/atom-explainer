<script lang="ts">
	let {
		suggestions,
		onSelect
	}: {
		suggestions: string[];
		onSelect: (message: string) => void;
	} = $props();
</script>

<div class="flex h-full flex-col justify-center">
	<div class="my-auto flex flex-col items-center gap-4 px-4 text-center">
		<p class="museum-kicker">Guided Prompts</p>
		<h3 class="text-3xl">Start with a short lesson</h3>
		<p class="max-w-xs text-sm text-[var(--museum-subtext)]">
			Choose a lesson and the assistant will walk you through it.
		</p>
		{#each suggestions as suggestion}
			<button
				type="button"
				class="museum-button w-full max-w-sm rounded-xl px-4 py-3 text-left text-sm font-medium hover:cursor-pointer"
				onclick={() => onSelect(suggestion)}
			>
				{suggestion}
			</button>
		{/each}
	</div>
</div>
