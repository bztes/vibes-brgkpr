<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { RepoListItem } from '#lib/components/RepoList.svelte';
	import { repoHealth, severity } from '#lib/health.js';
	import { formatRelative } from '#lib/format.js';

	interface Props {
		repos: RepoListItem[];
	}

	let { repos }: Props = $props();

	const items = $derived(repos.map((repo) => ({ repo, health: repoHealth(repo) })));
	const count = (level: string) => items.filter((i) => i.health.level === level).length;
	const errors = $derived(count('error'));
	const warnings = $derived(count('warning'));
	const pending = $derived(count('pending'));
	const healthy = $derived(count('ok'));
	const running = $derived(repos.filter((r) => r.connectionCount > 0));

	const problems = $derived(
		items
			.filter((i) => i.health.level === 'error' || i.health.level === 'warning')
			.sort((a, b) => severity[a.health.level] - severity[b.health.level])
	);

	const latest = $derived(
		repos
			.map((r) => r.lastBackupAt)
			.filter((d) => d != null)
			.sort((a, b) => b.getTime() - a.getTime())[0]
	);

	const state = $derived(
		errors ? 'error' : warnings ? 'warning' : healthy ? 'ok' : repos.length ? 'pending' : 'empty'
	);

	const headline = $derived(
		{
			error: `${errors + warnings} ${errors + warnings === 1 ? 'repository needs' : 'repositories need'} attention`,
			warning: `${warnings} ${warnings === 1 ? 'repository needs' : 'repositories need'} attention`,
			ok: 'All backups are running normally',
			pending: 'Waiting for the first backup',
			empty: 'No repositories yet'
		}[state]
	);

	const subline = $derived.by(() => {
		if (state === 'ok')
			return `${healthy === 1 ? 'The repository is' : `All ${healthy} repositories are`} backed up on schedule${latest ? ` · latest backup ${formatRelative(latest)}` : ''}.`;
		if (state === 'pending') return 'Add a key and run the first backup to start monitoring.';
		if (state === 'empty') return 'Create a repository to start backing up.';
		return `${healthy} healthy · ${errors} failing · ${warnings} with warnings${pending ? ` · ${pending} not set up` : ''}`;
	});

	const tone = {
		ok: {
			box: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-900/70 dark:from-emerald-950/60 dark:to-zinc-900/60',
			icon: 'bg-emerald-500 text-white shadow-emerald-500/30',
			name: 'check'
		},
		warning: {
			box: 'border-amber-200 bg-gradient-to-br from-amber-50 to-white dark:border-amber-900/70 dark:from-amber-950/50 dark:to-zinc-900/60',
			icon: 'bg-amber-500 text-white shadow-amber-500/30',
			name: 'alert'
		},
		error: {
			box: 'border-red-200 bg-gradient-to-br from-red-50 to-white dark:border-red-900/70 dark:from-red-950/50 dark:to-zinc-900/60',
			icon: 'bg-red-500 text-white shadow-red-500/30',
			name: 'x'
		},
		pending: {
			box: 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60',
			icon: 'bg-zinc-200 text-zinc-500 shadow-transparent dark:bg-zinc-800 dark:text-zinc-400',
			name: 'clock'
		},
		empty: {
			box: 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60',
			icon: 'bg-zinc-200 text-zinc-500 shadow-transparent dark:bg-zinc-800 dark:text-zinc-400',
			name: 'database'
		}
	} as const;
	const t = $derived(tone[state]);
</script>

<section class={['rounded-2xl border p-5 sm:p-6', t.box]} aria-live="polite">
	<div class="flex flex-wrap items-start gap-4 sm:gap-5">
		<span class={['grid size-12 shrink-0 place-items-center rounded-2xl shadow-lg', t.icon]}>
			<Icon name={t.name} class="size-6" strokeWidth={2.5} />
		</span>
		<div class="min-w-[12rem] flex-1">
			<h2 class="text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl dark:text-zinc-50">
				{headline}
			</h2>
			<p class="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{subline}</p>
		</div>
		{#if running.length}
			<span
				class="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300"
			>
				<span class="relative flex size-2">
					<span
						class="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-75"
					></span>
					<span class="relative inline-flex size-2 rounded-full bg-sky-500"></span>
				</span>
				{running.length === 1
					? `${running[0].name} is backing up`
					: `${running.length} backups running`}
			</span>
		{/if}
	</div>

	{#if problems.length}
		<ul class="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
			{#each problems as { repo, health } (repo.id)}
				<li class="min-w-0">
					<a
						href="/repos/{repo.id}"
						class="flex items-start gap-3 rounded-xl border border-zinc-200/80 bg-white/80 px-3.5 py-3 transition-colors hover:border-zinc-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-700"
					>
						<Icon
							name={health.level === 'error' ? 'circle-x' : 'alert'}
							class={[
								'mt-0.5 size-4',
								health.level === 'error'
									? 'text-red-600 dark:text-red-400'
									: 'text-amber-600 dark:text-amber-400'
							]}
						/>
						<span class="min-w-0 text-sm">
							<span class="font-semibold text-zinc-900 dark:text-zinc-100">
								{repo.owner ? `${repo.owner.name}/` : ''}{repo.name}
							</span>
							<span class="text-zinc-500"> – {health.label}</span>
							<span class="block truncate text-xs text-zinc-500 dark:text-zinc-400">
								{repo.lastBackupAt
									? `Last backup ${formatRelative(repo.lastBackupAt)}. `
									: ''}{health.detail}
							</span>
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>
