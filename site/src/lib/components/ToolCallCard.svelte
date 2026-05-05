<script lang="ts">
	import type { ToolCallMessage } from '$lib/chat.svelte';

	let { toolCalls }: { toolCalls: ToolCallMessage[] } = $props();

	const summarizeToolCall = (toolCall: ToolCallMessage): string => {
		if (toolCall.simulationValues) {
			return `n=${toolCall.simulationValues.n}, l=${toolCall.simulationValues.l}, m=${toolCall.simulationValues.m}`;
		}

		if (toolCall.cameraTarget) {
			return `camera to ${toolCall.cameraTarget.x}, ${toolCall.cameraTarget.y}, ${toolCall.cameraTarget.z}`;
		}

		if (typeof toolCall.crossSectionHidden === 'boolean') {
			return toolCall.crossSectionHidden ? 'cross section hidden' : 'cross section shown';
		}

		if (toolCall.visualizationMode) {
			return `view ${toolCall.visualizationMode}`;
		}

		if (typeof toolCall.atomicNumber === 'number') {
			return `Z=${toolCall.atomicNumber}`;
		}

		return toolCall.toolName;
	};

	const toolSummary = $derived(
		toolCalls.map((toolCall) => `${toolCall.toolName}: ${summarizeToolCall(toolCall)}`).join(', ')
	);
	let open = $state(false);
</script>

<div class="-mt-1 flex w-full">
	<details
		bind:open
		class="max-w-[92%] px-1 py-1 text-[11px] text-[var(--museum-subtext)] opacity-80"
	>
		<summary
			class="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium tracking-wide transition hover:opacity-100"
		>
			<span class="inline-block transition-transform duration-150" class:rotate-90={open}>▸</span>
			<span>Tool history</span>
		</summary>
		<div
			class="mt-2 rounded-lg border border-[rgba(44,61,75,0.08)] bg-[rgba(44,61,75,0.03)] px-3 py-2"
		>
			<p class="opacity-75">{toolSummary}</p>
		</div>
	</details>
</div>
