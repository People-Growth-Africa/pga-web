import { countUnreadNotifications } from '../db.js';
import { endpoint, sendJson } from '../http.js';
import { requireStaff } from '../staff.js';

export default endpoint({ methods: ['GET'] }, async (req, res) => {
  const session = await requireStaff(req, res);
  sendJson(res, 200, { unreadCount: await countUnreadNotifications(session.userId) });
});
