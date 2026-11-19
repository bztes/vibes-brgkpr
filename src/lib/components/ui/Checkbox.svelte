<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = HTMLInputAttributes & { label: string; hint?: string };

	let { label, hint, class: className, ...rest }: Props = $props();
</script>

<label class={['flex items-start gap-3', className]}>
	<input
		class="mt-0.5 size-4 rounded border-zinc-300 accent-emerald-600 dark:border-zinc-600"
		{...rest}
	/>
	<span class="flex flex-col">
		<span class="text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
		{#if hint}<span class="text-xs text-zinc-500 dark:text-zinc-400">{hint}</span>{/if}
	</span>
</label>
