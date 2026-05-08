<script lang="ts">
	let { onSignIn }: { onSignIn: () => void } = $props();
</script>

<div class="flex h-full w-full items-center justify-center px-6">
	<div
		class="max-w-sm rounded-xl border border-[var(--museum-stroke)] bg-[rgba(255,255,255,0.58)] p-6 text-center"
	>
		<h2 class="mt-2 text-3xl">Sign in to chat</h2>
		<p class="mt-3 text-sm text-[var(--museum-subtext)]">
			Authenticated users can chat with our assistant.
		</p>
		<button
			type="button"
			class="museum-button mt-5 rounded-full px-5 py-2 text-sm font-semibold hover:cursor-pointer"
			onclick={onSignIn}
		>
			Sign in
		</button>
	</div>
</div>
