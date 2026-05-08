<script lang="ts">
	let {
		suggestions,
		onSelect,
		kicker = 'Guided Prompts',
		title = 'Start with a short lesson',
		description = 'Choose a lesson and the assistant will walk you through it.'
	}: {
		suggestions: string[];
		onSelect: (message: string) => void;
		kicker?: string;
		title?: string;
		description?: string;
	} = $props();
</script>

<div class="flex h-full flex-col justify-center">
	<div class="my-auto flex flex-col items-center gap-3 px-3 py-4 text-center md:gap-4 md:px-4">
		<p class="museum-kicker">{kicker}</p>
		<h3 class="text-2xl md:text-3xl">{title}</h3>
		<p class="max-w-xs text-sm text-[var(--museum-subtext)]">
			{description}
		</p>
		{#each suggestions as suggestion}
			<button
				type="button"
				class="museum-button w-full max-w-sm rounded-xl px-4 py-2.5 text-left text-sm font-medium hover:cursor-pointer md:py-3"
				onclick={() => onSelect(suggestion)}
			>
				{suggestion}
			</button>
		{/each}
	</div>
</div>
