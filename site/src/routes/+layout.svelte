<script lang="ts">
	import './layout.css';
	import 'katex/dist/katex.min.css';
	import { onNavigate } from '$app/navigation';
	import { onMount } from 'svelte';
	import ToastViewport from '$lib/components/ToastViewport.svelte';

	let { children } = $props();
	let initialLoadVisible = $state(false);

	onMount(() => {
		requestAnimationFrame(() => {
			initialLoadVisible = true;
		});
	});

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

<svelte:head><link rel="icon" href="favicon.png" /></svelte:head>
<div class:initial-load-visible={initialLoadVisible} class="initial-load-shell">
	{@render children()}
</div>
<ToastViewport />

<style>
	.initial-load-shell {
		opacity: 0;
	}

	.initial-load-shell.initial-load-visible {
		animation: page-fade-in 660ms ease forwards;
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
