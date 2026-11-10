import {
  createNotification,
  listNotificationRecipientIds,
} from './db.js';
import { sendSecurityAlertEmail } from './email.js';
import { NOTIFICATION_RECIPIENTS, type NotificationEvent } from './notification-config.js';
import { SECURITY_ALERT_EVENTS, SECURITY_ALERT_THRESHOLDS } from './security-alert-config.js';

const SECURITY_ALERT_TYPES: ReadonlySet<string> = new Set(Object.values(SECURITY_ALERT_EVENTS));

type NotificationInput =
  | { event: 'access_request.created'; permission: string; requesterName: string | null }
  | { event: 'access_request.decided'; permission: string; status: 'approved' | 'declined'; recipientUserId: string }
  | { event: 'consultation.created' }
  | { event: 'consultation.assigned'; assigneeId: string }
  | { event: 'consultation.stale'; bookingId: string }
  | { event: 'content.auto_published'; contentTitle: string; recipientUserId: string | null }
  | { event: typeof SECURITY_ALERT_EVENTS.export; dataset: string; rowCount: number; sensitive: boolean }
  | { event: typeof SECURITY_ALERT_EVENTS.roleChange; previousRole: string; nextRole: string }
  | { event: typeof SECURITY_ALERT_EVENTS.accountDisable }
  | { event: typeof SECURITY_ALERT_EVENTS.bulkDelete }
  | { event: typeof SECURITY_ALERT_EVENTS.repeatedFailedLogins }
  | {
      event: typeof SECURITY_ALERT_EVENTS.retentionPurge;
      counts: readonly { dataset: string; eligible: number }[];
    }

function notificationCopy(input: NotificationInput): {
  title: string;
  body: string;
  href: string;
  severity: 'info' | 'warning' | 'critical';
} {
  switch (input.event) {
    case 'access_request.created':
      return {
        title: 'Access request',
        body: `${input.requesterName?.trim() || 'A staff member'} requested ${input.permission} access.`,
        href: '/admin/access',
        severity: 'info',
      };
    case 'access_request.decided':
      return {
        title: `Access request ${input.status}`,
        body: `Your request for ${input.permission} access was ${input.status}.`,
        href: '/admin/my-access',
        severity: 'info',
      };
    case 'consultation.created':
      return {
        title: 'New consultation request',
        body: 'A new consultation booking was submitted.',
        href: '/admin/data',
        severity: 'info',
      };
    case 'consultation.stale':
      return {
        title: 'Consultation needs follow-up',
        body: 'A new consultation booking has been waiting for more than 48 hours.',
        href: '/admin/data',
        severity: 'warning',
      };
    case 'consultation.assigned':
      return {
        title: 'Consultation assigned',
        body: 'A consultation booking was assigned to you.',
        href: '/admin/data',
        severity: 'info',
      };
    case 'content.auto_published':
      return {
        title: 'Content automatically published',
        body: input.contentTitle.trim().slice(0, 500),
        href: '/admin/oversight',
        severity: 'info',
      };
    case SECURITY_ALERT_EVENTS.export:
      return {
        title: 'Sensitive data export',
        body: input.sensitive
          ? `An export of talent/employer account records completed (${input.rowCount} rows).`
          : `A large ${input.dataset} export completed (${input.rowCount} rows).`,
        href: '/admin/audit-log',
        severity: 'warning',
      };
    case SECURITY_ALERT_EVENTS.roleChange:
      return {
        title: 'Staff role changed',
        body: `A staff account role changed from ${input.previousRole} to ${input.nextRole}.`,
        href: '/admin/staff',
        severity: 'critical',
      };
    case SECURITY_ALERT_EVENTS.accountDisable:
      return {
        title: 'Staff account disabled',
        body: 'A staff account was disabled.',
        href: '/admin/staff',
        severity: 'critical',
      };
    case SECURITY_ALERT_EVENTS.bulkDelete:
      return {
        title: 'Repeated record deletions',
        body: `An administrator deleted more than ${SECURITY_ALERT_THRESHOLDS.bulkDeleteRecords} records within 10 minutes.`,
        href: '/admin/audit-log',
        severity: 'warning',
      };
    case SECURITY_ALERT_EVENTS.repeatedFailedLogins:
      return {
        title: 'Repeated failed sign-ins',
        body: `At least ${SECURITY_ALERT_THRESHOLDS.failedLoginAttempts} failed sign-in attempts were detected within 15 minutes.`,
        href: '/admin/audit-log',
        severity: 'critical',
      };
    case SECURITY_ALERT_EVENTS.retentionPurge:
      return {
        title: 'Scheduled data purge summary',
        body: input.counts
          .map((row) => `${row.dataset}: ${row.eligible}`)
          .join('; ')
          .slice(0, 500) || 'No records were eligible for deletion.',
        href: '/admin/retention',
        severity: 'warning',
      };
  }
}

/**
 * Notifications are an auxiliary signal: recipient lookup, inserts, or
 * malformed legacy data must never change the outcome of the action that
 * triggered them.
 */
export async function createBestEffortNotification(input: NotificationInput): Promise<void> {
  const event: NotificationEvent = input.event;
  try {
    const audience = NOTIFICATION_RECIPIENTS[event];
    const recipients = audience === 'requester'
      ? [input.event === 'access_request.decided' ? input.recipientUserId : '']
      : audience === 'author'
        ? [input.event === 'content.auto_published' ? input.recipientUserId ?? '' : '']
        : audience === 'assignee'
          ? [input.event === 'consultation.assigned' ? input.assigneeId : '']
          : await listNotificationRecipientIds(audience);
    const { title, body, href, severity } = notificationCopy(input);
    const results = await Promise.allSettled(
      [...new Set(recipients.filter(Boolean))].map((userId) =>
        createNotification({
          userId,
          type: event,
          severity,
          title,
          body,
          href,
          ...(input.event === 'consultation.stale'
            ? { dedupeKey: `consultation:${input.bookingId}` }
            : SECURITY_ALERT_TYPES.has(event)
            ? { dedupeSeconds: SECURITY_ALERT_THRESHOLDS.notificationDedupeSeconds }
            : {}),
        }),
      ),
    );
    if (results.some((result) => result.status === 'rejected')) {
      console.error('[notifications] one or more notification inserts failed', event);
    }
    if (
      SECURITY_ALERT_TYPES.has(event) &&
      results.some((result) => result.status === 'fulfilled' && result.value)
    ) {
      await sendSecurityAlertEmail({ title, body });
    }
  } catch {
    console.error('[notifications] best-effort notification creation failed', event);
  }
}
