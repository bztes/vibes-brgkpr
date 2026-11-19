<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { input } from './input.js';

	let { class: className, ...rest }: HTMLInputAttributes = $props();
</script>

<input class={input({ class: className as string })} {...rest} />
