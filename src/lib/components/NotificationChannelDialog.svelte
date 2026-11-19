<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, Checkbox, Dialog, Field, Input } from '#lib/components/ui/index.js';
	import { saveNotificationChannel } from '#lib/api/account.remote.js';
	import { channelTypes, levelInfo, notificationLevels } from '#lib/notifications.js';
	import type { PublicNotificationChannel } from '#lib/server/auth.js';

	type ChannelType = keyof typeof channelTypes;

	interface Props {
		open: boolean;
		/** the channel to edit; omit to add a new one */
		channel?: PublicNotificationChannel;
		/** unique per opening, so a new channel always starts with a blank form */
		formKey: string;
		/** prefilled address for new email channels */
		defaultEmail?: string | null;
	}

	let { open = $bindable(), channel, formKey, defaultEmail }: Props = $props();

	// the dialog is re-created for every opening, so the initial value is all we need
	let type = $state<ChannelType | null>(untrack(() => channel?.type ?? null));

	const form = $derived(saveNotificationChannel.for(channel?.id ?? formKey));
	const f = $derived(form.fields);
	const email = $derived(channel?.type === 'email' ? channel : undefined);
	const ntfy = $derived(channel?.type === 'ntfy' ? channel : undefined);
</script>

<Dialog
	bind:open
	title={channel ? 'Edit notification service' : 'Add notification service'}
	description={type ? channelTypes[type].hint : 'Choose how you want to be notified.'}
>
	{#if !type}
		<div class="grid gap-3 sm:grid-cols-2">
			{#each Object.entries(channelTypes) as [key, info] (key)}
				<button
					type="button"
					class="flex flex-col items-start gap-1 rounded-lg border border-zinc-200 p-4 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50/50 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none dark:border-zinc-700 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/30"
					onclick={() => (type = key as ChannelType)}
				>
					<span class="text-sm font-semibold">{info.label}</span>
					<span class="text-xs text-zinc-500 dark:text-zinc-400">{info.hint}</span>
				</button>
			{/each}
		</div>
	{:else}
		<form
			{...form.enhance(async ({ submit }) => {
				if (await submit()) open = false;
			})}
			class="flex flex-col gap-4"
		>
			<input {...f.id.as('hidden', channel?.id ?? '')} />
			<input {...f.type.as('hidden', type)} />

			{#if type === 'email'}
				<Field label="Email address" issues={f.address.issues()}>
					<Input
						{...f.address.as('email', email?.address ?? defaultEmail ?? '')}
						placeholder="you@example.com"
						required
					/>
				</Field>
			{:else}
				<Field
					label="Topic URL"
					hint="Server and topic, e.g. https://ntfy.sh/my-backups"
					issues={f.url.issues()}
				>
					<Input {...f.url.as('url', ntfy?.url ?? '')} placeholder="https://ntfy.sh/…" required />
				</Field>
				<Field
					label="Access token (optional)"
					hint={ntfy?.hasToken
						? 'A token is saved. Leave empty to keep it.'
						: 'Only needed for protected topics.'}
					issues={f._token.issues()}
				>
					<Input {...f._token.as('password')} autocomplete="off" placeholder="tk_…" />
				</Field>
				{#if ntfy?.hasToken}
					<Checkbox {...f.clearToken.as('checkbox')} label="Remove saved token" />
				{/if}
			{/if}

			<Field label="Name (optional)" hint="Shown in the list and the log." issues={f.name.issues()}>
				<Input
					{...f.name.as('text', channel?.name ?? '')}
					placeholder={type === 'email' ? 'Work email' : 'Phone'}
				/>
			</Field>

			<fieldset class="flex flex-col gap-3">
				<legend class="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
					Send notifications for
				</legend>
				{#each notificationLevels as level (level)}
					<Checkbox
						{...f.levels.as('checkbox', level, channel ? channel.levels.includes(level) : true)}
						label={levelInfo[level].label}
						hint={levelInfo[level].hint}
					/>
				{/each}
			</fieldset>

			<div
				class="flex flex-wrap justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800"
			>
				{#if !channel}
					<Button type="button" variant="ghost" class="mr-auto" onclick={() => (type = null)}>
						Back
					</Button>
				{/if}
				<Button type="button" variant="secondary" onclick={() => (open = false)}>Cancel</Button>
				<Button disabled={!!form.pending}>{channel ? 'Save' : 'Add service'}</Button>
			</div>
		</form>
	{/if}
</Dialog>
