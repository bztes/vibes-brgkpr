<script lang="ts">
	import type { HTMLSelectAttributes } from 'svelte/elements';
	import { input } from './input.js';

	let { class: className, children, ...rest }: HTMLSelectAttributes = $props();
</script>

<select class={input({ kind: 'select', class: className as string })} {...rest}>
	{@render children?.()}
</select>
