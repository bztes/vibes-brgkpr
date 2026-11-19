/**
 * All permissions a non-admin user can be granted. Administrators implicitly have all of them.
 * Adding a permission only requires a new entry here (no DB migration): users store their
 * granted permissions as a JSON array.
 */
export const PERMISSIONS = {
	'repo:create': {
		label: 'Can create repositories',
		hint: 'Otherwise only administrators can create repositories for this user.'
	}
} as const satisfies Record<string, { label: string; hint: string }>;

export type Permission = keyof typeof PERMISSIONS;

export const permissionKeys = Object.keys(PERMISSIONS) as Permission[];

export const isPermission = (p: string): p is Permission => p in PERMISSIONS;

/** Drops unknown entries, e.g. permissions that were removed from the code. */
export const sanitizePermissions = (list: readonly string[]): Permission[] =>
	permissionKeys.filter((p) => list.includes(p));

export function hasPermission(
	u: { role: 'admin' | 'user'; permissions: readonly string[] },
	p: Permission
) {
	return u.role === 'admin' || u.permissions.includes(p);
}
