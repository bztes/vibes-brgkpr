<script lang="ts">
	import { button } from './button.js';

	interface Props {
		value: string;
		label?: string;
		multiline?: boolean;
	}

	let { value, label, multiline = false }: Props = $props();
	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// clipboard not available (e.g. plain http) – the text can still be selected
		}
	}
</script>

<div class="flex flex-col gap-1.5">
	{#if label}<span class="text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</span>{/if}
	<div class="flex items-start gap-2">
		<code
			class={[
				'min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200',
				multiline ? 'break-all whitespace-pre-wrap' : 'overflow-x-auto whitespace-nowrap'
			]}>{value}</code
		>
		<button type="button" class={button({ variant: 'secondary', size: 'sm' })} onclick={copy}>
			{copied ? 'Copied' : 'Copy'}
		</button>
	</div>
</div>
