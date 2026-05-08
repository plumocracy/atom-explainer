<script lang="ts">
import Plus from '@lucide/svelte/icons/plus';
import X from '@lucide/svelte/icons/x';

	let {
		onClose,
		onNewConversation,
		onToggleHistory,
		newConversationDisabled = false,
		historyDisabled = false,
		historyActive = false
	}: {
		onClose: () => void;
		onNewConversation: () => void | Promise<unknown>;
		onToggleHistory: () => void;
		newConversationDisabled?: boolean;
		historyDisabled?: boolean;
		historyActive?: boolean;
	} = $props();
</script>

<div class="border-b border-[var(--museum-stroke)] px-4 py-3 md:px-5">
	<div class="flex items-center justify-between gap-3">
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--museum-subtext)] transition hover:cursor-pointer hover:bg-[rgba(44,61,75,0.06)] disabled:cursor-not-allowed disabled:opacity-60"
				onclick={onNewConversation}
				disabled={newConversationDisabled}
				aria-label="New conversation"
				title="New conversation"
			>
				<Plus class="text-xl" />
			</button>

			<button
				type="button"
				class="rounded-full px-3 py-1.5 text-xs font-semibold transition hover:cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 {historyActive
					? 'border border-[rgba(44,61,75,0.22)] bg-[rgba(44,61,75,0.1)] text-[var(--museum-text)]'
					: 'border border-[transparent] text-[var(--museum-subtext)] hover:bg-[rgba(44,61,75,0.06)]'}"
				onclick={onToggleHistory}
				disabled={historyDisabled}
			>
				History
			</button>
		</div>

		<button
			type="button"
			class="museum-button rounded-full p-2 text-xl hover:cursor-pointer"
			onclick={onClose}
			aria-label="Close commentary panel"
		>
			<X />
		</button>
	</div>
</div>
