<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { updated } from '$app/state'; // Use SvelteKit's built-in update store

	let { children } = $props();

	onMount(() => {
		// When SvelteKit detects a new version from the Service Worker
		if (updated.current) {
			if (confirm('A new version is available! Reload?')) {
				window.location.reload();
			}
		}
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}