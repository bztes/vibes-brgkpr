<script lang="ts" module>
	import type { Activity } from '#lib/server/connections.js';
	import type { HealthInput } from '#lib/health.js';

	export interface RepoListItem extends HealthInput {
		id: string;
		name: string;
		description: string | null;
		connectionCount: number;
		activity: Activity[];
		owner?: { id: string; name: string };
	}
</script>

<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import { Progress } from '#lib/components/ui/index.js';
	import HealthBadge, { healthStyle, runningTile } from '#lib/components/HealthBadge.svelte';
	import ActivityStrip from '#lib/components/ActivityStrip.svelte';
	import { backupDeadline, repoHealth, severity } from '#lib/health.js';
	import { formatBytes, formatDateTime, formatRelative, formatSpan } from '#lib/format.js';

	interface Props {
		repos: RepoListItem[];
		showOwner?: boolean;
	}

	let { repos, showOwner = false }: Props = $props();

	const rows = $derived(
		repos
			.map((repo) => ({ repo, health: repoHealth(repo) }))
			.sort(
				(a, b) =>
					severity[a.health.level] - severity[b.health.level] ||
					a.repo.name.localeCompare(b.repo.name)
			)
	);

	function due(repo: RepoListItem) {
		const deadline = backupDeadline(repo);
		if (!deadline) return null;
		const ms = deadline.getTime() - Date.now();
		return ms < 0
			? { late: true, text: `overdue by ${formatSpan(ms)}` }
			: { late: false, text: `next due within ${formatSpan(ms)}` };
	}
</script>

<ul
	class="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/60"
>
	{#each rows as { repo, health } (repo.id)}
		{@const d = due(repo)}
		{@const style = healthStyle[health.level]}
		<li>
			<a
				href="/repos/{repo.id}"
				class="group grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-zinc-50 sm:px-5 md:grid-cols-[auto_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] dark:hover:bg-zinc-800/40"
			>
				<span
					class={[
						'grid size-10 place-items-center rounded-xl',
						repo.connectionCount ? runningTile : style.tile
					]}
				>
					<Icon
						name={repo.connectionCount ? 'refresh' : style.icon}
						class={['size-5', repo.connectionCount && 'animate-spin [animation-duration:3s]']}
					/>
				</span>

				<div class="min-w-0">
					<p class="flex flex-wrap items-center gap-x-2 gap-y-1">
						<span class="truncate font-semibold text-zinc-900 dark:text-zinc-100">{repo.name}</span>
						<HealthBadge {health} running={repo.connectionCount > 0} />
					</p>
					<p class="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
						{#if showOwner && repo.owner}
							<span class="font-medium text-zinc-700 dark:text-zinc-300">{repo.owner.name}</span
							>{repo.description ? ' · ' : ''}
						{/if}
						{#if health.level !== 'ok'}
							{health.detail}
						{:else}
							{repo.description ?? ''}
						{/if}
					</p>
				</div>

				<Icon
					name="chevron-right"
					class="size-5 text-zinc-300 transition-transform group-hover:translate-x-0.5 md:order-last dark:text-zinc-600"
				/>

				<div class="col-span-3 hidden md:col-span-1 md:block">
					<ActivityStrip activity={repo.activity} lastBackupAt={repo.lastBackupAt} />
					<p class="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">Last 14 days</p>
				</div>

				<div class="col-span-3 col-start-2 md:col-span-1 md:col-start-auto">
					<p
						class="text-sm font-medium text-zinc-900 dark:text-zinc-100"
						title={formatDateTime(repo.lastBackupAt)}
					>
						{repo.lastBackupAt ? `Backup ${formatRelative(repo.lastBackupAt)}` : 'No backup yet'}
					</p>
					{#if d}
						<p
							class={[
								'text-xs',
								d.late ? 'font-medium text-red-600 dark:text-red-400' : 'text-zinc-500'
							]}
						>
							{d.text}
						</p>
					{/if}
				</div>

				<div class="col-span-3 col-start-2 md:col-span-1 md:col-start-auto">
					<div class="flex items-baseline justify-between gap-2 text-xs">
						<span class="font-medium text-zinc-900 dark:text-zinc-100"
							>{formatBytes(repo.sizeBytes)}</span
						>
						<span class="text-zinc-500">
							{repo.quota ? `of ${formatBytes(repo.quota)}` : 'no quota'}
						</span>
					</div>
					{#if repo.quota}
						<Progress
							class="mt-1.5"
							value={repo.sizeBytes / repo.quota}
							label="Quota usage {repo.name}"
						/>
					{/if}
				</div>
			</a>
		</li>
	{/each}
</ul>
