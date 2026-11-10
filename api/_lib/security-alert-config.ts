export const SECURITY_ALERT_THRESHOLDS = {
  largeExportRows: 200,
  bulkDeleteRecords: 5,
  bulkDeleteWindowSeconds: 10 * 60,
  failedLoginAttempts: 5,
  failedLoginWindowSeconds: 15 * 60,
  notificationDedupeSeconds: 30 * 60,
} as const;

export const SECURITY_ALERT_EVENTS = {
  export: 'security.export',
  roleChange: 'security.role_change',
  accountDisable: 'security.account_disable',
  bulkDelete: 'security.bulk_delete',
  repeatedFailedLogins: 'security.failed_login',
  retentionPurge: 'security.retention_purge',
} as const;

export type SecurityAlertEvent = (typeof SECURITY_ALERT_EVENTS)[keyof typeof SECURITY_ALERT_EVENTS];
