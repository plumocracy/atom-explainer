<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const totalMessages = $derived(
		data.conversations.reduce((count, conversation) => count + conversation.messageCount, 0)
	);

	const activeConversation = $derived(
		data.selectedConversationId
			? (data.conversations.find(
					(conversation) => conversation.id === data.selectedConversationId
				) ?? null)
			: null
	);

	const formatDate = (value: string | Date) =>
		new Date(value).toLocaleString(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
</script>

<div class="museum-shell">
	<section class="museum-frame p-4 md:p-6 lg:p-8">
		<header
			class="museum-panel rounded-3xl border px-5 py-5 shadow-[var(--museum-shadow)] md:px-7 md:py-6"
		>
			<div class="flex flex-wrap items-center justify-between gap-4">
				<div>
					<p class="museum-kicker">Account Overview</p>
					<h1 class="museum-title mt-1">Conversation Dashboard</h1>
					<p class="mt-2 text-sm text-[var(--museum-subtext)]">
						Track token usage and review your recent assistant sessions.
					</p>
				</div>
				<a href={resolve('/')} class="museum-button rounded-full px-4 py-2 text-sm font-semibold"
					>Back to exhibit</a
				>
			</div>
		</header>

		<div class="mt-5 grid min-h-0 flex-1 gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
			<aside class="space-y-5">
				<section class="museum-panel rounded-2xl border p-5">
					<h2 class="text-xl">Token usage</h2>
					<div class="mt-4 grid gap-3 text-sm">
						<div class="rounded-xl border border-[var(--museum-stroke)] bg-white/40 px-4 py-3">
							<p class="museum-kicker !tracking-[0.12em]">User Input Tokens</p>
							<p class="mt-1 text-2xl font-semibold tabular-nums">{data.tokenUsage.inputTokens}</p>
						</div>
						<div class="rounded-xl border border-[var(--museum-stroke)] bg-white/40 px-4 py-3">
							<p class="museum-kicker !tracking-[0.12em]">Output Tokens</p>
							<p class="mt-1 text-2xl font-semibold tabular-nums">{data.tokenUsage.outputTokens}</p>
						</div>
						<div class="rounded-xl border border-[var(--museum-stroke)] bg-white/40 px-4 py-3">
							<p class="museum-kicker !tracking-[0.12em]">Total Messages</p>
							<p class="mt-1 text-2xl font-semibold tabular-nums">{totalMessages}</p>
						</div>
					</div>
				</section>

				<section class="museum-panel rounded-2xl border p-5">
					<div class="flex items-center justify-between gap-3">
						<h2 class="text-xl">Conversations</h2>
						<form method="POST" action="?/createConversation">
							<button
								type="submit"
								class="museum-button rounded-full px-3 py-1.5 text-xs font-semibold"
							>
								New conversation
							</button>
						</form>
					</div>
					{#if data.conversations.length === 0}
						<p class="mt-3 text-sm text-[var(--museum-subtext)]">
							No conversations yet. Start chatting to populate this dashboard.
						</p>
					{:else}
						<ul class="mt-4 space-y-2">
							{#each data.conversations as conversation (conversation.id)}
								<li>
									<form method="GET" action={resolve('/dashboard')}>
										<input type="hidden" name="conversation" value={conversation.id} />
										<button
											type="submit"
											class="block w-full rounded-xl border px-3 py-3 text-left text-sm transition hover:cursor-pointer {conversation.id ===
											data.selectedConversationId
												? 'border-[var(--museum-stroke-strong)] bg-white/70'
												: 'border-[var(--museum-stroke)] bg-white/35 hover:bg-white/55'}"
										>
											<p class="font-semibold">{conversation.title || 'Untitled conversation'}</p>
											<p class="mt-1 text-xs text-[var(--museum-subtext)]">
												{conversation.messageCount} messages • updated {formatDate(
													conversation.updatedAt
												)}
											</p>
										</button>
									</form>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			</aside>

			<section
				class="museum-panel min-h-[320px] min-w-0 overflow-hidden rounded-2xl border p-5 md:p-6"
			>
				{#if !activeConversation}
					<p class="text-sm text-[var(--museum-subtext)]">
						Select a conversation to view its message history.
					</p>
				{:else}
					<div
						class="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--museum-stroke)] pb-4"
					>
						<div>
							<h2 class="text-2xl">{activeConversation.title || 'Untitled conversation'}</h2>
							<p class="mt-1 text-sm text-[var(--museum-subtext)]">
								Created {formatDate(activeConversation.createdAt)}
							</p>
						</div>
						<div class="text-sm text-[var(--museum-subtext)]">
							<p>
								User input: <span class="font-semibold tabular-nums"
									>{activeConversation.userInputTokens}</span
								>
							</p>
							<p>
								Output: <span class="font-semibold tabular-nums"
									>{activeConversation.completionTokens}</span
								>
							</p>
						</div>
					</div>

					{#if data.history.length === 0}
						<p class="mt-6 text-sm text-[var(--museum-subtext)]">
							No messages recorded for this conversation.
						</p>
					{:else}
						<div class="mt-6 max-h-[60dvh] overflow-y-auto pr-1">
							<ul class="space-y-3">
								{#each data.history as message (message.id)}
									<li
										class="rounded-xl border px-4 py-3 text-sm leading-relaxed {message.role ===
										'user'
											? 'border-[rgba(39,80,86,0.3)] bg-[rgba(39,80,86,0.08)]'
											: 'border-[rgba(184,138,71,0.35)] bg-[rgba(184,138,71,0.1)]'}"
									>
										<div
											class="mb-2 flex items-center justify-between gap-3 text-xs tracking-[0.14em] text-[var(--museum-subtext)] uppercase"
										>
											<span>{message.role}</span>
											<span class="shrink-0">{formatDate(message.createdAt)}</span>
										</div>
										<p class="[overflow-wrap:anywhere] break-words whitespace-pre-wrap">
											{message.content}
										</p>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				{/if}
			</section>
		</div>
	</section>
</div>
