<script lang="ts">
	import './layout.css';
	import { onNavigate } from '$app/navigation';
	import ToastViewport from '$lib/components/ToastViewport.svelte';

	let { children } = $props();

	onNavigate((navigation) => {
		if (!document.startViewTransition) {
			return;
		}

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
	/>

	<link rel="manifest" href="/manifest.json" crossorigin="use-credentials" />
</svelte:head>

<div class="initial-load-shell">
	{@render children()}
</div>
<ToastViewport />

<style>
	.initial-load-shell {
		opacity: 1;
	}

	:global(::view-transition-old(root)) {
		animation: page-fade-out 180ms ease;
	}

	:global(::view-transition-new(root)) {
		animation: page-fade-in 180ms ease;
	}

	@keyframes page-fade-out {
		from {
			opacity: 1;
		}

		to {
			opacity: 0;
		}
	}

	@keyframes page-fade-in {
		from {
			opacity: 0;
		}

		to {
			opacity: 1;
		}
	}
</style>
