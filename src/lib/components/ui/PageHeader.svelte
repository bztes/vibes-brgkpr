<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	interface Props {
		title: string;
		description?: string;
		actions?: Snippet;
		/** rendered next to the title, e.g. a status badge */
		badge?: Snippet;
		back?: { href: string; label: string };
	}

	let { title, description, actions, badge, back }: Props = $props();
</script>

<div class="mb-8 flex flex-wrap items-end justify-between gap-4">
	<div class="min-w-0">
		{#if back}
			<a
				href={back.href}
				class="mb-3 inline-flex items-center gap-1 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
			>
				<Icon name="chevron-left" class="size-4" />
				{back.label}
			</a>
		{/if}
		<div class="flex flex-wrap items-center gap-3">
			<h1 class="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
				{title}
			</h1>
			{@render badge?.()}
		</div>
		{#if description}
			<p class="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
		{/if}
	</div>
	{#if actions}<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>{/if}
</div>
