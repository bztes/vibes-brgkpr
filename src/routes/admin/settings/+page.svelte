<script lang="ts">
	import {
		Alert,
		Button,
		Card,
		Checkbox,
		Field,
		Input,
		PageHeader,
		Progress
	} from '#lib/components/ui/index.js';
	import {
		getAdminSettings,
		updateBorgSettings,
		updateGeneralSettings,
		updateSmtpSettings
	} from '#lib/api/admin.remote.js';
	import { formatBytes } from '#lib/format.js';
	import { PERMISSIONS, permissionKeys } from '#lib/permissions.js';

	const s = $derived(await getAdminSettings());
	const g = updateGeneralSettings.fields;
	const b = updateBorgSettings.fields;
	const m = updateSmtpSettings.fields;
</script>

<svelte:head><title>Settings · brgkpr</title></svelte:head>

<PageHeader title="Settings" description="System-wide configuration." />

<div class="grid items-start gap-6 lg:grid-cols-2">
	<Card title="General">
		<form {...updateGeneralSettings} class="flex flex-col gap-4">
			{#if updateGeneralSettings.result?.saved && !updateGeneralSettings.pending}
				<Alert tone="success">Saved.</Alert>
			{/if}

			<Checkbox
				{...g.signupEnabled.as('checkbox', s.signupEnabled)}
				label="Allow registration"
				hint="If enabled, anyone can create an account via /signup."
			/>

			<fieldset class="flex flex-col gap-3">
				<legend class="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
					Default permissions for new users
				</legend>
				<p class="-mt-2 text-xs text-zinc-500 dark:text-zinc-400">
					Applies to self-registered accounts and is the default when creating users.
				</p>
				{#each permissionKeys as p (p)}
					<Checkbox
						{...g.defaultPermissions.as('checkbox', p, s.defaultPermissions.includes(p))}
						label={PERMISSIONS[p].label}
						hint={PERMISSIONS[p].hint}
					/>
				{/each}
			</fieldset>

			<Field
				label="Scan interval (minutes)"
				hint="How often size and last backup of all repositories are determined and notifications are checked."
				issues={g.scanIntervalMinutes.issues()}
			>
				<Input {...g.scanIntervalMinutes.as('number', s.scanIntervalMinutes)} min="1" required />
			</Field>

			<Field
				label="Public URL of the web UI"
				hint="Linked in notifications and the base of repository URLs, e.g. https://backup.example.com. If empty, the address the page is opened with is used and notifications contain no link."
				issues={g.publicUrl.issues()}
			>
				<div class="flex gap-2">
					<Input {...g.publicUrl.as('url', s.publicUrl)} placeholder="https://backup.example.com" />
					<Button
						type="button"
						variant="secondary"
						onclick={() => g.publicUrl.set(location.origin)}
						title="Use the address this page is opened with"
					>
						Auto
					</Button>
				</div>
			</Field>

			{#if s.disk}
				<div>
					<div class="mb-1 flex justify-between text-xs text-zinc-500">
						<span>Disk space in repository directory</span>
						<span>{formatBytes(s.disk.free)} free of {formatBytes(s.disk.total)}</span>
					</div>
					<Progress value={1 - s.disk.free / s.disk.total} label="Disk usage" />
				</div>
			{/if}

			<Button disabled={!!updateGeneralSettings.pending}>Save</Button>
		</form>
	</Card>

	<div class="flex flex-col gap-6">
		<Card
			title="Borg"
			description="SSH access for borg. The hostname is taken from the public URL of the web UI."
		>
			<form {...updateBorgSettings} class="flex flex-col gap-4">
				{#if updateBorgSettings.result?.saved && !updateBorgSettings.pending}
					<Alert tone="success">Saved.</Alert>
				{/if}
				<Field
					label="SSH port"
					hint="The host port mapped to the container's port 22, e.g. 2222 for '2222:22'."
					issues={b.sshPort.issues()}
				>
					<Input {...b.sshPort.as('number', s.sshPort)} min="1" max="65535" required />
				</Field>

				<Button disabled={!!updateBorgSettings.pending}>Save</Button>
			</form>
		</Card>

		<Card title="Email (SMTP)" description="For email notifications.">
			<form {...updateSmtpSettings} class="flex flex-col gap-4">
				{#if updateSmtpSettings.result?.saved && !updateSmtpSettings.pending}
					<Alert tone="success">Saved.</Alert>
				{/if}
				<div class="grid gap-4 sm:grid-cols-3">
					<Field label="Server" class="sm:col-span-2" issues={m.smtpHost.issues()}>
						<Input {...m.smtpHost.as('text', s.smtpHost)} placeholder="smtp.example.com" />
					</Field>
					<Field label="Port" issues={m.smtpPort.issues()}>
						<Input {...m.smtpPort.as('number', s.smtpPort)} required />
					</Field>
				</div>
				<Checkbox
					{...m.smtpSecure.as('checkbox', s.smtpSecure)}
					label="Implicit TLS (port 465)"
					hint="If unchecked, STARTTLS is used when the server supports it."
				/>
				<Field label="Username" issues={m.smtpUser.issues()}>
					<Input {...m.smtpUser.as('text', s.smtpUser)} autocomplete="off" />
				</Field>
				<Field
					label="Password"
					hint={s.smtpPasswordSet ? 'Saved – leave empty to keep it' : undefined}
				>
					<Input {...m._smtpPassword.as('password')} autocomplete="new-password" />
				</Field>
				<Field label="Sender" issues={m.smtpFrom.issues()}>
					<Input {...m.smtpFrom.as('text', s.smtpFrom)} placeholder="brgkpr <backup@example.com>" />
				</Field>
				<Button disabled={!!updateSmtpSettings.pending}>Save</Button>
			</form>
		</Card>
	</div>
</div>
