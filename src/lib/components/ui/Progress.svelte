<script lang="ts">
	import { tv } from 'tailwind-variants';

	const progress = tv({
		slots: {
			track: 'h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800',
			bar: 'h-full rounded-full transition-[width]'
		},
		variants: {
			tone: {
				ok: { bar: 'bg-emerald-500' },
				warn: { bar: 'bg-amber-500' },
				full: { bar: 'bg-red-500' }
			}
		}
	});

	interface Props {
		/** 0..1 */
		value: number;
		label: string;
		class?: string;
	}

	let { value, label, class: className }: Props = $props();
	const clamped = $derived(Math.min(1, Math.max(0, value)));
	const s = $derived(progress({ tone: clamped >= 0.9 ? 'full' : clamped >= 0.75 ? 'warn' : 'ok' }));
</script>

<div
	class={s.track({ class: className })}
	role="progressbar"
	aria-label={label}
	aria-valuemin={0}
	aria-valuemax={100}
	aria-valuenow={Math.round(clamped * 100)}
>
	<div class={s.bar()} style:width="{clamped * 100}%"></div>
</div>
