<script lang="ts">
	import Icon from '@iconify/svelte';
	import { signOut } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { orbitalState } from '$lib/stores/obital.svelte';
	import type { ModelResponse } from '$lib/server/openrouter';

	let { show_chat, user, do_close, form }: { show_chat: boolean; user; do_close: () => void } =
		$props();

	let textarea: HTMLTextAreaElement;
	let wrapper: HTMLDivElement;
	let pushElement: HTMLDivElement;

	let pushElementHidden = $state<boolean>(false);

	let messageSent = $state<boolean>(false);

	let responses = $state<ModelResponse[]>();

	const promptMessages: string[] = [
		'What do you want to learn today?',
		'Ready to get quantum?',
		'Are you bohr-ed yet?'
	];

	function resize() {
		textarea.style.height = '0px';
		const newHeight = Math.max(textarea.scrollHeight, 40);
		textarea.style.height = newHeight + 'px';
		wrapper.style.height = newHeight + 16 + 'px';
	}

	async function handleSignOut() {
		await signOut();
		// Reload page after signout
		window.location.reload();
	}
</script>

<div class="flex h-full w-full flex-col space-y-4 text-zinc-300">
	<div
		class="transition-100 flex h-16 w-full flex-row transition-opacity {show_chat
			? 'opacity-100'
			: 'opacity-0'}"
	>
		{#if user}
			<div class="flex flex-row space-x-4">
				<image src={user.image} class="my-auto ml-5 h-8 rounded-full"></image>
				<button
					class="text-md my-auto flex hover:cursor-pointer hover:text-zinc-100"
					onclick={handleSignOut}
				>
					Sign Out
				</button>
			</div>
		{:else}
			<div class="my-auto ml-5 flex text-xl">
				<button class="hover:cursor-pointer hover:text-zinc-100" onclick={() => goto('/login')}>
					<span>Sign In</span>
				</button>
			</div>
		{/if}

		<button
			class="my-auto mr-4 ml-auto text-4xl hover:cursor-pointer hover:text-zinc-100"
			onclick={do_close}
		>
			<Icon icon="ic:baseline-close"></Icon>
		</button>
	</div>

	<div
		class="flex h-full w-full flex-col bg-zinc-900 px-4 pb-4 text-zinc-300 transition-opacity duration-400"
	>
		<!-- Element used to achieve smooth transition of message box, get's removed from DOM 
		 after animation concludes. -->
		<div
			bind:this={pushElement}
			class="transition-all duration-300 ease-in-out {messageSent ? 'flex-1' : 'flex-[0.5]'}"
			ontransitionend={() => {
				pushElement.style.visibility = 'hidden';
				pushElementHidden = true;
			}}
		></div>

		<!-- Response Div -->

		{#if pushElementHidden}
			<div class="mb-4 h-full w-full"></div>
		{/if}

		<!-- Message Box and animation harness -->
		<div class="flex flex-col gap-3">
			{#if !pushElementHidden}
				<div
					class="mb-10 transition-all duration-100 ease-in-out {messageSent
						? 'pointer-events-none overflow-hidden opacity-0'
						: 'opacity-100'}"
				>
					<h1 class="text-center text-2xl">
						{promptMessages[Math.floor(Math.random() * promptMessages.length)]}
					</h1>
				</div>
			{/if}

			<div
				bind:this={wrapper}
				style="height: 56px"
				class="flex w-full gap-2 overflow-hidden rounded-3xl bg-zinc-800 p-2 text-zinc-300 transition-[height] duration-100 ease-out"
			>
				<form class="flex w-full" method="POST" action="?/chat" use:enhance>
					<textarea
						bind:this={textarea}
						oninput={resize}
						onkeyup={resize}
						name="message"
						rows="1"
						placeholder="Ask Atom AI"
						class="ring-none flex-1 resize-none overflow-hidden border-none bg-transparent px-3 py-2 outline-none placeholder:text-zinc-500 focus:ring-0"
					></textarea>
					<button
						class="mt-auto flex h-full items-center justify-center rounded-full text-5xl hover:cursor-pointer hover:text-zinc-100"
						type="submit"
						onclick={() => {
							messageSent = true;
						}}
						onsubmit={() => {
							textarea.value = '';
						}}
					>
						<Icon icon="iconamoon:arrow-up-5-circle-fill"></Icon>
					</button>
				</form>
			</div>
			<div class="mx-auto flex text-red-500">
				{#if form?.error}
					<p class="">{form?.error}</p>
				{/if}

				{#if form?.missing}
					<p class="">{form?.missing}</p>
				{/if}
			</div>

			<div
				class="transition-all duration-300 ease-in-out {messageSent ? 'flex-[0]' : 'flex-[0.5]'}"
			></div>
		</div>
	</div>
</div>
