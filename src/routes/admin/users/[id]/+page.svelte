<script lang="ts">
	import {
		Alert,
		Badge,
		Button,
		Card,
		Checkbox,
		Field,
		Icon,
		Input,
		PageHeader,
		Progress,
		Select
	} from '#lib/components/ui/index.js';
	import { deleteUser, getUser, resetPassword, updateUser } from '#lib/api/admin.remote.js';
	import { getMe } from '#lib/api/auth.remote.js';
	import { PERMISSIONS, permissionKeys } from '#lib/permissions.js';
	import { bytesToGb, formatBytes, formatDateTime } from '#lib/format.js';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();

	const u = $derived(await getUser(params.id));
	const me = $derived(await getMe());
	const isMe = $derived(u.id === me?.id);
	const upd = $derived(updateUser.for(u.id));
	const pw = $derived(resetPassword.for(u.id));
	const del = $derived(deleteUser.for(u.id));
	const back = { href: '/admin/users', label: 'Users' };
</script>

<svelte:head><title>{u.name} · brgkpr</title></svelte:head>

<PageHeader
	title={u.name}
	description="{u.username ? `${u.email} · ` : ''}since {formatDateTime(u.createdAt)}"
	{back}
>
	{#snippet badge()}
		{#if u.role === 'admin'}<Badge tone="info">Admin</Badge>{/if}
		{#if u.disabled}<Badge tone="danger">Disabled</Badge>{/if}
		{#if isMe}<Badge>You</Badge>{/if}
	{/snippet}
	{#snippet actions()}
		<Button variant="secondary" href="/admin/repos?user={u.id}">
			All Repositories ({u.repos})
		</Button>
		<Button href="/repos/new?owner={u.id}"><Icon name="plus" class="size-4" />New repository</Button
		>
	{/snippet}
</PageHeader>

<div class="grid gap-6 lg:grid-cols-2">
	<Card title="Account" description="Role, permissions and storage." class="self-start">
		<form {...upd} class="flex flex-col gap-4">
			<input {...upd.fields.id.as('hidden', u.id)} />
			{#each upd.fields.allIssues() ?? [] as issue (issue.message)}
				{#if !issue.path.length}<Alert tone="danger">{issue.message}</Alert>{/if}
			{/each}
			{#if upd.result?.saved && !upd.pending}<Alert tone="success">Saved.</Alert>{/if}
			<Field label="Role">
				<Select {...upd.fields.role.as('select', u.role)}>
					<option value="user">User</option>
					<option value="admin">Administrator</option>
				</Select>
			</Field>
			<Field
				label="Storage limit in GB"
				hint="Sum of all repo quotas. Empty = unlimited"
				issues={upd.fields.storageLimitGb.issues()}
			>
				<Input
					{...upd.fields.storageLimitGb.as('number', bytesToGb(u.storageLimit))}
					min="0"
					step="1"
				/>
			</Field>
			{#each permissionKeys as p (p)}
				<Checkbox
					{...upd.fields.permissions.as('checkbox', p, u.permissions.includes(p))}
					label={PERMISSIONS[p].label}
					hint="{PERMISSIONS[p].hint} Administrators always have this permission."
				/>
			{/each}
			<Checkbox
				{...upd.fields.disabled.as('checkbox', u.disabled)}
				label="Disable account"
				hint="Blocks login and backup access"
			/>
			<Button class="self-start" disabled={!!upd.pending}>Save</Button>
		</form>
	</Card>

	<div class="flex flex-col gap-6">
		<Card title="Usage">
			<dl class="flex gap-6 text-sm">
				<div>
					<dt class="text-xs text-zinc-500">Repos</dt>
					<dd class="font-medium">{u.repos}</dd>
				</div>
				<div>
					<dt class="text-xs text-zinc-500">Keys</dt>
					<dd class="font-medium">{u.keys}</dd>
				</div>
				<div>
					<dt class="text-xs text-zinc-500">Used</dt>
					<dd class="font-medium">
						{formatBytes(u.sizeBytes)}{#if u.storageLimit}
							<span class="font-normal text-zinc-500"> / {formatBytes(u.storageLimit)}</span>{/if}
					</dd>
				</div>
			</dl>
			{#if u.storageLimit}
				<Progress
					class="mt-4"
					value={u.sizeBytes / u.storageLimit}
					label="Storage used by {u.name}"
				/>
			{/if}
		</Card>

		<Card title="Password" description="Setting a new password signs the user out everywhere.">
			<form
				{...pw.enhance(async ({ element, submit }) => {
					if (await submit()) element.reset();
				})}
				class="flex flex-col gap-4"
			>
				<input {...pw.fields.id.as('hidden', u.id)} />
				{#if pw.result?.saved && !pw.pending}<Alert tone="success">Password set.</Alert>{/if}
				<Field label="New password" issues={pw.fields._password.issues()}>
					<Input {...pw.fields._password.as('password')} autocomplete="new-password" />
				</Field>
				<Button variant="secondary" class="self-start" disabled={!!pw.pending}>Set password</Button>
			</form>
		</Card>
	</div>

	{#if !isMe}
		<Card title="Danger zone" tone="danger" class="lg:col-span-2">
			<form {...del} class="grid gap-4 md:grid-cols-2 md:items-end">
				<input {...del.fields.id.as('hidden', u.id)} />
				<div class="flex flex-col gap-3 md:col-span-2">
					{#each del.fields.allIssues() ?? [] as issue (issue.message)}
						{#if !issue.path.length}<Alert tone="danger">{issue.message}</Alert>{/if}
					{/each}
					<p class="text-sm text-zinc-600 dark:text-zinc-400">
						Deleting removes the account and all of its repositories from brgkpr.
					</p>
					<Checkbox
						{...del.fields.deleteData.as('checkbox')}
						label="Also delete all backup data on disk"
						hint="This cannot be undone."
					/>
				</div>
				<Field label="Type “{u.name}” to confirm" issues={del.fields.confirmName.issues()}>
					<Input {...del.fields.confirmName.as('text')} autocomplete="off" />
				</Field>
				<Button variant="danger" class="md:justify-self-start" disabled={!!del.pending}>
					<Icon name="trash" class="size-4" />Delete user
				</Button>
			</form>
		</Card>
	{/if}
</div>
