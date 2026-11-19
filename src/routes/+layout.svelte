<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import Icon, { type IconName } from '#lib/components/ui/Icon.svelte';
	import { getMe, logout } from '#lib/api/auth.remote.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const me = $derived(await getMe());

	interface NavItem {
		href: string;
		label: string;
		icon: IconName;
		exact?: boolean;
	}

	const mainNav: NavItem[] = [
		{ href: '/', label: 'Dashboard', icon: 'dashboard', exact: true },
		{ href: '/account', label: 'Account', icon: 'user' }
	];
	const adminNav: NavItem[] = [
		{ href: '/admin/repos', label: 'Repositories', icon: 'database' },
		{ href: '/admin/users', label: 'Users', icon: 'users' },
		{ href: '/admin/settings', label: 'Settings', icon: 'settings' }
	];

	const isActive = (item: NavItem) =>
		item.exact ? page.url.pathname === item.href : page.url.pathname.startsWith(item.href);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>brgkpr</title>
</svelte:head>

{#snippet brand()}
	<a href="/" class="flex items-center gap-2.5 font-semibold tracking-tight">
		<img src={favicon} alt="" class="size-7" />
		<span class="text-[17px]">brgkpr</span>
	</a>
{/snippet}

{#snippet navLink(item: NavItem, mobile: boolean)}
	{@const active = isActive(item)}
	<a
		href={item.href}
		aria-current={active ? 'page' : undefined}
		class={[
			'flex items-center gap-3 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
			mobile ? 'px-3 py-1.5' : 'px-3 py-2',
			active
				? 'bg-zinc-900/5 text-zinc-900 dark:bg-white/10 dark:text-white'
				: 'text-zinc-600 hover:bg-zinc-900/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100'
		]}
	>
		<Icon
			name={item.icon}
			class={['size-[18px]', active ? 'text-emerald-600 dark:text-emerald-400' : '']}
		/>
		{item.label}
	</a>
{/snippet}

{#if me}
	<div class="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
		<!-- sidebar (desktop) -->
		<aside
			class="sticky top-0 hidden h-screen flex-col border-r border-zinc-200/80 bg-white/60 px-3 py-5 backdrop-blur lg:flex dark:border-zinc-800 dark:bg-zinc-900/40"
		>
			<div class="px-3">{@render brand()}</div>

			<nav class="mt-8 flex flex-1 flex-col gap-1">
				{#each mainNav as item (item.href)}{@render navLink(item, false)}{/each}
				{#if me.role === 'admin'}
					<p
						class="mt-6 mb-1 px-3 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase dark:text-zinc-500"
					>
						Administration
					</p>
					{#each adminNav as item (item.href)}{@render navLink(item, false)}{/each}
				{/if}
			</nav>

			<div
				class="flex items-center gap-3 border-t border-zinc-200/80 px-2 pt-4 dark:border-zinc-800"
			>
				<span
					class="grid size-8 place-items-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800 uppercase dark:bg-emerald-950 dark:text-emerald-300"
				>
					{me.name.slice(0, 1)}
				</span>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium">{me.name}</p>
					<p class="text-xs text-zinc-500">{me.role === 'admin' ? 'Administrator' : 'User'}</p>
				</div>
				<form {...logout}>
					<button
						class="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
						title="Log out"
						aria-label="Log out"
					>
						<Icon name="logout" class="size-[18px]" />
					</button>
				</form>
			</div>
		</aside>

		<!-- top bar (mobile) -->
		<header
			class="sticky top-0 z-10 border-b border-zinc-200/80 bg-white/80 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-950/80"
		>
			<div class="flex items-center justify-between px-4 pt-3">
				{@render brand()}
				<form {...logout.for('mobile')}>
					<button
						class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
					>
						<span class="max-w-40 truncate">{me.name}</span>
						<Icon name="logout" class="size-4" />
					</button>
				</form>
			</div>
			<nav class="flex gap-1 overflow-x-auto px-3 py-2">
				{#each mainNav as item (item.href)}{@render navLink(item, true)}{/each}
				{#if me.role === 'admin'}
					{#each adminNav as item (item.href)}{@render navLink(item, true)}{/each}
				{/if}
			</nav>
		</header>

		<main class="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
			{@render children()}
		</main>
	</div>
{:else}
	<main
		class="grid min-h-screen place-items-center bg-[radial-gradient(ellipse_at_top,var(--color-emerald-100),transparent_60%)] px-4 py-12 dark:bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--color-emerald-900)_40%,transparent),transparent_60%)]"
	>
		{@render children()}
	</main>
{/if}
