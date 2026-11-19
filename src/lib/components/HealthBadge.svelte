<script lang="ts" module>
	import type { HealthLevel } from '#lib/health.js';
	import type { IconName } from '#lib/components/ui/Icon.svelte';

	export const healthStyle: Record<
		HealthLevel,
		{ icon: IconName; text: string; bg: string; dot: string; tile: string }
	> = {
		ok: {
			icon: 'circle-check',
			text: 'text-emerald-600 dark:text-emerald-400',
			bg: 'bg-emerald-50 ring-emerald-200 text-emerald-700 dark:bg-emerald-950/50 dark:ring-emerald-900 dark:text-emerald-300',
			dot: 'bg-emerald-500',
			tile: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
		},
		warning: {
			icon: 'alert',
			text: 'text-amber-600 dark:text-amber-400',
			bg: 'bg-amber-50 ring-amber-200 text-amber-800 dark:bg-amber-950/50 dark:ring-amber-900 dark:text-amber-300',
			dot: 'bg-amber-500',
			tile: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
		},
		error: {
			icon: 'circle-x',
			text: 'text-red-600 dark:text-red-400',
			bg: 'bg-red-50 ring-red-200 text-red-700 dark:bg-red-950/50 dark:ring-red-900 dark:text-red-300',
			dot: 'bg-red-500',
			tile: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400'
		},
		pending: {
			icon: 'circle-dashed',
			text: 'text-zinc-400 dark:text-zinc-500',
			bg: 'bg-zinc-50 ring-zinc-200 text-zinc-600 dark:bg-zinc-800/60 dark:ring-zinc-700 dark:text-zinc-300',
			dot: 'bg-zinc-400',
			tile: 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'
		}
	};

	export const runningTile = 'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400';
</script>

<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { Health } from '#lib/health.js';

	interface Props {
		health: Health;
		/** a backup connection is open right now */
		running?: boolean;
		size?: 'sm' | 'lg';
	}

	let { health, running = false, size = 'sm' }: Props = $props();
	const style = $derived(healthStyle[health.level]);
</script>

<span
	class={[
		'inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ring-1 ring-inset',
		size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs',
		running
			? 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-900'
			: style.bg
	]}
	title={running ? 'A client is connected right now' : health.detail}
>
	{#if running}
		<span class="relative flex size-2">
			<span class="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-75"
			></span>
			<span class="relative inline-flex size-2 rounded-full bg-sky-500"></span>
		</span>
		Backup running
	{:else}
		<Icon name={style.icon} class={size === 'lg' ? 'size-4' : 'size-3.5'} strokeWidth={2.25} />
		{health.label}
	{/if}
</span>
