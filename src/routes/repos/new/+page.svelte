<script lang="ts">
	import { page } from '$app/state';
	import {
		Alert,
		Button,
		Card,
		Field,
		Input,
		PageHeader,
		Select
	} from '#lib/components/ui/index.js';
	import { createRepo, getRepos } from '#lib/api/repos.remote.js';
	import { getMe } from '#lib/api/auth.remote.js';
	import { getUsers } from '#lib/api/admin.remote.js';
	import { formatBytes } from '#lib/format.js';
	import { repoTypeInfo, repoTypes } from '#lib/repo-types.js';

	const me = $derived(await getMe());
	const data = $derived(await getRepos());
	const isAdmin = $derived(me?.role === 'admin');
	const users = $derived(isAdmin ? await getUsers() : []);
	const { name, type, description, alertAfterHours, ownerId } = createRepo.fields;

	// admins can preselect the owner via ?owner=<id> (e.g. from the user list)
	const initialOwner = $derived(page.url.searchParams.get('owner') ?? me?.id ?? '');
	const selectedId = $derived(ownerId.value() || initialOwner);
	const owner = $derived(users.find((u) => u.id === selectedId));
	const forOther = $derived(isAdmin && !!owner && owner.id !== me?.id);
	const storageLimit = $derived(forOther ? owner?.storageLimit : data.storageLimit);
	const back = $derived(
		forOther
			? { href: `/admin/repos?user=${owner!.id}`, label: 'All repositories' }
			: { href: '/', label: 'Dashboard' }
	);
</script>

<svelte:head><title>New repository · brgkpr</title></svelte:head>

<PageHeader
	title="New repository"
	description="After creating it, add a key and connect your backup client."
	{back}
/>

{#if !data.canCreate}
	<Card class="max-w-2xl">
		<Alert tone="warning" title="Not allowed">
			Your account cannot create repositories. Ask an administrator to set one up for you.
		</Alert>
	</Card>
{:else}
	<Card class="max-w-2xl">
		<form {...createRepo} class="flex flex-col gap-5">
			{#each createRepo.fields.allIssues() ?? [] as issue (issue.message)}
				{#if !issue.path.length}<Alert tone="danger">{issue.message}</Alert>{/if}
			{/each}

			{#if isAdmin}
				<Field
					label="Owner"
					hint="The repository is stored under the owner's directory and counts towards their storage limit."
					issues={ownerId.issues()}
				>
					<Select {...ownerId.as('select', initialOwner)}>
						{#each users as u (u.id)}
							<option value={u.id}>
								{u.name}{u.id === me?.id ? ' (you)' : ''}{u.storageLimit
									? ` – ${formatBytes(u.sizeBytes)} of ${formatBytes(u.storageLimit)} used`
									: ''}
							</option>
						{/each}
					</Select>
				</Field>
			{/if}

			<fieldset class="flex flex-col gap-2">
				<legend class="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
					Backup tool
				</legend>
				<div class="grid gap-2 sm:grid-cols-2">
					{#each repoTypes as t (t)}
						<label
							class="flex cursor-pointer gap-3 rounded-xl border border-zinc-200 p-3 has-checked:border-zinc-900 has-checked:bg-zinc-50 dark:border-zinc-800 dark:has-checked:border-zinc-300 dark:has-checked:bg-zinc-800/40"
						>
							<input
								{...type.as('radio', t)}
								checked={(type.value() || 'borg') === t}
								class="mt-1"
							/>
							<span>
								<span class="block text-sm font-semibold">{repoTypeInfo[t].label}</span>
								<span class="block text-xs text-zinc-500">{repoTypeInfo[t].hint}</span>
							</span>
						</label>
					{/each}
				</div>
				{#each type.issues() ?? [] as issue (issue.message)}
					<p class="text-xs text-red-600">{issue.message}</p>
				{/each}
			</fieldset>

			<Field
				label="Name"
				hint="Letters, digits, dots, hyphens and underscores, e.g. laptop-home"
				issues={name.issues()}
			>
				<Input {...name.as('text')} required placeholder="laptop-home" />
			</Field>

			<Field label="Description (optional)" issues={description.issues()}>
				<Input {...description.as('text')} placeholder="Home directory of my laptop" />
			</Field>

			<Field
				label="Warn after … hours without backup"
				hint="E.g. 26 for nightly backups. Empty = no warning"
				issues={alertAfterHours.issues()}
			>
				<Input {...alertAfterHours.as('number', 26)} min="0" step="1" />
			</Field>

			<p class="text-xs text-zinc-500">
				Quota and append-only mode can be set in the repository's settings afterwards. Append-only
				mode can also be set per key{storageLimit
					? `, and ${forOther ? "the owner's" : 'your'} storage limit of ${formatBytes(storageLimit)} always applies`
					: ''}.
			</p>

			<div class="flex gap-2">
				<Button disabled={!!createRepo.pending}>Create repository</Button>
				<Button href={back.href} variant="ghost">Cancel</Button>
			</div>
		</form>
	</Card>
{/if}
