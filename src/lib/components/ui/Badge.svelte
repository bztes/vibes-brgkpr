<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tv, type VariantProps } from 'tailwind-variants';

	const badge = tv({
		base: 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
		variants: {
			tone: {
				neutral:
					'bg-zinc-50 text-zinc-700 ring-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-300 dark:ring-zinc-700',
				success:
					'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900',
				warning:
					'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900',
				danger:
					'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900',
				info: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-900'
			},
			dot: {
				true: "before:size-1.5 before:rounded-full before:bg-current before:content-['']"
			}
		},
		defaultVariants: { tone: 'neutral' }
	});

	type Props = VariantProps<typeof badge> & { class?: string; children: Snippet };

	let { tone, dot, class: className, children }: Props = $props();
</script>

<span class={badge({ tone, dot, class: className })}>{@render children()}</span>
