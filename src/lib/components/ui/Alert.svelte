<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tv, type VariantProps } from 'tailwind-variants';

	const alert = tv({
		base: 'rounded-xl border px-4 py-3 text-sm',
		variants: {
			tone: {
				info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200',
				success:
					'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200',
				warning:
					'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200',
				danger:
					'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200'
			}
		},
		defaultVariants: { tone: 'info' }
	});

	type Props = VariantProps<typeof alert> & { title?: string; class?: string; children: Snippet };

	let { tone, title, class: className, children }: Props = $props();
</script>

<div class={alert({ tone, class: className })} role={tone === 'danger' ? 'alert' : 'status'}>
	{#if title}<p class="mb-1 font-semibold">{title}</p>{/if}
	{@render children()}
</div>
