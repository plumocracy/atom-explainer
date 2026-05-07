<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import ResponseCard from '$lib/components/ResponseCard.svelte';
	import { createChatMessage, type Message } from '$lib/chat.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let conversations = $state<typeof data.conversations>([]);
	let selectedConversationId = $state<(typeof data.selectedConversationId) | null>(null);
	let history = $state<typeof data.history>([]);
	let threadMessages = $state<Message[]>([]);
	let historyLoading = $state(false);
	let historyError = $state<string | null>(null);
	let highlightedMessageId = $state<string | null>(null);
	let messagesViewport = $state<HTMLDivElement | null>(null);
	let searchInput = $state('');
	let searchQuery = $state('');
	let searchResults = $state<
		Array<{
			id: string;
			conversationId: string;
			conversationTitle: string | null;
			role: 'user' | 'assistant';
			content: string;
			createdAt: string | Date;
		}>
	>([]);
	let searchLoading = $state(false);
	let searchError = $state<string | null>(null);

	const mapHistoryToThreadMessages = (messages: typeof data.history): Message[] =>
		messages.map((message) =>
			createChatMessage({
				serverId: message.id,
				role: message.role,
				content: message.content,
				live: false,
				pending: false
			})
		);

	const replaceThreadMessages = (messages: Message[]) => {
		threadMessages.splice(0, threadMessages.length, ...messages);
	};

	$effect(() => {
		const nextConversations = data.conversations;
		const nextSelectedConversationId = data.selectedConversationId;
		const nextHistory = data.history;

		untrack(() => {
			conversations.splice(0, conversations.length, ...nextConversations);
			selectedConversationId = nextSelectedConversationId;
			history = nextHistory;
			replaceThreadMessages(mapHistoryToThreadMessages(nextHistory));
			historyError = null;
			highlightedMessageId = null;
		});
	});

	const totalMessages = $derived(
		conversations.reduce(
			(count: number, conversation: (typeof data.conversations)[number]) =>
				count + conversation.messageCount,
			0
		)
	);

	const activeConversation = $derived(
		selectedConversationId
			? (conversations.find(
					(conversation: (typeof data.conversations)[number]) =>
						conversation.id === selectedConversationId
				) ?? null)
			: null
	);

	const formatDate = (value: string | Date) =>
		new Date(value).toLocaleString(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		});

	const hasActiveSearch = $derived(searchQuery.trim().length > 0);
	const hasActiveConversation = $derived(selectedConversationId !== null);

	const getSearchSnippet = (content: string) =>
		content.length > 220 ? `${content.slice(0, 220).trimEnd()}...` : content;

	const scrollToMessage = async (messageId: string) => {
		highlightedMessageId = messageId;
		await tick();
		document
			.getElementById(`dashboard-message-${messageId}`)
			?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	};

	const scrollThreadToBottom = async () => {
		await tick();
		if (!messagesViewport) {
			return;
		}

		messagesViewport.scrollTop = messagesViewport.scrollHeight;
	};

	$effect(() => {
		threadMessages.length;
		void scrollThreadToBottom();
	});

	const clearSearch = () => {
		searchInput = '';
		searchQuery = '';
		searchResults = [];
		searchError = null;
	};

	const selectConversation = async (conversationId: string, messageId?: string) => {
		if (historyLoading) {
			return;
		}

		if (conversationId === selectedConversationId) {
			if (messageId) {
				await scrollToMessage(messageId);
			} else {
				highlightedMessageId = null;
			}
			return;
		}

		historyLoading = true;
		historyError = null;
		highlightedMessageId = null;
		selectedConversationId = conversationId;
		history = [];
		replaceThreadMessages([]);

		try {
			const response = await fetch(
				`/api/dashboard/conversation-history?conversation=${encodeURIComponent(conversationId)}`
			);
			const payload = (await response.json().catch(() => null)) as
				| { success: true; history: typeof data.history }
				| { error?: { message?: string } }
				| null;
			const errorMessage =
				payload && 'error' in payload ? payload.error?.message : 'Could not load conversation history';

			if (!response.ok || !payload || !('success' in payload) || payload.success !== true) {
				throw new Error(errorMessage ?? 'Could not load conversation history');
			}

			history = payload.history;
			replaceThreadMessages(mapHistoryToThreadMessages(payload.history));

			const nextUrl = new URL(window.location.href);
			nextUrl.searchParams.set('conversation', conversationId);
			window.history.replaceState(window.history.state, '', nextUrl);

			if (messageId) {
				await scrollToMessage(messageId);
			}
		} catch (error) {
			historyError = error instanceof Error ? error.message : 'Could not load conversation history';
		} finally {
			historyLoading = false;
		}
	};

	const searchHistory = async () => {
		const query = searchInput.trim();
		searchQuery = query;
		searchError = null;
		searchResults = [];

		if (!query) {
			return;
		}

		searchLoading = true;

		try {
			const response = await fetch(
				`/api/dashboard/search-history?q=${encodeURIComponent(query)}`
			);
			const payload = (await response.json().catch(() => null)) as
				| {
						success: true;
						results: typeof searchResults;
				  }
				| { error?: { message?: string } }
				| null;
			const errorMessage =
				payload && 'error' in payload ? payload.error?.message : 'Could not search conversation history';

			if (!response.ok || !payload || !('success' in payload) || payload.success !== true) {
				throw new Error(errorMessage ?? 'Could not search conversation history');
			}

			searchResults = payload.results;
		} catch (error) {
			searchError = error instanceof Error ? error.message : 'Could not search conversation history';
		} finally {
			searchLoading = false;
		}
	};
</script>

<div class="museum-shell">
	<section class="museum-frame flex min-h-0 flex-col p-3 md:p-4 lg:p-5">
		<header
			class="border-b border-[var(--museum-stroke)] px-1 py-4 md:px-2 md:py-5"
		>
			<div class="flex flex-wrap items-center justify-between gap-4">
				<div>
					<p class="museum-kicker">Account Overview</p>
					<h1 class="museum-title mt-1">Conversation Dashboard</h1>
					<p class="mt-1 text-sm text-[var(--museum-subtext)]">
						Track token usage and review your recent assistant sessions.
					</p>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					{#if data.isAdmin}
						<a href={resolve('/feedback')} class="museum-button rounded-full px-4 py-2 text-sm font-semibold"
							>Feedback</a
						>
					{/if}
					<a href={resolve('/')} class="museum-button rounded-full px-4 py-2 text-sm font-semibold"
						>Back to exhibit</a
					>
				</div>
			</div>
			<form
				class="mt-4 flex flex-col gap-2 md:flex-row"
				onsubmit={(event) => {
					event.preventDefault();
					void searchHistory();
				}}
				>
					<input
					type="search"
					bind:value={searchInput}
					placeholder="Search all messages"
					class="w-full rounded-full border border-[var(--museum-stroke)] bg-white/70 px-4 py-2 text-sm outline-none transition focus:border-[var(--museum-stroke-strong)]"
				/>
				<div class="flex gap-2">
					<button
						type="submit"
						class="museum-button rounded-full px-4 py-2 text-sm font-semibold"
						disabled={searchLoading}
					>
						{searchLoading ? 'Searching...' : 'Search'}
					</button>
					{#if hasActiveSearch}
						<button
							type="button"
							class="museum-button rounded-full px-3 py-1.5 text-xs font-semibold"
							onclick={clearSearch}
						>
							Clear search
						</button>
					{/if}
				</div>
			</form>
		</header>

		<div
			class="grid min-h-0 flex-1 items-stretch overflow-hidden lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]"
		>
			<aside class="min-h-0 border-b border-[var(--museum-stroke)] lg:border-r lg:border-b-0">
				<section
					class="flex h-full min-h-0 flex-col overflow-hidden px-1 py-4 md:px-2 md:py-5"
				>
					<div class="shrink-0 flex items-center justify-between gap-3">
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
					{#if conversations.length === 0}
						<p class="mt-3 text-sm text-[var(--museum-subtext)]">
							No conversations yet. Start chatting to populate this dashboard.
						</p>
					{:else}
						<div class="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
							<ul class="space-y-2">
								{#each conversations as conversation (conversation.id)}
									<li>
										<form method="GET" action={resolve('/dashboard')}>
											<input type="hidden" name="conversation" value={conversation.id} />
											<button
												type="submit"
												onclick={(event) => {
													event.preventDefault();
													void selectConversation(conversation.id);
												}}
												disabled={historyLoading && conversation.id === selectedConversationId}
												class="block w-full rounded-xl border px-3 py-2.5 text-left text-sm transition hover:cursor-pointer {conversation.id ===
												selectedConversationId
													? 'border-[var(--museum-stroke-strong)] bg-white/70'
													: 'border-[var(--museum-stroke)] bg-white/35 hover:bg-white/55'}"
											>
												<p class="font-semibold">{conversation.title || 'Untitled conversation'}</p>
												<p class="mt-1 text-xs text-[var(--museum-subtext)]">
													{conversation.messageCount} messages • updated {formatDate(
														conversation.updatedAt
													)}
												</p>
												<p class="mt-1.5 text-xs text-[var(--museum-subtext)]">
													Input <span class="font-semibold tabular-nums text-[var(--museum-text)]">{conversation.userInputTokens}</span>
													• Output <span class="font-semibold tabular-nums text-[var(--museum-text)]">{conversation.completionTokens}</span>
												</p>
											</button>
										</form>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</section>
			</aside>

			<section
				class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-1 py-4 md:px-5 md:py-5"
			>
				{#if hasActiveSearch}
					<div class="min-h-0 flex-1 overflow-y-auto pr-1">
						{#if searchError}
							<p class="text-sm text-[rgba(168,58,46,0.98)]">{searchError}</p>
						{:else if searchLoading}
							<p class="text-sm text-[var(--museum-subtext)]">Searching your message history...</p>
						{:else if searchResults.length === 0}
							<p class="text-sm text-[var(--museum-subtext)]">
								No messages matched `{searchQuery}`.
							</p>
						{:else}
							<ul class="space-y-2.5">
								{#each searchResults as result (result.id)}
									<li>
										<button
											type="button"
											class="w-full rounded-xl border border-[var(--museum-stroke)] bg-white/45 px-4 py-3 text-left transition hover:cursor-pointer hover:bg-white/65"
											onclick={async () => {
												clearSearch();
												await selectConversation(result.conversationId, result.id);
											}}
										>
											<div class="flex flex-wrap items-center justify-between gap-3">
												<p class="font-semibold">{result.conversationTitle || 'Untitled conversation'}</p>
												<p class="text-xs text-[var(--museum-subtext)]">{formatDate(result.createdAt)}</p>
											</div>
											<p class="mt-1 text-[11px] tracking-[0.14em] text-[var(--museum-subtext)] uppercase">
												{result.role}
											</p>
											<p class="mt-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere] break-words">
												{getSearchSnippet(result.content)}
											</p>
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{:else if !activeConversation}
					<p class="text-sm text-[var(--museum-subtext)]">
						Select a conversation to view its message history.
					</p>
				{:else}
					<div class="flex min-h-0 flex-1 flex-col">
						<div
							class="shrink-0 flex flex-wrap items-start justify-between gap-3 border-b border-[var(--museum-stroke)] pb-3"
						>
							<div>
								<h2 class="text-2xl">{activeConversation.title || 'Untitled conversation'}</h2>
								<p class="mt-0.5 text-sm text-[var(--museum-subtext)]">
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

						{#if historyLoading}
							<p class="mt-4 text-sm text-[var(--museum-subtext)]">Loading conversation history...</p>
						{:else if historyError}
							<p class="mt-4 text-sm text-[rgba(168,58,46,0.98)]">{historyError}</p>
						{:else}
							<div
								bind:this={messagesViewport}
								class="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
							>
								{#if threadMessages.length === 0}
									<p class="text-sm text-[var(--museum-subtext)]">
										No messages recorded for this conversation.
									</p>
								{:else}
									{#each threadMessages as msg, idx (`${msg.id}:${idx}`)}
										<div id={msg.serverId ? `dashboard-message-${msg.serverId}` : undefined}>
											<ResponseCard message={msg} />
										</div>
									{/each}
								{/if}

							</div>

							{#if hasActiveConversation}
								<div class="pt-4">
									<a
										href={`${resolve('/')}?conversation=${encodeURIComponent(selectedConversationId ?? '')}&openChat=1`}
										class="museum-button inline-flex rounded-full px-4 py-2 text-sm font-semibold"
									>
										Continue This Conversation On Home Page
									</a>
								</div>
							{/if}
						{/if}
					</div>
				{/if}
			</section>
		</div>
	</section>
</div>
