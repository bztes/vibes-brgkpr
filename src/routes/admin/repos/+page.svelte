<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button, Card, Icon, PageHeader, Select } from '#lib/components/ui/index.js';
	import HealthSummary from '#lib/components/HealthSummary.svelte';
	import RepoList from '#lib/components/RepoList.svelte';
	import { getAllRepos, getUsers } from '#lib/api/admin.remote.js';
	import { formatBytes } from '#lib/format.js';

	const repos = $derived(await getAllRepos());
	const users = $derived(await getUsers());

	const userFilter = $derived(page.url.searchParams.get('user') ?? '');
	const filtered = $derived(userFilter ? repos.filter((r) => r.owner.id === userFilter) : repos);
	const totalSize = $derived(filtered.reduce((s, r) => s + r.sizeBytes, 0));

	$effect(() => {
		const timer = setInterval(() => void getAllRepos().refresh(), 10_000);
		return () => clearInterval(timer);
	});

	function setFilter(id: string) {
		goto(id ? `?user=${encodeURIComponent(id)}` : '?', { replace: true, reset: false });
	}
</script>

<svelte:head><title>Repositories · brgkpr</title></svelte:head>

<PageHeader
	title="Repositories"
	description="Backup health across every user. Open a repository to manage it."
>
	{#snippet actions()}
		<Select
			value={userFilter}
			onchange={(e) => setFilter(e.currentTarget.value)}
			aria-label="Filter by owner"
			class="w-auto"
		>
			<option value="">All users</option>
			{#each users as u (u.id)}
				<option value={u.id}>{u.name} ({u.repos})</option>
			{/each}
		</Select>
		<Button href={userFilter ? `/repos/new?owner=${userFilter}` : '/repos/new'}>
			<Icon name="plus" class="size-4" />New repository
		</Button>
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-6">
	<HealthSummary repos={filtered} />

	<div>
		<p class="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
			{filtered.length}
			{filtered.length === 1 ? 'repository' : 'repositories'} · {formatBytes(totalSize)} total
		</p>
		{#if filtered.length === 0}
			<Card>
				<p class="py-8 text-center text-sm text-zinc-500">No repositories.</p>
			</Card>
		{:else}
			<RepoList repos={filtered} showOwner />
		{/if}
	</div>
</div>
