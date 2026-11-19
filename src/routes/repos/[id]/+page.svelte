<script lang="ts">
	import { page } from '$app/state';
	import {
		Alert,
		Badge,
		Button,
		Card,
		Checkbox,
		CopyField,
		Field,
		Icon,
		Input,
		PageHeader,
		Progress,
		Textarea
	} from '#lib/components/ui/index.js';
	import HealthBadge, { healthStyle, runningTile } from '#lib/components/HealthBadge.svelte';
	import ActivityStrip from '#lib/components/ActivityStrip.svelte';
	import { deleteRepo, getRepo, updateRepo, updateRepoAccess } from '#lib/api/repos.remote.js';
	import { addKey, deleteKey, getHostKeys, getRepoKeys, updateKey } from '#lib/api/keys.remote.js';
	import { backupDeadline, repoHealth } from '#lib/health.js';
	import { repoTypeInfo } from '#lib/repo-types.js';
	import {
		bytesToGb,
		formatBytes,
		formatDateTime,
		formatDuration,
		formatRelative,
		formatSpan
	} from '#lib/format.js';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();

	const repo = $derived(await getRepo(params.id));
	const hostKeys = $derived(await getHostKeys(params.id));
	const info = $derived(repoTypeInfo[repo.type]);
	const repoKeys = $derived(await getRepoKeys(params.id));
	const keyName = (id: string | null) => repoKeys.find((k) => k.id === id)?.name ?? 'Deleted key';
	const openConnections = $derived(repo.connections.filter((c) => !c.endedAt));
	const health = $derived(repoHealth({ ...repo, keyCount: repoKeys.length }));
	const style = $derived(healthStyle[health.level]);

	// show new connections and scan results without reloading
	$effect(() => {
		const id = params.id;
		const timer = setInterval(() => void getRepo(id).refresh(), 10_000);
		return () => clearInterval(timer);
	});
	const update = $derived(updateRepo.for(params.id));
	const updateAccess = $derived(updateRepoAccess.for(params.id));
	const remove = $derived(deleteRepo.for(params.id));
	const add = $derived(addKey.for(params.id));

	// comment of the pasted key ("ssh-ed25519 AAAA… user@host"), used as name if left empty
	const keyComment = $derived(
		(add.fields.publicKey.value() ?? '').trim().split(/\s+/).slice(2).join(' ')
	);

	const back = $derived(
		repo.isOwn
			? { href: '/', label: 'Dashboard' }
			: { href: `/admin/repos?user=${repo.owner.id}`, label: 'Repositories' }
	);

	// tabs live in the URL hash, so they survive reloads and can be linked
	const tabs = $derived([
		{ id: 'overview', label: 'Overview', icon: 'activity' },
		{ id: 'keys', label: info.key.plural, icon: 'key' },
		{ id: 'connect', label: 'Connect', icon: 'terminal' },
		{ id: 'settings', label: 'Settings', icon: 'settings' }
	] as const);
	type Tab = (typeof tabs)[number]['id'];
	const tab = $derived<Tab>(tabs.find((t) => `#${t.id}` === page.url.hash)?.id ?? 'overview');

	const deadline = $derived(backupDeadline(repo));
	const dueText = $derived.by(() => {
		if (!deadline) return null;
		const ms = deadline.getTime() - Date.now();
		return ms < 0
			? { late: true, text: `Overdue by ${formatSpan(ms)}` }
			: {
					late: false,
					text: `Next backup expected within ${formatSpan(ms)}${repo.alertAfterHours ? '' : ' (default: 1 week)'}`
				};
	});

	const steps = $derived([
		{
			done: repoKeys.length > 0,
			title: `Add ${info.key.singular.toLowerCase()}`,
			text:
				repo.type === 'borg'
					? 'The public key of the computer you want to back up.'
					: 'A password for the computer you want to back up.',
			href: '#keys'
		},
		{
			done: repo.initialized,
			title: 'Initialize the repository',
			text: info.initHint,
			href: '#connect'
		},
		{
			done: !!repo.lastBackupAt,
			title: 'Run the first backup',
			text: 'Afterwards brgkpr tracks every backup automatically.',
			href: '#connect'
		}
	]);
	const setupDone = $derived(steps.every((s) => s.done));

	const keygen = 'ssh-keygen -t ed25519\ncat ~/.ssh/id_ed25519.pub';

	let client = $state<'shell' | 'pika'>('pika');

	const borgSetup = $derived(
		[
			`export BORG_REPO='${repo.url}'`,
			`borg init --encryption=repokey-blake2`,
			`borg create --stats --compression zstd ::'{hostname}-{now}' ~/Documents`,
			`borg prune --keep-daily 7 --keep-weekly 4 --keep-monthly 6`,
			repo.appendOnly ? '' : `borg compact`
		]
			.filter(Boolean)
			.join('\n')
	);

	/** restic ≥ 0.17 reads the credentials of the REST backend from these variables */
	function resticSetup(username: string, password: string) {
		return [
			`export RESTIC_REPOSITORY='${repo.url}'`,
			`export RESTIC_REST_USERNAME='${username}'`,
			`export RESTIC_REST_PASSWORD='${password}'`,
			`export RESTIC_PASSWORD_FILE=~/.config/restic/password  # encryption password`,
			`restic init`,
			`restic backup ~/Documents`,
			repo.appendOnly ? '' : `restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune`
		]
			.filter(Boolean)
			.join('\n');
	}
</script>

<svelte:head><title>{repo.name} · brgkpr</title></svelte:head>

<PageHeader title={repo.name} description={repo.description ?? undefined} {back}>
	{#snippet badge()}
		<HealthBadge {health} running={openConnections.length > 0} size="lg" />
	{/snippet}
	{#snippet actions()}
		{#if !repo.isOwn}
			<Badge tone="info"><Icon name="user" class="size-3.5" />Owner: {repo.owner.name}</Badge>
		{/if}
	{/snippet}
</PageHeader>

<nav
	class="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-zinc-200)] dark:shadow-[inset_0_-1px_0_var(--color-zinc-800)]"
	aria-label="Repository sections"
>
	{#each tabs as t (t.id)}
		<a
			href="#{t.id}"
			aria-current={tab === t.id ? 'page' : undefined}
			class={[
				'flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
				tab === t.id
					? 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
					: 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
			]}
		>
			<Icon name={t.icon} class="size-4" />
			{t.label}
			{#if t.id === 'keys'}
				<span
					class={[
						'rounded-full px-1.5 text-xs',
						repoKeys.length
							? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
							: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
					]}>{repoKeys.length}</span
				>
			{/if}
		</a>
	{/each}
</nav>

{#if tab === 'overview'}
	<div class="flex flex-col gap-6">
		{#if repo.scanError}
			<Alert tone="danger" title="Error during last scan">{repo.scanError}</Alert>
		{/if}

		<!-- status at a glance -->
		<section
			class="grid overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-xs lg:grid-cols-[1.4fr_1fr] dark:border-zinc-800 dark:bg-zinc-900/60"
		>
			<div class="flex gap-4 p-6">
				<span
					class={[
						'grid size-14 shrink-0 place-items-center rounded-2xl',
						openConnections.length ? runningTile : style.tile
					]}
				>
					<Icon
						name={openConnections.length ? 'refresh' : style.icon}
						class={['size-7', openConnections.length && 'animate-spin [animation-duration:3s]']}
					/>
				</span>
				<div class="min-w-0">
					<p class="text-sm font-medium text-zinc-500">Last backup</p>
					<p
						class="text-2xl font-semibold tracking-tight"
						title={formatDateTime(repo.lastBackupAt)}
					>
						{repo.lastBackupAt ? formatRelative(repo.lastBackupAt) : 'No backup yet'}
					</p>
					{#if repo.lastBackupAt}
						<p class="text-sm text-zinc-500">{formatDateTime(repo.lastBackupAt)}</p>
					{/if}
					{#if dueText}
						<p
							class={[
								'mt-3 inline-flex items-center gap-1.5 text-sm',
								dueText.late
									? 'font-medium text-red-600 dark:text-red-400'
									: 'text-zinc-600 dark:text-zinc-400'
							]}
						>
							<Icon name="clock" class="size-4" />{dueText.text}
						</p>
					{/if}
					{#if health.level !== 'ok'}
						<p class={['mt-2 text-sm', style.text]}>{health.detail}</p>
					{/if}
					{#each openConnections as c (c.id)}
						<p class="mt-2 text-sm text-sky-700 dark:text-sky-300">
							Backing up now: {keyName(c.keyId)}{c.client ? ` from ${c.client}` : ''}, started
							{formatRelative(c.startedAt)}
						</p>
					{/each}
				</div>
			</div>

			<dl
				class="grid grid-cols-2 gap-px border-t border-zinc-100 bg-zinc-100 lg:border-t-0 lg:border-l dark:border-zinc-800 dark:bg-zinc-800"
			>
				<div class="bg-white p-5 dark:bg-zinc-900">
					<dt class="text-xs font-medium text-zinc-500">Storage</dt>
					<dd class="mt-1 text-lg font-semibold">{formatBytes(repo.sizeBytes)}</dd>
					{#if repo.quota}
						<Progress class="mt-2" value={repo.sizeBytes / repo.quota} label="Quota usage" />
						<p class="mt-1 text-xs text-zinc-500">
							{Math.round((repo.sizeBytes / repo.quota) * 100)}% of {formatBytes(repo.quota)}
						</p>
					{:else}
						<p class="text-xs text-zinc-500">no quota</p>
					{/if}
				</div>
				<div class="bg-white p-5 dark:bg-zinc-900">
					<dt class="text-xs font-medium text-zinc-500">Warning after</dt>
					<dd class="mt-1 text-lg font-semibold">
						{repo.alertAfterHours ? `${repo.alertAfterHours} h` : 'Off'}
					</dd>
					<a
						href="#settings"
						class="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
						>without a backup · change</a
					>
				</div>
				<div class="bg-white p-5 dark:bg-zinc-900">
					<dt class="text-xs font-medium text-zinc-500">Access</dt>
					<dd class="mt-1 flex items-center gap-1.5 text-lg font-semibold">
						{#if repo.appendOnly}<Icon name="shield" class="size-4 text-emerald-600" />{/if}
						{repo.appendOnly ? 'Append-only' : 'Full'}
					</dd>
					<p class="text-xs text-zinc-500">
						{repoKeys.length}
						{repoKeys.length === 1 ? 'key' : 'keys'}
					</p>
				</div>
				<div class="bg-white p-5 dark:bg-zinc-900">
					<dt class="text-xs font-medium text-zinc-500">Last scanned</dt>
					<dd class="mt-1 text-lg font-semibold">{formatRelative(repo.lastScanAt)}</dd>
					<p class="text-xs text-zinc-500">created {formatDateTime(repo.createdAt)}</p>
				</div>
			</dl>
		</section>

		{#if !setupDone}
			<Card title="Get started" description="Three steps until your first backup is monitored.">
				<ol class="grid gap-3 md:grid-cols-3">
					{#each steps as step, i (step.title)}
						<li>
							<a
								href={step.href}
								class={[
									'flex h-full gap-3 rounded-xl border p-4 transition-colors',
									step.done
										? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20'
										: 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/40'
								]}
							>
								<span
									class={[
										'grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold',
										step.done
											? 'bg-emerald-500 text-white'
											: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
									]}
								>
									{#if step.done}<Icon name="check" class="size-4" strokeWidth={3} />{:else}{i +
											1}{/if}
								</span>
								<span>
									<span class="block text-sm font-semibold">{step.title}</span>
									<span class="block text-xs text-zinc-500">{step.text}</span>
								</span>
							</a>
						</li>
					{/each}
				</ol>
			</Card>
		{/if}

		<Card title="Backup activity" description="Client sessions per day over the last 30 days.">
			{#snippet actions()}
				<span class="text-sm">
					<span class="font-semibold">{repo.activity.length}</span>
					{repo.activity.length === 1 ? 'session' : 'sessions'}
				</span>
			{/snippet}
			<ActivityStrip activity={repo.activity} lastBackupAt={repo.lastBackupAt} days={30} detailed />
		</Card>

		<Card flush title="Connection log" description="The most recent client sessions.">
			{#if repo.connections.length === 0}
				<p class="px-5 pb-5 text-sm text-zinc-500">No connections yet.</p>
			{:else}
				<div class="overflow-x-auto border-t border-zinc-100 dark:border-zinc-800">
					<table class="w-full text-left text-sm">
						<thead class="text-xs text-zinc-500">
							<tr>
								<th class="px-5 py-2.5 font-medium">Started</th>
								<th class="px-5 py-2.5 font-medium">Duration</th>
								<th class="px-5 py-2.5 font-medium">Key</th>
								<th class="px-5 py-2.5 font-medium">Client</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
							{#each repo.connections as c (c.id)}
								<tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
									<td class="px-5 py-2.5 whitespace-nowrap" title={formatDateTime(c.startedAt)}>
										{formatDateTime(c.startedAt)}
									</td>
									<td class="px-5 py-2.5 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
										{#if c.endedAt}
											{formatDuration(c.startedAt, c.endedAt)}
										{:else}
											<Badge tone="info" dot>running</Badge>
										{/if}
									</td>
									<td class="px-5 py-2.5">{keyName(c.keyId)}</td>
									<td class="px-5 py-2.5 font-mono text-xs text-zinc-500">{c.client ?? '–'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</Card>
	</div>
{:else if tab === 'keys'}
	<div class="grid gap-6 lg:grid-cols-5">
		<Card
			flush
			title={info.key.plural}
			description="Computers with one of these keys can back up to this repository, and only to this one."
			class="self-start lg:col-span-3"
		>
			{#if repoKeys.length === 0}
				<div
					class="flex flex-col items-center gap-2 border-t border-zinc-100 px-5 py-10 text-center dark:border-zinc-800"
				>
					<span
						class="grid size-11 place-items-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
					>
						<Icon name="key" />
					</span>
					<p class="font-medium">No key yet</p>
					<p class="max-w-xs text-sm text-zinc-500">
						Add {info.key.singular.toLowerCase()} for the computer that backs up to this repository.
					</p>
				</div>
			{:else}
				<ul
					class="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800"
				>
					{#each repoKeys as key (key.id)}
						{@const del = deleteKey.for(key.id)}
						{@const edit = updateKey.for(key.id)}
						<li class="px-5 py-4">
							<div class="flex flex-wrap items-start justify-between gap-3">
								<div class="flex min-w-0 gap-3">
									<span
										class="grid size-9 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
									>
										<Icon name="key" class="size-4" />
									</span>
									<div class="min-w-0">
										<p class="flex flex-wrap items-center gap-2 font-medium">
											{key.name}
											{#if openConnections.some((c) => c.keyId === key.id)}
												<Badge tone="info" dot>connected</Badge>
											{/if}
											{#if repo.appendOnly || key.appendOnly}
												<Badge tone="success">
													<Icon name="shield" class="size-3" />append-only{key.appendOnly
														? ''
														: ' (repository)'}
												</Badge>
											{/if}
										</p>
										<p class="truncate font-mono text-xs text-zinc-500">{key.detail}</p>
										<p class="text-xs text-zinc-500">added {formatDateTime(key.createdAt)}</p>
									</div>
								</div>
								<form {...del}>
									<input {...del.fields.id.as('hidden', key.id)} />
									<Button variant="ghost" size="sm" disabled={!!del.pending}>
										<Icon name="trash" class="size-4" />Remove
									</Button>
								</form>
							</div>
							<details class="group mt-3 pl-12">
								<summary
									class="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
								>
									<Icon
										name="chevron-right"
										class="size-4 transition-transform group-open:rotate-90"
									/>
									Key settings
								</summary>
								<form {...edit} class="mt-3 flex flex-col gap-4">
									<input {...edit.fields.id.as('hidden', key.id)} />
									{#each edit.fields.allIssues() ?? [] as issue (issue.message)}
										{#if !issue.path.length}<Alert tone="danger">{issue.message}</Alert>{/if}
									{/each}
									{#if edit.result?.saved && !edit.pending}
										<Alert tone="success">Saved.</Alert>
									{/if}
									<Field label="Name" issues={edit.fields.name.issues()}>
										<Input {...edit.fields.name.as('text', key.name)} required />
									</Field>
									<Checkbox
										{...edit.fields.appendOnly.as('checkbox', key.appendOnly)}
										label="Append-only for this key"
										hint={repo.appendOnly
											? 'The repository is append-only, so this key is append-only anyway.'
											: 'This key cannot permanently delete data, other keys keep full access (e.g. for prune/compact).'}
									/>
									<Button size="sm" class="self-start" disabled={!!edit.pending}>Save key</Button>
								</form>
							</details>
						</li>
					{/each}
				</ul>
			{/if}
		</Card>

		<Card title="Add key" class="self-start lg:col-span-2">
			<form
				{...add.enhance(async ({ element, submit }) => {
					if (await submit()) element.reset();
				})}
				class="flex flex-col gap-4"
			>
				<input {...add.fields.repoId.as('hidden', repo.id)} />
				{#if add.result?.added && !add.pending}
					<Alert tone="success">“{add.result.added}” was added.</Alert>
				{/if}
				{#if add.result?.secret && !add.pending}
					<Alert tone="warning" title="Copy the password now">
						It is shown only once. If it gets lost, remove the key and add a new one.
					</Alert>
					<CopyField label="Username" value={add.result.id} />
					<CopyField label="Password" value={add.result.secret} />
					<CopyField
						label="Setup and first backup"
						value={resticSetup(add.result.id, add.result.secret)}
						multiline
					/>
				{/if}
				{#if repo.type === 'borg'}
					<Field
						label="Public key"
						hint="Contents of ~/.ssh/id_ed25519.pub on the computer you want to back up"
						issues={add.fields.publicKey.issues()}
					>
						<Textarea
							{...add.fields.publicKey.as('text')}
							rows={3}
							placeholder="ssh-ed25519 AAAA… user@host"
							required
						/>
					</Field>
				{/if}
				<Field
					label="Name (optional)"
					hint={repo.type === 'borg'
						? "Leave empty to use the key's comment (usually user@host)"
						: 'E.g. the computer that uses this key'}
					issues={add.fields.name.issues()}
				>
					<Input {...add.fields.name.as('text')} placeholder={keyComment || 'laptop'} />
				</Field>
				{#if repo.type === 'restic'}
					<p class="text-xs text-zinc-500">
						A random password is generated. Together with the key's id as username, restic uses it
						to log in to the REST server.
					</p>
				{/if}
				<Checkbox
					{...add.fields.appendOnly.as('checkbox')}
					label="Append-only for this key"
					hint={repo.appendOnly
						? 'The repository is append-only, so this key is append-only anyway.'
						: 'Recommended for computers that only create backups. Pruning old backups then needs a separate key without this option.'}
				/>
				<Button disabled={!!add.pending}><Icon name="plus" class="size-4" />Add key</Button>
			</form>
			{#if repo.type === 'borg'}
				<details
					class="group mt-5 border-t border-zinc-100 pt-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400"
				>
					<summary class="flex cursor-pointer list-none items-center gap-1 font-medium">
						<Icon name="chevron-right" class="size-4 transition-transform group-open:rotate-90" />
						Don't have a key yet?
					</summary>
					<p class="mt-2">Run this on the computer you want to back up:</p>
					<div class="mt-2">
						<CopyField value={keygen} multiline />
					</div>
					<p class="mt-2">
						Each key can access only one repository. To back up to several repositories from one
						computer, create a separate key for each (<code class="text-xs"
							>ssh-keygen -f ~/.ssh/borg_{repo.name}</code
						>).
					</p>
				</details>
			{/if}
		</Card>
	</div>
{:else if tab === 'connect'}
	<div class="flex flex-col gap-6">
		<Card title="Connect a client" description="How to set up backups to this repository.">
			<div class="flex flex-col gap-5">
				<CopyField label="Repository URL" value={repo.url} />

				{#if repo.type === 'restic'}
					<CopyField
						label="Setup and first backup"
						value={resticSetup('<key id>', '<key password>')}
						multiline
					/>
					<p class="text-xs text-zinc-500">
						Username and password come from one of the <a href="#keys" class="underline"
							>access keys</a
						>. restic before 0.17 doesn't read <code>RESTIC_REST_USERNAME</code> and
						<code>RESTIC_REST_PASSWORD</code>: put them into the URL instead (<code
							>rest:https://&lt;user&gt;:&lt;password&gt;@host/…</code
						>). The encryption password is separate and never leaves your computer – without it the
						backups cannot be restored.
					</p>
				{:else}
					<div class="flex gap-1 rounded-xl bg-zinc-100 p-1 text-sm dark:bg-zinc-800">
						{#each [['pika', 'Pika Backup'], ['shell', 'borg (Shell)']] as const as [id, label] (id)}
							<button
								type="button"
								class={[
									'flex-1 rounded-lg px-3 py-1.5 font-medium transition-colors',
									client === id
										? 'bg-white shadow-sm dark:bg-zinc-900'
										: 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
								]}
								onclick={() => (client = id)}>{label}</button
							>
						{/each}
					</div>

					{#if client === 'pika'}
						<ol class="flex flex-col gap-3 text-sm text-zinc-700 dark:text-zinc-300">
							{#each [`Make sure your computer's public SSH key has been added under <a href="#keys" class="font-medium underline">SSH keys</a>.`, 'In Pika Backup: <em>Set Up Backup</em> → <em>Create New Repository</em> → <em>Remote Location</em>.', 'Paste the repository URL from above.', 'Keep encryption enabled and store the password safely – without it the backups cannot be restored.', 'Under <em>Schedule</em>, enable e.g. daily backups.'] as step, i (i)}
								<li class="flex gap-3">
									<span
										class="grid size-6 shrink-0 place-items-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
										>{i + 1}</span
									>
									<!-- static text from the list above -->
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									<span class="pt-0.5">{@html step}</span>
								</li>
							{/each}
						</ol>
						<p class="text-xs text-zinc-500">
							For an already initialized repository choose <em>Use Existing Repository</em> instead.
						</p>
					{:else}
						<CopyField label="Setup and first backup" value={borgSetup} multiline />
						<p class="text-xs text-zinc-500">
							For automatic backups, use e.g. a systemd timer or cron job running
							<code>borg create</code>. The passphrase can be provided via
							<code>BORG_PASSCOMMAND</code>.
						</p>
					{/if}
				{/if}
			</div>
		</Card>

		{#if hostKeys.length}
			<Card
				title="Server fingerprints"
				description="Compare these when your client asks to trust the server for the first time."
			>
				<ul class="flex flex-col gap-2 font-mono text-xs">
					{#each hostKeys as key (key.fingerprint)}
						<li class="rounded-lg bg-zinc-50 px-3 py-2 break-all dark:bg-zinc-950">
							<span class="text-zinc-500">{key.type}</span><br />{key.fingerprint}
						</li>
					{/each}
				</ul>
			</Card>
		{/if}
	</div>
{:else}
	<div class="grid gap-6 lg:grid-cols-2">
		<Card title="Monitoring" description="When should brgkpr warn you?" class="self-start">
			<form {...update} class="flex flex-col gap-4">
				<input {...update.fields.id.as('hidden', repo.id)} />
				{#each update.fields.allIssues() ?? [] as issue (issue.message)}
					{#if !issue.path.length}<Alert tone="danger">{issue.message}</Alert>{/if}
				{/each}
				{#if update.result?.saved && !update.pending}
					<Alert tone="success">Saved.</Alert>
				{/if}

				<Field label="Description" issues={update.fields.description.issues()}>
					<Input {...update.fields.description.as('text', repo.description ?? '')} />
				</Field>
				<Field
					label="Warn after … hours without backup"
					hint="E.g. 26 for nightly backups. Empty = no notification (shown as overdue after a week)."
					issues={update.fields.alertAfterHours.issues()}
				>
					<Input
						{...update.fields.alertAfterHours.as('number', repo.alertAfterHours ?? undefined)}
						min="0"
						step="1"
					/>
				</Field>
				<Button class="self-start" disabled={!!update.pending}>Save</Button>
			</form>
		</Card>

		<Card title="Access" description="Applies to every key of this repository." class="self-start">
			<form {...updateAccess} class="flex flex-col gap-4">
				<input {...updateAccess.fields.id.as('hidden', repo.id)} />
				{#each updateAccess.fields.allIssues() ?? [] as issue (issue.message)}
					{#if !issue.path.length}<Alert tone="danger">{issue.message}</Alert>{/if}
				{/each}
				{#if updateAccess.result?.saved && !updateAccess.pending}
					<Alert tone="success">Saved.</Alert>
				{/if}
				<Field
					label="Quota in GB"
					hint={`Empty = no quota (${repo.isOwn ? "your account's" : `${repo.owner.name}'s`} storage limit still applies).`}
					issues={updateAccess.fields.quotaGb.issues()}
				>
					<Input
						{...updateAccess.fields.quotaGb.as('number', bytesToGb(repo.quota))}
						min="0"
						step="0.1"
					/>
				</Field>
				<Checkbox
					{...updateAccess.fields.appendOnly.as('checkbox', repo.appendOnly)}
					label="Append-only mode"
					hint="No key can permanently delete data. To allow pruning with one key, leave this off and make the other keys append-only instead."
				/>
				<Button class="self-start" disabled={!!updateAccess.pending}>Save</Button>
			</form>
		</Card>

		<Card title="Danger zone" tone="danger" class="lg:col-span-2">
			<form {...remove} class="grid gap-4 md:grid-cols-2 md:items-end">
				<input {...remove.fields.id.as('hidden', repo.id)} />
				<div class="flex flex-col gap-3 md:col-span-2">
					{#each remove.fields.allIssues() ?? [] as issue (issue.message)}
						{#if !issue.path.length}<Alert tone="danger">{issue.message}</Alert>{/if}
					{/each}
					<p class="text-sm text-zinc-600 dark:text-zinc-400">
						Deleting removes the repository from brgkpr and revokes all access to it.
						{#if !repo.canDeleteData}
							The backup data stays on the server – ask an administrator if it should be deleted.
						{/if}
					</p>
					{#if repo.canDeleteData}
						<Checkbox
							{...remove.fields.deleteData.as('checkbox')}
							label="Also delete all backup data on disk"
							hint="This cannot be undone."
						/>
					{/if}
				</div>
				<Field label="Type “{repo.name}” to confirm" issues={remove.fields.confirmName.issues()}>
					<Input {...remove.fields.confirmName.as('text')} autocomplete="off" />
				</Field>
				<Button variant="danger" class="md:justify-self-start" disabled={!!remove.pending}>
					<Icon name="trash" class="size-4" />
					{repo.canDeleteData ? 'Delete permanently' : 'Delete repository'}
				</Button>
			</form>
		</Card>
	</div>
{/if}
