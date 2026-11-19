<script lang="ts">
	import { Button, Card, Icon, PageHeader, Progress } from '#lib/components/ui/index.js';
	import HealthSummary from '#lib/components/HealthSummary.svelte';
	import RepoList from '#lib/components/RepoList.svelte';
	import RecentNotifications from '#lib/components/RecentNotifications.svelte';
	import { getRepos } from '#lib/api/repos.remote.js';
	import { formatBytes } from '#lib/format.js';

	const data = $derived(await getRepos());
	const totalSize = $derived(data.repos.reduce((s, r) => s + r.sizeBytes, 0));

	// show new connections and scan results without reloading
	$effect(() => {
		const timer = setInterval(() => void getRepos().refresh(), 10_000);
		return () => clearInterval(timer);
	});
</script>

<svelte:head><title>Dashboard · brgkpr</title></svelte:head>

<PageHeader
	title="Dashboard"
	description="Are your backups running? Updates live every 10 seconds."
>
	{#snippet actions()}
		{#if data.canCreate}
			<Button href="/repos/new"><Icon name="plus" class="size-4" />New repository</Button>
		{/if}
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-8">
	<HealthSummary repos={data.repos} />

	<section>
		<div class="mb-3 flex flex-wrap items-end justify-between gap-2">
			<h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
				Repositories <span class="ml-1 font-normal text-zinc-400">{data.repos.length}</span>
			</h2>
			{#if data.repos.length}
				<div class="flex items-center gap-3 text-xs text-zinc-500">
					<span class="flex items-center gap-1.5"
						><span class="size-2.5 rounded-sm bg-emerald-500"></span>Activity</span
					>
					<span class="flex items-center gap-1.5"
						><span class="size-2.5 rounded-sm bg-zinc-200 dark:bg-zinc-800"></span>None</span
					>
				</div>
			{/if}
		</div>

		{#if data.repos.length === 0}
			<Card>
				<div class="flex flex-col items-center py-10 text-center">
					<span
						class="grid size-12 place-items-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
					>
						<Icon name="database" class="size-6" />
					</span>
					<p class="mt-4 font-semibold">No repositories yet</p>
					{#if data.canCreate}
						<p class="mt-1 max-w-sm text-sm text-zinc-500">
							Create a borg or restic repository, add a key for your computer, then point your
							backup client at it.
						</p>
						<Button href="/repos/new" class="mt-5">
							<Icon name="plus" class="size-4" />Create repository
						</Button>
					{:else}
						<p class="mt-1 text-sm text-zinc-500">
							Repositories for your account are set up by an administrator.
						</p>
					{/if}
				</div>
			</Card>
		{:else}
			<RepoList repos={data.repos} />
		{/if}
	</section>

	<div class="grid gap-6 lg:grid-cols-3">
		<Card title="Storage" class="self-start">
			<p class="text-3xl font-semibold tracking-tight">{formatBytes(totalSize)}</p>
			<p class="mt-1 text-sm text-zinc-500">
				{data.storageLimit
					? `of ${formatBytes(data.storageLimit)} storage limit`
					: 'No storage limit'}
			</p>
			{#if data.storageLimit}
				<Progress class="mt-4" value={totalSize / data.storageLimit} label="Storage limit usage" />
				<p class="mt-2 text-xs text-zinc-500">
					{formatBytes(Math.max(0, data.storageLimit - totalSize))} free
				</p>
			{/if}
			{#if data.repos.length > 1}
				<ul class="mt-5 flex flex-col gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
					{#each [...data.repos].sort((a, b) => b.sizeBytes - a.sizeBytes) as r (r.id)}
						<li class="flex justify-between gap-3 text-sm">
							<span class="truncate text-zinc-600 dark:text-zinc-400">{r.name}</span>
							<span class="font-medium tabular-nums">{formatBytes(r.sizeBytes)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</Card>

		<RecentNotifications class="lg:col-span-2" limit={6} />
	</div>
</div>
