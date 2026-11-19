<script lang="ts">
	import { Alert, Button, Card, Field, Input } from '#lib/components/ui/index.js';
	import { getSignupStatus, signup } from '#lib/api/auth.remote.js';
	import favicon from '#lib/assets/favicon.svg';

	const status = $derived(await getSignupStatus());
	const { email, username, _password, _passwordConfirm } = signup.fields;
</script>

<svelte:head><title>Sign up · brgkpr</title></svelte:head>

<div class="w-full max-w-sm">
	<div class="mb-8 flex flex-col items-center text-center">
		<img src={favicon} alt="" class="size-12" />
		<h1 class="mt-4 text-2xl font-semibold tracking-tight">
			{status.firstUser ? 'Create administrator' : 'Create your account'}
		</h1>
		<p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
			{status.firstUser
				? 'The first account becomes the administrator. Registration is closed afterwards.'
				: 'Start monitoring your Borg backups'}
		</p>
	</div>

	{#if !status.enabled}
		<Alert tone="warning" title="Registration closed">
			New accounts can only be created by an administrator.
			<a href="/login" class="mt-2 block font-medium underline">Go to login</a>
		</Alert>
	{:else}
		<Card class="shadow-lg shadow-zinc-900/5">
			<form {...signup} class="flex flex-col gap-4">
				{#each signup.fields.allIssues() ?? [] as issue (issue.message)}
					{#if !issue.path.length}<Alert tone="danger">{issue.message}</Alert>{/if}
				{/each}

				<Field label="Email" hint="Used to log in" issues={email.issues()}>
					<Input {...email.as('email')} autocomplete="username" required />
				</Field>
				<Field
					label="Username (optional)"
					hint="Shown instead of your email"
					issues={username.issues()}
				>
					<Input {...username.as('text')} autocomplete="nickname" />
				</Field>
				<Field label="Password" issues={_password.issues()}>
					<Input {..._password.as('password')} autocomplete="new-password" required />
				</Field>
				<Field label="Repeat password" issues={_passwordConfirm.issues()}>
					<Input {..._passwordConfirm.as('password')} autocomplete="new-password" required />
				</Field>
				<Button disabled={!!signup.pending}>Create account</Button>
			</form>
		</Card>
		<p class="mt-4 text-center text-sm text-zinc-500">
			Already have an account? <a
				href="/login"
				class="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
				>Log in</a
			>
		</p>
	{/if}
</div>
