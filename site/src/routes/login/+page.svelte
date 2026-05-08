<script lang="ts">
	import LoginCard from '$lib/components/LoginCard.svelte';
	import type { PageProps } from '../$types';

	let { data }: PageProps = $props();
</script>

<LoginCard loginPrompt="" user={data.user} />
