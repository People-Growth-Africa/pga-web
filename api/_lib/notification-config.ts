import { SECURITY_ALERT_EVENTS } from './security-alert-config.js';

export type NotificationAudience =
  | 'requester'
  | 'author'
  | 'assignee'
  | 'consultation_update'
  | 'super_admin'
  | 'admin_portal';

export const NOTIFICATION_RECIPIENTS = {
  'access_request.created': 'super_admin',
  'access_request.decided': 'requester',
  'consultation.created': 'consultation_update',
  'consultation.assigned': 'assignee',
  'consultation.stale': 'consultation_update',
  'content.auto_published': 'author',
  [SECURITY_ALERT_EVENTS.export]: 'super_admin',
  [SECURITY_ALERT_EVENTS.roleChange]: 'super_admin',
  [SECURITY_ALERT_EVENTS.accountDisable]: 'super_admin',
  [SECURITY_ALERT_EVENTS.bulkDelete]: 'super_admin',
  [SECURITY_ALERT_EVENTS.repeatedFailedLogins]: 'super_admin',
  [SECURITY_ALERT_EVENTS.retentionPurge]: 'super_admin',
} as const satisfies Record<string, NotificationAudience>;

export type NotificationEvent = keyof typeof NOTIFICATION_RECIPIENTS;
