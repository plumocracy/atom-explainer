<script lang="ts">
	import { fade } from 'svelte/transition';
	const { n, l, m, message } = $props();
	const values = [
		{
			id: 'n',
			value: n
		},
		{
			id: 'l',
			value: l
		},
		{
			id: 'm',
			value: m
		}
	];

	function displayValues(): boolean {
		if (n != 0) {
			return true;
		}
		return false;
	}
</script>

<!-- TODO: Set simulation values on click if the values are different. -->
<button
	class="text-md mt-auto flex h-fit w-full flex-col rounded-sm bg-zinc-800 p-2 transition-all duration-300 ease-out hover:-translate-y-1 hover:cursor-pointer hover:shadow-md hover:shadow-zinc-950"
	onclick={() => {}}
	in:fade={{ duration: 100 }}
>
	<!-- Altered values portion -->
	{#if displayValues()}
		<div class="text-md flex w-full flex-row space-x-5">
			{#each values as v}
				<div class="flex flex-row">
					<span>{v.id}:{v.value}</span>
				</div>
			{/each}
		</div>
		<hr class="text-zinc-500" />
	{/if}
	<!-- Message -->
	<div class="{displayValues() ? 'mt-2' : ''} flex">
		<p>{message}</p>
	</div>
</button>
