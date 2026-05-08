<script lang="ts">
	import { tick } from 'svelte';
import ArrowUp from '@lucide/svelte/icons/arrow-up';
import Atom from '@lucide/svelte/icons/atom';

	let {
		value = $bindable(),
		loading = false,
		placeholder = 'Ask about atomic orbitals...',
		onSubmit
	}: {
		value: string;
		loading?: boolean;
		placeholder?: string;
		onSubmit: () => void;
	} = $props();

	let textareaEl = $state<HTMLTextAreaElement | null>(null);

	const resizeTextarea = () => {
		if (!textareaEl) {
			return;
		}

		textareaEl.style.height = 'auto';
		textareaEl.style.height = value.trim() ? `${textareaEl.scrollHeight}px` : '';
	};

	$effect(() => {
		const currentValue = value;
		if (typeof currentValue === 'string') {
			void tick().then(resizeTextarea);
		}
	});

	const submit = () => {
		if (loading || !value.trim()) {
			return;
		}

		onSubmit();
	};

	const onKeydown = (event: KeyboardEvent) => {
		if (loading) {
			return;
		}

		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			submit();
		}
	};

	const onInput = () => {
		resizeTextarea();
	};
</script>

<div class="border-t border-[var(--museum-stroke)] px-3 py-3 md:px-5">
	<div
		class="flex w-full items-end gap-2 rounded-xl border border-[var(--museum-stroke)] bg-[rgba(255,255,255,0.55)] p-2.5 md:gap-3 md:p-3"
	>
		<textarea
			bind:this={textareaEl}
			bind:value
			rows="1"
			disabled={loading}
			oninput={onInput}
			onkeydown={onKeydown}
			{placeholder}
			class="max-h-44 min-h-10 flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm text-[var(--museum-text)] ring-0 placeholder:text-[var(--museum-subtext)] focus:border-0 focus:ring-0"
		></textarea>
		<button
			type="button"
			onclick={submit}
			disabled={loading || !value.trim()}
			class="museum-button inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg disabled:cursor-not-allowed disabled:opacity-50 md:h-11 md:w-11 md:text-xl"
		>
			{#if loading}
				<Atom class="animate-pulse text-[var(--museum-accent)]" />
			{:else}
				<ArrowUp class="text-[var(--museum-accent)]" />
			{/if}
		</button>
	</div>
</div>
