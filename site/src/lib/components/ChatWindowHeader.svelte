<script lang="ts">
	import Icon from '@iconify/svelte';

	let {
		onClose,
		onNewConversation,
		newConversationDisabled = false
	}: {
		onClose: () => void;
		onNewConversation: () => void;
		newConversationDisabled?: boolean;
	} = $props();
</script>

<div class="border-b border-[var(--museum-stroke)] px-4 py-3 md:px-5">
	<div class="flex items-center justify-between gap-3">

		<button
			type="button"
			class="museum-button rounded-full px-3 py-1.5 text-xs font-semibold hover:cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
			onclick={onNewConversation}
			disabled={newConversationDisabled}
		>
			New conversation
		</button>

		<button
			type="button"
			class="museum-button rounded-full p-2 text-xl hover:cursor-pointer"
			onclick={onClose}
			aria-label="Close commentary panel"
		>
			<Icon icon="material-symbols:close" />
		</button>
	</div>
</div>
