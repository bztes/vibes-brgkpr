<script lang="ts">
	import { Button, Card, Icon } from '#lib/components/ui/index.js';
	import { getNotificationLog } from '#lib/api/account.remote.js';
	import { formatDateTime, formatRelative } from '#lib/format.js';

	let { limit = 10, class: className }: { limit?: number; class?: string } = $props();

	const log = $derived((await getNotificationLog()).slice(0, limit));
</script>

<Card title="Recent notifications" flush class={className}>
	{#snippet actions()}
		<Button size="sm" variant="ghost" href="/account">
			<Icon name="bell" class="size-4" />Settings
		</Button>
	{/snippet}

	{#if log.length === 0}
		<p class="px-5 pb-6 text-sm text-zinc-500">
			No notifications sent yet. You will be notified here and on your configured services when a
			backup is overdue.
		</p>
	{:else}
		<ul
			class="divide-y divide-zinc-100 border-t border-zinc-100 text-sm dark:divide-zinc-800 dark:border-zinc-800"
		>
			{#each log as entry (entry.id)}
				<li class="flex items-start gap-3 px-5 py-3">
					<Icon
						name={entry.success ? 'mail' : 'alert'}
						class={[
							'mt-0.5 size-4',
							entry.success ? 'text-zinc-400' : 'text-red-500 dark:text-red-400'
						]}
					/>
					<div class="min-w-0 flex-1">
						<p class="text-zinc-800 dark:text-zinc-200">{entry.message}</p>
						{#if entry.error}
							<p class="text-xs text-red-600 dark:text-red-400">Delivery failed: {entry.error}</p>
						{/if}
					</div>
					<span class="shrink-0 text-xs text-zinc-500" title={formatDateTime(entry.createdAt)}>
						{formatRelative(entry.createdAt)}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</Card>
