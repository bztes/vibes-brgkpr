<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tv } from 'tailwind-variants';

	const card = tv({
		slots: {
			root: 'rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60',
			header: 'flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-4',
			title: 'text-[15px] font-semibold text-zinc-900 dark:text-zinc-100',
			description: 'mt-1 text-sm text-zinc-500 dark:text-zinc-400',
			body: 'px-5 pb-5'
		},
		variants: {
			tone: {
				default: {},
				danger: {
					root: 'border-red-200 dark:border-red-900/60',
					title: 'text-red-700 dark:text-red-400'
				}
			},
			flush: { true: { body: 'p-0' } },
			headless: { true: { body: 'pt-5' } }
		},
		compoundVariants: [{ flush: true, headless: true, class: { body: 'p-0' } }],
		defaultVariants: { tone: 'default' }
	});

	interface Props {
		title?: string;
		description?: string;
		tone?: 'default' | 'danger';
		flush?: boolean;
		class?: string;
		id?: string;
		actions?: Snippet;
		children: Snippet;
	}

	let {
		title,
		description,
		tone,
		flush,
		class: className,
		id,
		actions,
		children
	}: Props = $props();
	const s = $derived(card({ tone, flush, headless: !title && !actions }));
</script>

<section class={s.root({ class: className })} {id}>
	{#if title || actions}
		<header class={s.header()}>
			<div class="min-w-0">
				{#if title}<h2 class={s.title()}>{title}</h2>{/if}
				{#if description}<p class={s.description()}>{description}</p>{/if}
			</div>
			{#if actions}<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>{/if}
		</header>
	{/if}
	<div class={s.body()}>
		{@render children()}
	</div>
</section>
