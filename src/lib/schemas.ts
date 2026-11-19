import * as v from 'valibot';
import { repoTypes } from './repo-types.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** the login, stored lowercased */
export const email = v.pipe(
	v.string(),
	v.trim(),
	v.toLowerCase(),
	v.nonEmpty('Email is required'),
	v.regex(emailPattern, 'Invalid email address'),
	v.maxLength(254)
);

/** optional display name (empty = none) */
export const optionalUsername = v.pipe(
	v.optional(v.string(), ''),
	v.trim(),
	v.toLowerCase(),
	v.check(
		(s) => s === '' || /^[a-z0-9][a-z0-9_-]{1,31}$/.test(s),
		'2–32 characters: lowercase letters, digits, "-" and "_" (not at the start)'
	)
);

export const password = v.pipe(v.string(), v.minLength(8, 'At least 8 characters'));

export const optionalEmail = v.pipe(
	v.optional(v.string(), ''),
	v.trim(),
	v.check((s) => s === '' || emailPattern.test(s), 'Invalid email address')
);

export const repoName = v.pipe(
	v.string(),
	v.trim(),
	v.regex(
		/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/,
		'1–64 characters: letters, digits, ".", "-" and "_" (not at the start)'
	)
);

const optionalPositive = (msg: string) =>
	v.optional(v.pipe(v.number(msg), v.minValue(0, 'Must not be negative')));

/** enforced by the backend, see updateRepoAccess */
export const repoAccessSettings = {
	quotaGb: optionalPositive('Quota must be a number'),
	appendOnly: v.optional(v.boolean(), false)
};

export const repoSettings = {
	description: v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(500)),
	alertAfterHours: v.optional(
		v.pipe(v.number(), v.integer('Whole hours only'), v.minValue(0), v.maxValue(24 * 365))
	)
};

export const createRepoSchema = v.object({
	name: repoName,
	type: v.picklist(repoTypes, 'Choose a backup tool'),
	/** admins only: create the repository for another user (empty = yourself) */
	ownerId: v.optional(v.string(), ''),
	...repoSettings
});

export const loginSchema = v.object({
	email: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.nonEmpty('Email is required')),
	_password: v.pipe(v.string(), v.nonEmpty('Password is required'))
});

export const signupSchema = v.pipe(
	v.object({
		email,
		username: optionalUsername,
		_password: password,
		_passwordConfirm: v.string()
	}),
	v.forward(
		v.partialCheck(
			[['_password'], ['_passwordConfirm']],
			(d) => d._password === d._passwordConfirm,
			'Passwords do not match'
		),
		['_passwordConfirm']
	)
);

/** per-key options, applied in addition to the repository's */
export const keySettings = {
	appendOnly: v.optional(v.boolean(), false)
};

export const addKeySchema = v.object({
	repoId: v.string(),
	name: v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(100)),
	/** borg only: the SSH public key (restic keys are generated) */
	publicKey: v.pipe(v.optional(v.string(), ''), v.trim()),
	...keySettings
});

export const updateKeySchema = v.object({
	id: v.string(),
	name: v.pipe(v.string(), v.trim(), v.nonEmpty('Name is required'), v.maxLength(100)),
	...keySettings
});
