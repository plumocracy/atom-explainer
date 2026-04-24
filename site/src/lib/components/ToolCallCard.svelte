<script lang="ts">
	import type { Message } from '$lib/chat.svelte';

	let { message }: { message: Message } = $props();

	const toolName = $derived(message.toolCall?.toolName ?? 'unknown_tool');
	const simulationValues = $derived(message.toolCall?.simulationValues);
	const cameraTarget = $derived(message.toolCall?.cameraTarget);
</script>

<div class="flex w-full">
	<div class="max-w-[88%] rounded-xl border border-[rgba(184,138,71,0.4)] bg-[rgba(184,138,71,0.14)] px-3 py-2 text-xs text-[var(--museum-text)]">
		<p class="font-semibold tracking-wide uppercase">Tool activity: {toolName}</p>
		{#if simulationValues}
			<p class="mt-1 text-[var(--museum-subtext)]">
				n={simulationValues.n}, l={simulationValues.l}, m={simulationValues.m}
			</p>
		{/if}
		{#if cameraTarget}
			<p class="mt-1 text-[var(--museum-subtext)]">
				x={cameraTarget.x}, y={cameraTarget.y}, z={cameraTarget.z}
			</p>
		{/if}
	</div>
</div>
