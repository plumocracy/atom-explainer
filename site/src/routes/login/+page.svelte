<script lang="ts">
	import LoginCard from '$lib/components/login_card.svelte';
	import { onMount } from 'svelte';
	import type { PageProps } from '../$types';

	let { data }: PageProps = $props();

	let { user, chatEnabled } = data;
</script>

<LoginCard loginPrompt="" {user} />
