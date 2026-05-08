<script lang="ts">
	import { browser } from '$app/environment';
	import { applyChatButton, getChatButtonLabel } from '$lib/chat.svelte';
	import type { Message } from '$lib/chat.svelte';
	import { renderMarkdown } from '$lib/render_markdown';
	import { getRevealFrames, isMathRevealRoot } from '$lib/render_reveal';
	import { findStableMarkdownBoundary } from '$lib/streaming_markdown';
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
	let assistantSource = $state('');
	let assistantContainer = $state<HTMLDivElement | null>(null);
	let assistantAnimating = $state(false);

	type RevealStep =
		| { type: 'text'; node: Text; remaining: string }
		| { type: 'element'; node: HTMLElement; remainingFrames: number };

	let assistantRevealQueue: RevealStep[] = [];
	let assistantRevealFrame = 0;
	const pendingRevealFrames = new WeakMap<HTMLElement, number>();

	const isAtomicRevealElement = (node: Node): node is HTMLElement =>
		node instanceof HTMLElement &&
		isMathRevealRoot(node.tagName, node.className);

	const cloneAttributes = (
		target: HTMLElement,
		clone: HTMLElement,
		preservePendingReveal = false
	) => {
		for (const attribute of target.getAttributeNames()) {
			if (preservePendingReveal && attribute === 'style') {
				continue;
			}

			const value = target.getAttribute(attribute);
			if (value !== null) {
				clone.setAttribute(attribute, value);
			}
		}
	};

	const isSameElementShape = (current: Node, target: Node): boolean => {
		if (!(current instanceof HTMLElement) || !(target instanceof HTMLElement)) {
			return false;
		}

		return current.tagName === target.tagName && current.className === target.className;
	};

	const cancelAssistantReveal = () => {
		if (assistantRevealFrame) {
			cancelAnimationFrame(assistantRevealFrame);
			assistantRevealFrame = 0;
		}
	};

	const queueRevealSubtree = (target: Node): Node => {
		if (target.nodeType === Node.TEXT_NODE) {
			const text = target.textContent ?? '';
			const clone = document.createTextNode('');

			if (text) {
				assistantRevealQueue.push({ type: 'text', node: clone, remaining: text });
			}

			return clone;
		}

		if (target.nodeType !== Node.ELEMENT_NODE) {
			return target.cloneNode(false);
		}

		const targetElement = target as unknown as HTMLElement;
		const targetChildren = Array.from((target as unknown as ParentNode).childNodes);
		const clone = document.createElement(targetElement.tagName.toLowerCase());
		cloneAttributes(targetElement, clone);

		if (isAtomicRevealElement(targetElement)) {
			const remainingFrames = getRevealFrames(targetElement);
			clone.innerHTML = targetElement.innerHTML;
			clone.style.visibility = 'hidden';
			pendingRevealFrames.set(clone, remainingFrames);
			assistantRevealQueue.push({
				type: 'element',
				node: clone,
				remainingFrames
			});
			return clone;
		}

		for (const child of targetChildren) {
			clone.appendChild(queueRevealSubtree(child));
		}

		return clone;
	};

	const runAssistantReveal = () => {
		const nextStep = assistantRevealQueue[0];
		if (!nextStep) {
			assistantRevealFrame = 0;
			if (!message.live) {
				assistantAnimating = false;
			}
			return;
		}

		if (nextStep.type === 'element') {
			if (nextStep.remainingFrames > 0) {
				nextStep.remainingFrames -= 1;
				pendingRevealFrames.set(nextStep.node, nextStep.remainingFrames);
			} else {
				nextStep.node.style.visibility = '';
				pendingRevealFrames.delete(nextStep.node);
				assistantRevealQueue.shift();
			}
		} else {
			nextStep.node.data += nextStep.remaining[0] ?? '';
			nextStep.remaining = nextStep.remaining.slice(1);
			if (!nextStep.remaining.length) {
				assistantRevealQueue.shift();
			}
		}

		assistantRevealFrame = requestAnimationFrame(runAssistantReveal);
	};

	const startAssistantReveal = () => {
		if (!assistantRevealQueue.length || assistantRevealFrame) {
			return;
		}

		assistantAnimating = true;
		assistantRevealFrame = requestAnimationFrame(runAssistantReveal);
	};

	const syncAssistantDom = (currentParent: Node, targetParent: Node) => {
		const currentChildren = Array.from(currentParent.childNodes);
		const targetChildren = Array.from(targetParent.childNodes);

		for (let index = 0; index < targetChildren.length; index += 1) {
			const currentChild = currentChildren[index];
			const targetChild = targetChildren[index];

			if (!currentChild) {
				currentParent.appendChild(queueRevealSubtree(targetChild));
				continue;
			}

			if (currentChild.nodeType === Node.TEXT_NODE && targetChild.nodeType === Node.TEXT_NODE) {
				const currentText = currentChild.textContent ?? '';
				const targetText = targetChild.textContent ?? '';

				if (targetText.startsWith(currentText)) {
					const remaining = targetText.slice(currentText.length);
					if (remaining) {
						assistantRevealQueue.push({ type: 'text', node: currentChild as Text, remaining });
					}
				} else {
					currentChild.textContent = targetText;
				}

				continue;
			}

			if (isSameElementShape(currentChild, targetChild)) {
				const currentElement = currentChild as HTMLElement;
				const targetElement = targetChild as HTMLElement;
				const isPendingAtomicReveal =
					isAtomicRevealElement(targetElement) &&
					currentElement.style.visibility === 'hidden' &&
					currentElement.innerHTML === targetElement.innerHTML;

				for (const name of currentElement.getAttributeNames()) {
					if (isPendingAtomicReveal && name === 'style') {
						continue;
					}

					if (!targetElement.hasAttribute(name)) {
						currentElement.removeAttribute(name);
					}
				}
				cloneAttributes(targetElement, currentElement, isPendingAtomicReveal);

				if (isAtomicRevealElement(targetElement)) {
					if (currentElement.innerHTML !== targetElement.innerHTML) {
						const replacement = queueRevealSubtree(targetElement);
						currentElement.replaceWith(replacement);
					} else if (isPendingAtomicReveal) {
						assistantRevealQueue.push({
							type: 'element',
							node: currentElement,
							remainingFrames: pendingRevealFrames.get(currentElement) ?? getRevealFrames(targetElement)
						});
					}
				} else {
					syncAssistantDom(currentElement, targetElement);
				}

				continue;
			}

			currentChild.replaceWith(queueRevealSubtree(targetChild));
		}

		for (let index = currentChildren.length - 1; index >= targetChildren.length; index -= 1) {
			currentChildren[index]?.remove();
		}
	};

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
		if (message.role === 'assistant') {
			assistantSource = message.live
				? message.content.slice(0, findStableMarkdownBoundary(message.content))
				: message.content;

			if (!message.live && message.autoFinishPending && message.pending) {
				message.pending = false;
			}

			return;
		}

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
		message.role === 'assistant' ? renderMarkdown(assistantSource) : ''
	);

	$effect(() => {
		if (!browser || message.role !== 'assistant' || !assistantContainer) {
			return;
		}

		if (!message.live) {
			cancelAssistantReveal();
			assistantRevealQueue = [];
			assistantContainer.innerHTML = renderedAssistantHtml;
			assistantAnimating = false;
			return;
		}

		cancelAssistantReveal();
		assistantRevealQueue = [];

		const template = document.createElement('template');
		template.innerHTML = renderedAssistantHtml;
		syncAssistantDom(assistantContainer, template.content);
		startAssistantReveal();

		if (!assistantRevealQueue.length && !message.live) {
			assistantAnimating = false;
		}
	});
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
				<div bind:this={assistantContainer}></div>
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
	.markdown-body {
		font: inherit;
	}

	.markdown-body :global(p),
	.markdown-body :global(ul),
	.markdown-body :global(ol),
	.markdown-body :global(li),
	.markdown-body :global(pre),
	.markdown-body :global(blockquote),
	.markdown-body :global(hr),
	.markdown-body :global(h1),
	.markdown-body :global(h2),
	.markdown-body :global(h3),
	.markdown-body :global(h4),
	.markdown-body :global(h5),
	.markdown-body :global(h6) {
		font-family: inherit;
	}

	.cursor {
		display: inline-block;
		margin-left: 2px;
		animation: blink 1s steps(2, start) infinite;
	}

	.markdown-body :global(p),
	.markdown-body :global(ul),
	.markdown-body :global(ol),
	.markdown-body :global(pre),
	.markdown-body :global(blockquote),
	.markdown-body :global(hr),
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
	.markdown-body :global(h6 + p),
	.markdown-body :global(blockquote + p),
	.markdown-body :global(p + blockquote),
	.markdown-body :global(hr + p),
	.markdown-body :global(p + hr) {
		margin-top: 0.65rem;
	}

	.markdown-body :global(h1),
	.markdown-body :global(h2),
	.markdown-body :global(h3),
	.markdown-body :global(h4),
	.markdown-body :global(h5),
	.markdown-body :global(h6) {
		line-height: 1.25;
		font-weight: 650;
		letter-spacing: -0.01em;
		color: var(--museum-text);
	}

	.markdown-body :global(h1:not(:first-child)),
	.markdown-body :global(h2:not(:first-child)) {
		margin-top: 1.1rem;
	}

	.markdown-body :global(h3:not(:first-child)),
	.markdown-body :global(h4:not(:first-child)),
	.markdown-body :global(h5:not(:first-child)),
	.markdown-body :global(h6:not(:first-child)) {
		margin-top: 0.8rem;
	}

	.markdown-body :global(h1) {
		font-size: 1.25rem;
	}

	.markdown-body :global(h2) {
		font-size: 1.125rem;
	}

	.markdown-body :global(h3) {
		font-size: 1.02rem;
	}

	.markdown-body :global(h4),
	.markdown-body :global(h5),
	.markdown-body :global(h6) {
		font-size: 0.96rem;
	}

	.markdown-body :global(ul),
	.markdown-body :global(ol) {
		padding-left: 1.2rem;
	}

	.markdown-body :global(li + li) {
		margin-top: 0.25rem;
	}

	.markdown-body :global(strong) {
		font-weight: 650;
	}

	.markdown-body :global(em) {
		font-style: italic;
	}

	.markdown-body :global(code) {
		border-radius: 0.3rem;
		background: rgba(44, 61, 75, 0.08);
		padding: 0.08rem 0.35rem;
		font-size: 0.92em;
	}

	.markdown-body :global(blockquote) {
		border-left: 3px solid rgba(184, 138, 71, 0.45);
		padding-left: 0.85rem;
		color: var(--museum-subtext);
	}

	.markdown-body :global(hr) {
		border: 0;
		border-top: 1px solid rgba(31, 37, 40, 0.12);
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

	.markdown-body :global(.display-math-block) {
		display: block;
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

	.markdown-body :global(.math-block-eqno .display-math-block) {
		flex: 1;
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
		color: inherit;
		text-decoration: underline;
		text-decoration-color: rgba(184, 138, 71, 0.7);
		text-underline-offset: 0.14em;
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
