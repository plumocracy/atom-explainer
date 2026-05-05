<script lang="ts">
	import './layout.css';
	import ToastViewport from '$lib/components/ToastViewport.svelte';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href="favicon.png" /></svelte:head>
{@render children()}
<ToastViewport />
