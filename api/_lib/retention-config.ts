export const RETENTION_DEFAULTS = {
  softDeletedRecords: { days: 30 },
  eventRegistrations: { monthsAfterEvent: 24 },
  unsubscribedEmails: { days: 30 },
  completedConsultations: { monthsAfterDone: 24 },
  failedLoginEvents: { days: 90 },
  expiredOrRevokedSessions: { days: 30 },
  alerts: { months: 12 },
  auditLogs: { minimumMonths: 24, autoPurge: false },
  readNotifications: { days: 90 },
  unreadNotifications: { months: 12 },
  rawTrafficHits: { days: 60, configurable: true },
} as const;
