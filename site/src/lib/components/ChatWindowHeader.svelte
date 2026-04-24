<script lang="ts">
	import Icon from '@iconify/svelte';

	type ChatUser = {
		name?: string | null;
		image?: string | null;
	};

	let { user, onClose }: { user: ChatUser; onClose: () => void } = $props();
</script>

<div class="border-b border-[var(--museum-stroke)] px-4 py-3 md:px-5">
	<div class="flex items-center gap-3">
		{#if user.image}
			<img src={user.image} alt="profile" class="h-10 w-10 rounded-full border border-[var(--museum-stroke)] object-cover" />
		{:else}
			<div class="h-10 w-10 rounded-full border border-[var(--museum-stroke)] bg-[rgba(202,186,164,0.45)]"></div>
		{/if}

		<div class="mr-auto min-w-0">
			<p class="museum-kicker">Curator Channel</p>
			<p class="truncate text-sm font-semibold">{user.name ?? 'Guest Scholar'}</p>
		</div>

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
