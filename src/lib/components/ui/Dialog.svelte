<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tv } from 'tailwind-variants';

	const dialog = tv({
		slots: {
			root: [
				'm-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl',
				'backdrop:bg-zinc-950/50 backdrop:backdrop-blur-[1px]',
				'dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'
			],
			header:
				'flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800',
			title: 'text-base font-semibold',
			description: 'mt-0.5 text-sm text-zinc-500 dark:text-zinc-400',
			close:
				'-mt-1 -mr-2 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200',
			body: 'px-5 py-5'
		}
	});

	interface Props {
		open: boolean;
		title: string;
		description?: string;
		class?: string;
		children: Snippet;
	}

	let { open = $bindable(), title, description, class: className, children }: Props = $props();
	const s = dialog();

	function sync(node: HTMLDialogElement) {
		if (open && !node.open) node.showModal();
		else if (!open && node.open) node.close();
	}
</script>

<dialog
	class={s.root({ class: className })}
	{@attach (node) => sync(node)}
	onclose={() => (open = false)}
	onclick={(e) => {
		// clicks on the backdrop target the dialog element itself
		if (e.target === e.currentTarget) open = false;
	}}
>
	{#if open}
		<header class={s.header()}>
			<div>
				<h2 class={s.title()}>{title}</h2>
				{#if description}<p class={s.description()}>{description}</p>{/if}
			</div>
			<button type="button" class={s.close()} aria-label="Close" onclick={() => (open = false)}>
				<svg viewBox="0 0 20 20" fill="currentColor" class="size-5" aria-hidden="true">
					<path
						d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
					/>
				</svg>
			</button>
		</header>
		<div class={s.body()}>
			{@render children()}
		</div>
	{/if}
</dialog>
