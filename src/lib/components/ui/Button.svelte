<script lang="ts">
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import { button, type ButtonVariants } from './button.js';

	type Props = ButtonVariants &
		((HTMLButtonAttributes & { href?: undefined }) | (HTMLAnchorAttributes & { href: string }));

	let { variant, size, class: className, children, ...rest }: Props = $props();
</script>

{#if rest.href !== undefined}
	<a
		class={button({ variant, size, class: className as string })}
		{...rest as HTMLAnchorAttributes}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		class={button({ variant, size, class: className as string })}
		{...rest as HTMLButtonAttributes}
	>
		{@render children?.()}
	</button>
{/if}
