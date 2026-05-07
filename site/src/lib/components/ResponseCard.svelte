<script lang="ts">
	import { applyChatButton, getChatButtonLabel } from '$lib/chat.svelte';
	import type { Message } from '$lib/chat.svelte';
	import { renderMarkdown } from '$lib/render_markdown';
	import Icon from '@iconify/svelte';
	import { fade } from 'svelte/transition';
	import StandingWaveCanvas from './StandingWaveCanvas.svelte';
	import ToolCallCard from './ToolCallCard.svelte';

	let {
		message,
		onOpenFeedback
	}: {
		message: Message;
		onOpenFeedback?: (message: Message, preference: 'up' | 'down') => void;
	} = $props();

	let displayed = $state('');
	let queue = '';
	let animating = false;

	function animate() {
		if (!queue.length) {
			if (message.autoFinishPending && message.pending && displayed === message.content) {
				message.pending = false;
			}
			animating = false;
			return;
		}
		displayed += queue[0];
		queue = queue.slice(1);
		requestAnimationFrame(animate);
	}

	$effect(() => {
		const incoming = message.content;
		if (!message.live) {
			displayed = message.content;
			if (message.autoFinishPending && message.pending) {
				message.pending = false;
			}
		}

		// grab only the new characters since last effect run
		const newChars = incoming.slice(displayed.length + queue.length);
		if (!newChars) {
			return;
		}
		queue += newChars;
		if (!animating) {
			animating = true;
			requestAnimationFrame(animate);
		}
	});

	const renderedAssistantHtml = $derived(
		message.role === 'assistant' ? renderMarkdown(displayed) : ''
	);
</script>

<div class="flex w-full" in:fade>
	<div
		class="{message.role === 'user' ? 'ml-auto max-w-[82%]' : 'max-w-[92%]'} flex flex-col"
	>
		<article
			class="rounded-xl border px-4 py-3 text-sm leading-relaxed shadow-sm {message.role === 'user'
				? 'border-[rgba(39,80,86,0.36)] bg-[rgba(39,80,86,0.14)] text-[var(--museum-text)]'
				: 'border-[var(--museum-stroke)] bg-[rgba(255,255,255,0.62)] text-[var(--museum-text)]'}"
		>
		{#if message.role === 'assistant'}
			<div class="markdown-body">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html renderedAssistantHtml}
				{#if message.pending}
					<span class="cursor">|</span>
				{/if}
			</div>
		{:else}
			<p>
				{displayed}
				{#if message.pending}
					<span class="cursor">|</span>
				{/if}
			</p>
		{/if}
		{#if message.role === 'assistant' && message.buttons?.length}
			<div class="mt-3 flex flex-wrap justify-start gap-2">
				{#each message.buttons as button, idx (`${getChatButtonLabel(button)}:${idx}`)}
					<button
						type="button"
						class="rounded-full border border-[rgba(44,61,75,0.18)] bg-[rgba(44,61,75,0.06)] px-3 py-1.5 text-left text-xs font-semibold text-[var(--museum-text)] transition hover:cursor-pointer hover:bg-[rgba(44,61,75,0.12)]"
						onclick={() => applyChatButton(button)}
					>
						{getChatButtonLabel(button)}
					</button>
				{/each}
			</div>
		{/if}
		{#if message.role === 'assistant' && message.visualizations?.length}
			<div class="mt-3 space-y-3">
				{#each message.visualizations as visualization, idx (`${visualization.type}:${idx}`)}
					{#if visualization.type === 'standing_wave'}
						<div
							class="overflow-hidden rounded-2xl border border-[rgba(44,61,75,0.14)] bg-[rgba(8,16,23,0.96)]"
						>
							<div class="h-[28rem] w-full">
								<StandingWaveCanvas />
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
		{#if message.role === 'assistant' && message.toolCalls?.length}
			<ToolCallCard toolCalls={message.toolCalls} />
		{/if}
		</article>
		{#if message.role === 'assistant' && !message.pending && message.serverId}
			<div class="mt-0 flex items-center justify-start gap-2 px-1 text-xs text-[var(--museum-subtext)]">
				{#if message.feedbackSubmitted}
					<p>Thanks for your feedback.</p>
				{:else}
					<button
						type="button"
						class="feedback-button"
						aria-label="Rate this response helpful"
						onclick={() => onOpenFeedback?.(message, 'up')}
					>
						<Icon icon="lucide:thumbs-up" width="16" height="16" aria-hidden="true" />
					</button>
					<button
						type="button"
						class="feedback-button"
						aria-label="Rate this response needs work"
						onclick={() => onOpenFeedback?.(message, 'down')}
					>
						<Icon icon="lucide:thumbs-down" width="16" height="16" aria-hidden="true" />
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.cursor {
		display: inline-block;
		margin-left: 2px;
		animation: blink 1s steps(2, start) infinite;
	}

	.markdown-body :global(p),
	.markdown-body :global(ul),
	.markdown-body :global(ol),
	.markdown-body :global(pre),
	.markdown-body :global(h1),
	.markdown-body :global(h2),
	.markdown-body :global(h3),
	.markdown-body :global(h4),
	.markdown-body :global(h5),
	.markdown-body :global(h6) {
		margin: 0;
	}

	.markdown-body :global(p + p),
	.markdown-body :global(p + ul),
	.markdown-body :global(p + ol),
	.markdown-body :global(ul + p),
	.markdown-body :global(ol + p),
	.markdown-body :global(pre + p),
	.markdown-body :global(p + pre),
	.markdown-body :global(h1 + p),
	.markdown-body :global(h2 + p),
	.markdown-body :global(h3 + p),
	.markdown-body :global(h4 + p),
	.markdown-body :global(h5 + p),
	.markdown-body :global(h6 + p) {
		margin-top: 0.65rem;
	}

	.markdown-body :global(ul),
	.markdown-body :global(ol) {
		padding-left: 1.2rem;
	}

	.markdown-body :global(li + li) {
		margin-top: 0.25rem;
	}

	.markdown-body :global(code) {
		border-radius: 0.3rem;
		background: rgba(44, 61, 75, 0.08);
		padding: 0.08rem 0.35rem;
		font-size: 0.92em;
	}

	.markdown-body :global(.inline-math-chip) {
		display: inline-block;
		border-radius: 0.3rem;
		background: rgba(44, 61, 75, 0.08);
		padding: 0.08rem 0.35rem;
		vertical-align: baseline;
	}

	.markdown-body :global(.inline-math-chip .katex) {
		font-size: 0.92em;
	}

	.markdown-body :global(pre) {
		overflow-x: auto;
		border-radius: 0.75rem;
		background: rgba(44, 61, 75, 0.08);
		padding: 0.8rem 0.95rem;
	}

	.markdown-body :global(pre code) {
		background: transparent;
		padding: 0;
	}

	.markdown-body :global(.katex-display) {
		overflow-x: auto;
		overflow-y: hidden;
		margin: 0.85rem 0;
	}

	.markdown-body :global(.math-block-eqno) {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.markdown-body :global(.math-block-eqno .katex-display) {
		flex: 1;
		margin: 0.85rem 0;
	}

	.markdown-body :global(.math-eqno) {
		padding-top: 0.95rem;
		font-variant-numeric: tabular-nums;
		font-size: 0.92em;
		opacity: 0.78;
	}

	.markdown-body :global(.katex) {
		max-width: 100%;
	}

	.markdown-body :global(a) {
		text-decoration: underline;
	}

	.feedback-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 9999px;
		border: 0;
		background: transparent;
		padding: 0;
		font-size: 0.95rem;
		color: var(--museum-text);
		opacity: 0.72;
		transition:
			background-color 120ms ease,
			opacity 120ms ease,
			transform 120ms ease;
	}

	.feedback-button:hover {
		cursor: pointer;
		opacity: 1;
		transform: translateY(-1px);
	}

	@keyframes blink {
		to {
			visibility: hidden;
		}
	}
</style>
