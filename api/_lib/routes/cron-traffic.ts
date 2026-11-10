import { timingSafeEqual } from 'node:crypto';

import { ApiError, endpoint, headerValue, sendJson } from '../http.js';
import {
  auditExpiredPermissionGrants,
  cleanupPendingNewsletterSubscribers,
  cleanupTrafficHashes,
  markStaleConsultationsNotified,
  listDueScheduledPosts,
  publishScheduledPost,
} from '../db.js';
import { createBestEffortNotification } from '../notifications.js';
import { SECURITY_ALERT_EVENTS } from '../security-alert-config.js';
import { retentionSettingsAreEnabled, runRetentionSweep } from '../retention.js';
import { prepareAuditWrite } from '../audit.js';
import { announcePostChange } from '../indexnow.js';
import { markContentChanged } from '../content/version.js';
import { scheduleBestEffort } from '../best-effort.js';

/**
 * GET /api/cron/traffic-cleanup
 *
 * Vercel Cron calls this once a day. `CRON_SECRET` is compared in constant time
 * style by simply requiring the exact bearer value; without it the endpoint is
 * closed rather than open. Visitor hashes only need to survive long enough to
 * deduplicate a daily visitor, so anything older than two days goes.
 *
 * The same daily pass clears newsletter signups that never confirmed: their
 * link dies after 48 hours, and a pending row left for a week can only mislead
 * whoever reads the subscriber list.
 */
export default endpoint({ methods: ['GET'] }, async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new ApiError(503, 'cron_not_configured', 'CRON_SECRET is not set.');
  }
  const authorization = headerValue(req.headers.authorization) ?? '';
  const expected = `Bearer ${secret}`;
  const supplied = Buffer.from(authorization);
  const wanted = Buffer.from(expected);
  if (supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) {
    throw new ApiError(401, 'unauthorized', 'Not allowed.');
  }

  const [deleted, pendingSubscribersDeleted, expiredGrantsAudited] = await Promise.all([
    cleanupTrafficHashes(),
    cleanupPendingNewsletterSubscribers(),
    auditExpiredPermissionGrants(),
  ]);
  const [retentionPreview, purgeEnabled] = await Promise.all([
    runRetentionSweep(false, req),
    retentionSettingsAreEnabled(),
  ]);
  const staleConsultations = await markStaleConsultationsNotified();
  const staleNotificationResults = await Promise.allSettled(
    staleConsultations.map((bookingId) =>
      createBestEffortNotification({ event: 'consultation.stale', bookingId }),
    ),
  );
  if (staleNotificationResults.some((result) => result.status === 'rejected')) {
    console.error('[notifications] one or more stale consultation notifications failed');
  }
  const duePosts = await listDueScheduledPosts();
  let autoPublished = 0;
  for (const post of duePosts) {
    const audit = prepareAuditWrite({
      req,
      actor: { id: null, email: 'System', role: null },
      action: 'content.auto_published',
      entity: { type: post.type === 'event' ? 'event' : 'post', id: post.id, label: post.title },
      before: { type: post.type, slug: post.slug, title: post.title, status: 'scheduled', publish_at: post.publish_at },
      after: { type: post.type, slug: post.slug, title: post.title, status: 'published' },
    });
    if (!(await publishScheduledPost(post.id, audit))) continue;
    autoPublished += 1;
    announcePostChange({ type: post.type, slug: post.slug, status: 'published', previous: 'scheduled' });
    scheduleBestEffort(
      () => createBestEffortNotification({
        event: 'content.auto_published',
        contentTitle: post.title,
        recipientUserId: post.author_id,
      }),
      'notification',
    );
  }
  if (autoPublished > 0) markContentChanged();
  let retentionPurge: Awaited<ReturnType<typeof runRetentionSweep>> = [];
  if (purgeEnabled) {
    await createBestEffortNotification({
      event: SECURITY_ALERT_EVENTS.retentionPurge,
      counts: retentionPreview.map(({ dataset, eligible }) => ({ dataset, eligible })),
    });
    retentionPurge = await runRetentionSweep(true, req);
  }
  sendJson(res, 200, {
    ok: true,
    deleted,
    pendingSubscribersDeleted,
    expiredGrantsAudited,
    staleConsultationsNotified: staleConsultations.length,
    autoPublished,
    retention: { mode: purgeEnabled ? 'purge' : 'dry-run', preview: retentionPreview, purge: retentionPurge },
  });
});
