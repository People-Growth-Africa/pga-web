import { auditActorForUser, auditedMutation } from '../audit.js';
import { findStaffAccount, listLoginEvents, listServerSessions } from '../db.js';
import { ApiError, endpoint, parseJsonBody, sendJson } from '../http.js';
import { requireSuperAdmin } from '../staff.js';

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default endpoint({ methods: ['GET', 'POST'], csrf: true }, async (req, res) => {
  const { session } = await requireSuperAdmin(req, res);

  if (req.method === 'GET') {
    const userId = req.query?.userId;
    if (!isUuid(userId)) throw new ApiError(400, 'invalid_user_id', 'Choose a valid staff account.');
    const staff = await findStaffAccount(userId);
    if (!staff) throw new ApiError(404, 'staff_not_found', 'That staff account could not be found.');
    const [sessions, loginEvents] = await Promise.all([
      listServerSessions(userId),
      listLoginEvents(userId),
    ]);
    sendJson(res, 200, { staff, sessions, loginEvents });
    return;
  }

  const body: unknown = parseJsonBody(req);
  if (
    typeof body !== 'object' ||
    body === null ||
    !('userId' in body) ||
    !isUuid(body.userId)
  ) {
    throw new ApiError(400, 'invalid_user_id', 'Choose a valid staff account.');
  }
  const target = await findStaffAccount(body.userId);
  if (!target) throw new ApiError(404, 'staff_not_found', 'That staff account could not be found.');

  await auditedMutation<{ id: string }>({
    req,
    actor: await auditActorForUser(session.userId),
    action: 'auth.forced_sign_out',
    entity: { type: 'staff_account', id: target.id, label: target.email },
    mutationSql: `WITH revoked AS (
                    UPDATE sessions SET revoked_at = now()
                     WHERE user_id = $1 AND revoked_at IS NULL
                     RETURNING id
                  )
                  SELECT id FROM users WHERE id = $1`,
    mutationParams: [target.id],
  });
  sendJson(res, 200, { ok: true });
});
