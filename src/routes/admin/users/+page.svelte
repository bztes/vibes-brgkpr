<script lang="ts">
	import { Badge, Button, Card, Icon, PageHeader, Progress } from '#lib/components/ui/index.js';
	import { getUsers } from '#lib/api/admin.remote.js';
	import { getMe } from '#lib/api/auth.remote.js';
	import { formatBytes, formatDateTime } from '#lib/format.js';

	const users = $derived(await getUsers());
	const me = $derived(await getMe());
</script>

<svelte:head><title>Users · brgkpr</title></svelte:head>

<PageHeader title="Users" description="Manage accounts, roles and storage limits.">
	{#snippet actions()}
		<Button href="/admin/users/new"><Icon name="plus" class="size-4" />New user</Button>
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-4">
	{#each users as u (u.id)}
		<Card>
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="flex min-w-0 items-center gap-3">
					<span
						class={[
							'grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold uppercase',
							u.disabled
								? 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800'
								: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
						]}>{u.name.slice(0, 1)}</span
					>
					<div class="min-w-0">
						<p class="flex flex-wrap items-center gap-2 font-semibold">
							<a href="/admin/users/{u.id}" class="truncate hover:underline">{u.name}</a>
							{#if u.role === 'admin'}<Badge tone="info">Admin</Badge>{/if}
							{#if u.disabled}<Badge tone="danger">Disabled</Badge>{/if}
							{#if u.role !== 'admin' && !u.permissions.includes('repo:create')}
								<Badge tone="warning">Can't create repos</Badge>
							{/if}
							{#if u.id === me?.id}<Badge>You</Badge>{/if}
						</p>
						<p class="text-xs text-zinc-500">
							{u.username ? `${u.email} · ` : ''}since {formatDateTime(u.createdAt)}
						</p>
					</div>
				</div>
				<div class="flex flex-wrap items-center gap-6">
					<dl class="flex gap-6 text-sm">
						<div>
							<dt class="text-xs text-zinc-500">Repos</dt>
							<dd class="font-medium">
								<a href="/admin/repos?user={u.id}" class="hover:underline">{u.repos}</a>
							</dd>
						</div>
						<div>
							<dt class="text-xs text-zinc-500">Keys</dt>
							<dd class="font-medium">{u.keys}</dd>
						</div>
						<div>
							<dt class="text-xs text-zinc-500">Used</dt>
							<dd class="font-medium">
								{formatBytes(u.sizeBytes)}{#if u.storageLimit}
									<span class="font-normal text-zinc-500">
										/ {formatBytes(u.storageLimit)}</span
									>{/if}
							</dd>
						</div>
					</dl>
					<Button size="sm" variant="secondary" href="/admin/users/{u.id}">Edit</Button>
				</div>
			</div>
			{#if u.storageLimit}
				<Progress
					class="mt-4"
					value={u.sizeBytes / u.storageLimit}
					label="Storage used by {u.name}"
				/>
			{/if}
		</Card>
	{/each}
</div>
