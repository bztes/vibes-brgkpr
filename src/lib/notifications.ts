export const notificationLevels = ['error', 'warning', 'success'] as const;
export type NotificationLevel = (typeof notificationLevels)[number];

export const levelInfo: Record<NotificationLevel, { label: string; hint: string }> = {
	error: { label: 'Errors', hint: 'A repository has not received a backup for too long' },
	warning: { label: 'Warnings', hint: 'Repository quota or storage limit almost reached' },
	success: { label: 'Recoveries', hint: 'Backups have resumed after an alert' }
};

export const channelTypes = {
	email: { label: 'Email', hint: 'Send messages to an email address (requires SMTP setup).' },
	ntfy: { label: 'ntfy', hint: 'Push notifications to your phone or desktop via an ntfy topic.' }
} as const;
