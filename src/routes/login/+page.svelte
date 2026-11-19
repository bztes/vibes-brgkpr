<script lang="ts">
	import { Alert, Button, Card, Field, Input } from '#lib/components/ui/index.js';
	import { getSignupStatus, login } from '#lib/api/auth.remote.js';
	import favicon from '#lib/assets/favicon.svg';

	const signup = $derived(await getSignupStatus());
	const { email, _password } = login.fields;
</script>

<svelte:head><title>Log in · brgkpr</title></svelte:head>

<div class="w-full max-w-sm">
	<div class="mb-8 flex flex-col items-center text-center">
		<img src={favicon} alt="" class="size-12" />
		<h1 class="mt-4 text-2xl font-semibold tracking-tight">Welcome back</h1>
		<p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
			Log in to check on your Borg backups
		</p>
	</div>

	{#if signup.firstUser}
		<Alert tone="info" class="mb-4">
			There are no users yet. <a href="/signup" class="font-medium underline"
				>Create the administrator account now.</a
			>
		</Alert>
	{/if}

	<Card class="shadow-lg shadow-zinc-900/5">
		<form {...login} class="flex flex-col gap-4">
			{#each login.fields.allIssues() ?? [] as issue (issue.message)}
				{#if !issue.path.length}<Alert tone="danger">{issue.message}</Alert>{/if}
			{/each}

			<Field label="Email" issues={email.issues()}>
				<Input {...email.as('email')} autocomplete="username" required />
			</Field>
			<Field label="Password" issues={_password.issues()}>
				<Input {..._password.as('password')} autocomplete="current-password" required />
			</Field>
			<Button disabled={!!login.pending}>Log in</Button>
		</form>
	</Card>

	{#if signup.enabled && !signup.firstUser}
		<p class="mt-4 text-center text-sm text-zinc-500">
			No account yet? <a
				href="/signup"
				class="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
				>Sign up</a
			>
		</p>
	{/if}
</div>
