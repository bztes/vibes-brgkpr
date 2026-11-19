<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tv } from 'tailwind-variants';

	const field = tv({
		slots: {
			root: 'flex flex-col gap-1.5',
			label: 'text-sm font-medium text-zinc-800 dark:text-zinc-200',
			hint: 'text-xs text-zinc-500 dark:text-zinc-400',
			issue: 'text-xs font-medium text-red-600 dark:text-red-400'
		}
	});

	interface Props {
		label: string;
		hint?: string;
		issues?: { message: string }[];
		class?: string;
		children: Snippet;
	}

	let { label, hint, issues, class: className, children }: Props = $props();
	const s = field();
</script>

<label class={s.root({ class: className })}>
	<span class={s.label()}>{label}</span>
	{@render children()}
	{#if issues?.length}
		{#each issues as issue (issue.message)}
			<span class={s.issue()}>{issue.message}</span>
		{/each}
	{:else if hint}
		<span class={s.hint()}>{hint}</span>
	{/if}
</label>
