<script lang="ts">
	import { page } from '$app/state';
	import { Button, Icon } from '#lib/components/ui/index.js';
</script>

<div class="mx-auto flex max-w-md flex-col items-center py-16 text-center">
	<span
		class="grid size-14 place-items-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
	>
		<Icon name="alert" class="size-7" />
	</span>
	<p class="mt-5 text-sm font-semibold text-zinc-400">Error {page.status}</p>
	<h1 class="mt-1 text-xl font-semibold">{page.error?.message ?? 'Something went wrong'}</h1>
	<Button href="/" variant="secondary" class="mt-6">
		<Icon name="chevron-left" class="size-4" />Back to dashboard
	</Button>
</div>
