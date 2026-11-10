import { createBestEffortNotification } from './notifications.js';
import { observeThreshold } from './ratelimit.js';
import { SECURITY_ALERT_EVENTS, SECURITY_ALERT_THRESHOLDS } from './security-alert-config.js';

export async function reportFailedLogin(email: string, ip: string): Promise<void> {
  try {
    const [emailThresholdReached, ipThresholdReached] = await Promise.all([
      observeThreshold({
        name: 'security-failed-login-email',
        identifier: email,
        limit: SECURITY_ALERT_THRESHOLDS.failedLoginAttempts - 1,
        windowSeconds: SECURITY_ALERT_THRESHOLDS.failedLoginWindowSeconds,
      }),
      observeThreshold({
        name: 'security-failed-login-ip',
        identifier: ip,
        limit: SECURITY_ALERT_THRESHOLDS.failedLoginAttempts - 1,
        windowSeconds: SECURITY_ALERT_THRESHOLDS.failedLoginWindowSeconds,
      }),
    ]);
    if (emailThresholdReached || ipThresholdReached) {
      await createBestEffortNotification({
        event: SECURITY_ALERT_EVENTS.repeatedFailedLogins,
      });
    }
  } catch {
    console.error('[security-alert] failed-login alert evaluation failed');
  }
}

export async function reportRecordDeletion(actorId: string, recordCount = 1): Promise<void> {
  try {
    let thresholdReached = false;
    for (let index = 0; index < Math.min(recordCount, SECURITY_ALERT_THRESHOLDS.bulkDeleteRecords + 1); index += 1) {
      thresholdReached = await observeThreshold({
        name: 'security-bulk-delete',
        identifier: actorId,
        limit: SECURITY_ALERT_THRESHOLDS.bulkDeleteRecords,
        windowSeconds: SECURITY_ALERT_THRESHOLDS.bulkDeleteWindowSeconds,
      });
      if (thresholdReached) break;
    }
    if (thresholdReached) {
      await createBestEffortNotification({
        event: SECURITY_ALERT_EVENTS.bulkDelete,
      });
    }
  } catch {
    console.error('[security-alert] bulk-delete alert evaluation failed');
  }
}
