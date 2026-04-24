<script lang="ts">
	import './layout.css';
	import { updated } from '$app/state';

	let { children } = $props();

	// // $effect automatically runs whenever the reactive `updated` value changes to true
	// $effect(() => {
	// 	if (updated) {
	// 		if (confirm('A new version is available! Reload?')) {
	// 			window.location.reload();
	// 		}
	// 	}
	// });
</script>

{@render children()}