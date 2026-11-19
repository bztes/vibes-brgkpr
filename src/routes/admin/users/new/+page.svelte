<script lang="ts">
	import {
		Alert,
		Button,
		Card,
		Checkbox,
		Field,
		Input,
		PageHeader,
		Select
	} from '#lib/components/ui/index.js';
	import { createUser, getAdminSettings } from '#lib/api/admin.remote.js';
	import { PERMISSIONS, permissionKeys } from '#lib/permissions.js';

	const settings = $derived(await getAdminSettings());
	const { email, username, _password, role, permissions } = createUser.fields;
	const back = { href: '/admin/users', label: 'Users' };
</script>

<svelte:head><title>New user · brgkpr</title></svelte:head>

<PageHeader
	title="New user"
	description="Storage limit and other settings can be changed afterwards."
	{back}
/>

<Card class="max-w-2xl">
	<form {...createUser} class="flex flex-col gap-5">
		{#each createUser.fields.allIssues() ?? [] as issue (issue.message)}
			{#if !issue.path.length}<Alert tone="danger">{issue.message}</Alert>{/if}
		{/each}

		<Field label="Email" hint="Used to log in" issues={email.issues()}>
			<Input {...email.as('email')} autocomplete="off" required />
		</Field>
		<Field label="Username (optional)" issues={username.issues()}>
			<Input {...username.as('text')} autocomplete="off" />
		</Field>
		<Field label="Password" issues={_password.issues()}>
			<Input {..._password.as('password')} autocomplete="new-password" required />
		</Field>
		<Field label="Role">
			<Select {...role.as('select', 'user')}>
				<option value="user">User</option>
				<option value="admin">Administrator</option>
			</Select>
		</Field>
		{#each permissionKeys as p (p)}
			<Checkbox
				{...permissions.as('checkbox', p, settings.defaultPermissions.includes(p))}
				label={PERMISSIONS[p].label}
				hint={PERMISSIONS[p].hint}
			/>
		{/each}

		<div class="flex gap-2">
			<Button disabled={!!createUser.pending}>Create user</Button>
			<Button href={back.href} variant="ghost">Cancel</Button>
		</div>
	</form>
</Card>
