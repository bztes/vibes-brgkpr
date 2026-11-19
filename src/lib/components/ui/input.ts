import { tv } from 'tailwind-variants';

export const input = tv({
	base: [
		'block w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-sm',
		'placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none',
		'dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100',
		'aria-invalid:border-red-500 aria-invalid:focus:ring-red-500/30',
		'disabled:opacity-60'
	],
	variants: {
		kind: {
			input: 'h-10',
			textarea: 'min-h-24 py-2 font-mono',
			select: 'h-10 pr-8'
		}
	},
	defaultVariants: { kind: 'input' }
});
