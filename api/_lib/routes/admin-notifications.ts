import {
  countNotifications,
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../db.js';
import { endpoint, parseJsonBody, sendJson } from '../http.js';
import { requireStaff } from '../staff.js';
import {
  notificationListQuerySchema,
  notificationMutationSchema,
  parseInput,
} from '../validation.js';

export default endpoint({ methods: ['GET', 'PATCH'], csrf: true }, async (req, res) => {
  const session = await requireStaff(req, res);

  if (req.method === 'GET') {
    const query = parseInput(notificationListQuerySchema, {
      page: req.query?.page,
      pageSize: req.query?.pageSize,
      unreadOnly: req.query?.unreadOnly,
    });
    const offset = (query.page - 1) * query.pageSize;
    const [notifications, totalCount, unreadCount] = await Promise.all([
      listNotifications({
        userId: session.userId,
        limit: query.pageSize,
        offset,
        unreadOnly: query.unreadOnly,
      }),
      countNotifications(session.userId, query.unreadOnly),
      countUnreadNotifications(session.userId),
    ]);
    sendJson(res, 200, {
      notifications,
      totalCount,
      unreadCount,
      page: query.page,
      pageSize: query.pageSize,
    });
    return;
  }

  const mutation = parseInput(notificationMutationSchema, parseJsonBody(req));
  if (mutation.action === 'all') {
    const updatedCount = await markAllNotificationsRead(session.userId);
    sendJson(res, 200, { updatedCount });
    return;
  }

  const updated = await markNotificationRead(session.userId, mutation.id);
  sendJson(res, 200, { updated });
});
