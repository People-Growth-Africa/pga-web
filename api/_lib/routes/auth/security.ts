import { auditedMutation } from '../../audit.js';
import {
  isAdminPortalRole,
  isContentManagerRole,
  listLoginEvents,
  listServerSessions,
  revokeServerSession,
} from '../../db.js';
import { ApiError, endpoint, parseJsonBody, sendJson } from '../../http.js';
import { requireAnySession } from '../../current-user.js';

export default endpoint({ methods: ['GET', 'PATCH'], csrf: true }, async (req, res) => {
  const { user, session } = await requireAnySession(req, res);

  if (req.method === 'GET') {
    const [sessions, loginEvents] = await Promise.all([
      listServerSessions(user.id),
      listLoginEvents(user.id),
    ]);
    sendJson(res, 200, {
      sessions: sessions.map((item) => ({ ...item, current: item.id === session.sessionId })),
      loginEvents,
    });
    return;
  }

  const body: unknown = parseJsonBody(req);
  if (
    typeof body !== 'object' ||
    body === null ||
    !('sessionId' in body) ||
    typeof body.sessionId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.sessionId)
  ) {
    throw new ApiError(400, 'invalid_session_id', 'Choose a valid session to revoke.');
  }

  const staffActor = isAdminPortalRole(user.role) || isContentManagerRole(user.role);
  const revoked = staffActor
    ? (await auditedMutation<{ id: string }>({
        req,
        actor: { id: user.id, email: user.email, role: user.role },
        action: 'auth.logout',
        entity: { type: 'auth_session', id: body.sessionId },
        mutationSql: `UPDATE sessions SET revoked_at = now()
                       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
                       RETURNING id`,
        mutationParams: [body.sessionId, user.id],
      })).length > 0
    : await revokeServerSession(user.id, body.sessionId);
  if (!revoked) throw new ApiError(404, 'session_not_found', 'That active session could not be found.');

  sendJson(res, 200, { ok: true });
});
