<script lang="ts">
	import type { Activity } from '#lib/server/connections.js';

	interface Props {
		activity: Activity[];
		lastBackupAt: Date | null;
		days?: number;
		/** larger bars with weekday labels */
		detailed?: boolean;
		class?: string;
	}

	let { activity, lastBackupAt, days = 14, detailed = false, class: className }: Props = $props();

	type DayState = 'active' | 'running' | 'none';

	const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

	const buckets = $derived.by(() => {
		const now = new Date();
		const list = Array.from({ length: days }, (_, i) => ({
			date: new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i)),
			sessions: 0,
			running: 0,
			backup: false
		}));
		const byKey = new Map(list.map((b) => [dayKey(b.date), b]));
		for (const a of activity) {
			const b = byKey.get(dayKey(a.startedAt));
			if (!b) continue;
			if (!a.endedAt) b.running++;
			else b.sessions++;
		}
		// sessions may only read (e.g. restore, check); only the scan knows when data was written
		if (lastBackupAt) {
			const b = byKey.get(dayKey(lastBackupAt));
			if (b) b.backup = true;
		}
		return list.map((b) => {
			const state: DayState = b.running ? 'running' : b.sessions || b.backup ? 'active' : 'none';
			const parts = [
				b.backup && 'last backup',
				b.sessions && `${b.sessions} ${b.sessions === 1 ? 'session' : 'sessions'}`,
				b.running && 'running now'
			].filter(Boolean);
			const day = b.date.toLocaleDateString('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric'
			});
			return {
				key: dayKey(b.date),
				date: b.date,
				state,
				title: `${day}: ${parts.length ? parts.join(', ') : 'no activity'}`
			};
		});
	});

	const color: Record<DayState, string> = {
		active: 'bg-emerald-500 dark:bg-emerald-500',
		running: 'bg-sky-500 animate-pulse',
		none: 'bg-zinc-200 dark:bg-zinc-800'
	};
</script>

<div class={['flex flex-col gap-1.5', className]}>
	<ol
		class={['flex items-end', detailed ? 'h-10 gap-1' : 'h-6 gap-[3px]']}
		aria-label="Backup activity in the last {days} days"
	>
		{#each buckets as b (b.key)}
			<li
				class={[
					'flex-1 rounded-[3px] transition-opacity hover:opacity-75',
					detailed ? 'min-w-1.5' : 'max-w-2 min-w-1',
					color[b.state],
					b.state === 'none' ? 'h-1/3' : 'h-full'
				]}
				title={b.title}
			>
				<span class="sr-only">{b.title}</span>
			</li>
		{/each}
	</ol>
	{#if detailed}
		<div class="flex justify-between text-[11px] text-zinc-400 dark:text-zinc-500">
			<span>{days} days ago</span>
			<span>Today</span>
		</div>
	{/if}
</div>
