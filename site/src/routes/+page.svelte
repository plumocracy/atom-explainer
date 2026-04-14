<script lang="ts">
	import type { PageProps } from './$types';
	import Icon from '@iconify/svelte';
	import OrbitalCanvas from '$lib/components/orbital_canvas.svelte';
	import ChatWindow from '$lib/components/chat_window.svelte';

	let { data, form }: PageProps = $props();
	let show_chat = $state<boolean>(false);

	let { user, chatEnabled } = data;

	console.log(chatEnabled);

	let panelWidth = $state(600);
	let dragging = false;

	const panelMinWidth = 450;

	function onDragStart(e: PointerEvent) {
		dragging = true;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onDragMove(e: PointerEvent) {
		if (!dragging) return;
		// Subtract from window width since panel is on the right
		panelWidth = Math.min(
			Math.max(panelMinWidth, window.innerWidth - e.clientX),
			window.innerWidth * 0.4
		);
	}

	function onDragEnd() {
		dragging = false;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- TODO: Add aria to this -->
<div class="flex h-dvh flex-row overflow-hidden" onpointermove={onDragMove} onpointerup={onDragEnd}>
	<div class="flex-1">
		<OrbitalCanvas />
	</div>
	{#if chatEnabled}
		<!-- Drag handle -->
		<div
			class="w-1 cursor-col-resize touch-none bg-zinc-700 transition-colors hover:bg-zinc-500 active:bg-zinc-300 {show_chat
				? 'opacity-100'
				: 'pointer-events-none w-0 opacity-0'}"
			onpointerdown={onDragStart}
		></div>

		<aside
			class="h-full overflow-hidden bg-zinc-900 ease-in-out"
			class:transition-[width]={!dragging}
			class:duration-200={!dragging}
			style="width: {show_chat ? panelWidth : 0}px"
		>
			<div style="width: {panelWidth}px" class="h-full">
				<ChatWindow {show_chat} {user} do_close={() => (show_chat = !show_chat)} {form} />
			</div>
		</aside>
	{/if}
</div>

{#if chatEnabled}
	<button
		class="transition-200 absolute top-10 right-10 z-10 flex flex-row items-center justify-center space-x-5 text-2xl text-zinc-300 transition-opacity hover:text-zinc-100 {show_chat
			? 'opacity-0'
			: 'opacity-100'}"
		onclick={() => (show_chat = !show_chat)}
		disabled={show_chat}
	>
		<h3>Chat</h3>
		<Icon icon="hugeicons:atomic-power" class="text-5xl"></Icon>
	</button>
{/if}
