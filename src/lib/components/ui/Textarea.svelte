<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import { input } from './input.js';

	let { class: className, ...rest }: HTMLTextareaAttributes = $props();
</script>

<textarea class={input({ kind: 'textarea', class: className as string })} {...rest}></textarea>
