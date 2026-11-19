import { tv, type VariantProps } from 'tailwind-variants';

export const button = tv({
	base: [
		'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-all',
		'focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none',
		'dark:focus-visible:ring-offset-zinc-900',
		'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50'
	],
	variants: {
		variant: {
			primary:
				'bg-zinc-900 text-white shadow-sm hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200',
			accent: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-500',
			secondary:
				'border border-zinc-200 bg-white text-zinc-800 shadow-xs hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100 dark:hover:bg-zinc-800',
			ghost:
				'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
			danger: 'bg-red-600 text-white shadow-sm hover:bg-red-500'
		},
		size: {
			sm: 'h-8 px-3 text-sm',
			md: 'h-10 px-4 text-sm',
			icon: 'size-8'
		}
	},
	defaultVariants: { variant: 'primary', size: 'md' }
});

export type ButtonVariants = VariantProps<typeof button>;
