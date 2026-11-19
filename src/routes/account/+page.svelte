<script lang="ts">
	import {
		Alert,
		Badge,
		Button,
		Card,
		Field,
		Icon,
		Input,
		PageHeader
	} from '#lib/components/ui/index.js';
	import NotificationChannelDialog from '#lib/components/NotificationChannelDialog.svelte';
	import { getMe } from '#lib/api/auth.remote.js';
	import {
		changePassword,
		deleteNotificationChannel,
		sendTestNotification,
		updateProfile
	} from '#lib/api/account.remote.js';
	import { channelTypes, levelInfo, notificationLevels } from '#lib/notifications.js';
	import type { PublicNotificationChannel } from '#lib/server/auth.js';

	const me = $derived((await getMe())!);
	const channels = $derived(me.notifications.channels);
	const e = updateProfile.fields;
	const p = changePassword.fields;

	const errorMessage = (err: unknown, fallback: string) =>
		(err as { body?: { message?: string } })?.body?.message ?? fallback;

	// dialog: a fresh key per opening so the add form starts blank
	let dialogOpen = $state(false);
	let dialogKey = $state(0);
	let editing = $state<PublicNotificationChannel | undefined>();

	function openDialog(channel?: PublicNotificationChannel) {
		editing = channel;
		dialogKey++;
		dialogOpen = true;
	}

	const target = (c: PublicNotificationChannel) => (c.type === 'email' ? c.address : c.url);

	let busy = $state<string | null>(null);
	let confirmRemove = $state<string | null>(null);
	let feedback = $state<{ id: string; tone: 'success' | 'danger'; text: string } | null>(null);

	async function test(c: PublicNotificationChannel) {
		busy = c.id;
		feedback = null;
		try {
			const [r] = await sendTestNotification(c.id);
			feedback = r.ok
				? { id: c.id, tone: 'success', text: 'Test message sent.' }
				: { id: c.id, tone: 'danger', text: r.error ?? 'Sending failed' };
		} catch (err) {
			feedback = { id: c.id, tone: 'danger', text: errorMessage(err, 'Sending failed') };
		} finally {
			busy = null;
		}
	}

	async function remove(c: PublicNotificationChannel) {
		if (confirmRemove !== c.id) {
			confirmRemove = c.id;
			return;
		}
		busy = c.id;
		try {
			await deleteNotificationChannel(c.id);
			confirmRemove = null;
		} catch (err) {
			feedback = { id: c.id, tone: 'danger', text: errorMessage(err, 'Removing failed') };
		} finally {
			busy = null;
		}
	}
</script>

<svelte:head><title>Account · brgkpr</title></svelte:head>

<PageHeader title="Account" description="Logged in as {me.name}" />

<div class="grid gap-6 lg:grid-cols-2">
	<Card
		title="Notifications"
		description="Get notified when a repository has not received a backup for too long or its quota is almost reached."
		flush
		class="lg:col-span-2"
	>
		{#snippet actions()}
			<Button size="sm" onclick={() => openDialog()}>
				<Icon name="plus" class="size-4" />Add service
			</Button>
		{/snippet}

		{#if channels.length === 0}
			<div
				class="flex flex-col items-center gap-3 border-t border-zinc-100 px-5 py-10 text-center dark:border-zinc-800"
			>
				<span
					class="grid size-11 place-items-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
				>
					<Icon name="bell" />
				</span>
				<p class="text-sm text-zinc-500">
					No notification services yet. Add an email address or an ntfy topic to receive alerts.
				</p>
				<Button variant="secondary" size="sm" onclick={() => openDialog()}>Add service</Button>
			</div>
		{:else}
			<ul
				class="divide-y divide-zinc-100 border-t border-zinc-100 text-sm dark:divide-zinc-800 dark:border-zinc-800"
			>
				{#each channels as c (c.id)}
					<li class="flex flex-col gap-2 px-5 py-4">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div class="flex min-w-0 items-center gap-3">
								<span
									class="grid size-9 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
									title={channelTypes[c.type].label}
								>
									<Icon name={c.type === 'email' ? 'mail' : 'bell'} class="size-4" />
								</span>
								<div class="min-w-0">
									<p class="truncate font-medium">{c.name || target(c)}</p>
									{#if c.name}<p class="truncate text-xs text-zinc-500">{target(c)}</p>{/if}
								</div>
							</div>
							<div class="flex flex-wrap items-center gap-2">
								<Button
									size="sm"
									variant="secondary"
									disabled={busy === c.id}
									onclick={() => test(c)}
								>
									Test
								</Button>
								<Button size="sm" variant="secondary" onclick={() => openDialog(c)}>Edit</Button>
								<Button
									size="sm"
									variant={confirmRemove === c.id ? 'danger' : 'ghost'}
									disabled={busy === c.id}
									onclick={() => remove(c)}
									onblur={() => {
										if (confirmRemove === c.id) confirmRemove = null;
									}}
								>
									{confirmRemove === c.id ? 'Really remove?' : 'Remove'}
								</Button>
							</div>
						</div>
						<div class="flex flex-wrap gap-1.5 pl-12">
							{#each notificationLevels as level (level)}
								{#if c.levels.includes(level)}
									<Badge
										dot
										tone={level === 'error'
											? 'danger'
											: level === 'warning'
												? 'warning'
												: 'success'}
									>
										{levelInfo[level].label}
									</Badge>
								{/if}
							{/each}
							{#if c.levels.length === 0}
								<span class="text-xs text-zinc-500">Muted – no notifications selected</span>
							{/if}
						</div>
						{#if feedback?.id === c.id}
							<Alert tone={feedback.tone}>{feedback.text}</Alert>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Card>

	<Card title="Profile">
		<form {...updateProfile} class="flex flex-col gap-4">
			{#if updateProfile.result?.saved && !updateProfile.pending}
				<Alert tone="success">Saved.</Alert>
			{/if}
			<Field
				label="Email address"
				hint="Used to log in and as default for new email notifications."
				issues={e.email.issues()}
			>
				<Input {...e.email.as('email', me.email)} autocomplete="username" required />
			</Field>
			<Field
				label="Username (optional)"
				hint="Shown instead of your email."
				issues={e.username.issues()}
			>
				<Input {...e.username.as('text', me.username ?? '')} autocomplete="nickname" />
			</Field>
			<Button class="self-start" disabled={!!updateProfile.pending}>Save</Button>
		</form>
	</Card>

	<Card title="Change password">
		<form
			{...changePassword.enhance(async ({ element, submit }) => {
				if (await submit()) element.reset();
			})}
			class="flex flex-col gap-4"
		>
			{#if changePassword.result?.saved && !changePassword.pending}
				<Alert tone="success">Password changed.</Alert>
			{/if}
			<Field label="Current password" issues={p._current.issues()}>
				<Input {...p._current.as('password')} autocomplete="current-password" required />
			</Field>
			<Field label="New password" issues={p._password.issues()}>
				<Input {...p._password.as('password')} autocomplete="new-password" required />
			</Field>
			<Field label="Repeat new password" issues={p._passwordConfirm.issues()}>
				<Input {...p._passwordConfirm.as('password')} autocomplete="new-password" required />
			</Field>
			<Button class="self-start" disabled={!!changePassword.pending}>Change password</Button>
		</form>
	</Card>
</div>

{#key dialogKey}
	<NotificationChannelDialog
		bind:open={dialogOpen}
		channel={editing}
		formKey="new-{dialogKey}"
		defaultEmail={me.email}
	/>
{/key}
