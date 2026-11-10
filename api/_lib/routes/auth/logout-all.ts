import { clientIp, endpoint, sendJson } from '../../http.js';
import { bumpTokenVersion, isAdminPortalRole, isContentManagerRole, revokeUserServerSessions } from '../../db.js';
import { requireAnySession } from '../../current-user.js';
import { clearAllSessionCookies } from '../../session.js';
import { auditedMutation, recordAuthEvent } from '../../audit.js';

/**
 * Ends every session for the account, on every device, by raising the user's
 * token_version. All three portal cookies are cleared here too, so this browser
 * signs out along with the rest.
 */
export default endpoint({ methods: ['POST'], csrf: true }, async (req, res) => {
  const { user, portal } = await requireAnySession(req, res);

  if (isAdminPortalRole(user.role) || isContentManagerRole(user.role)) {
    await auditedMutation({
      req,
      actor: { id: user.id, email: user.email, role: user.role },
      action: 'auth.logout',
      entity: { type: 'staff_account', id: user.id, label: user.email },
      mutationSql: `WITH revoked_sessions AS (
                       UPDATE sessions SET revoked_at = now()
                        WHERE user_id = $1 AND revoked_at IS NULL
                     )
                     UPDATE users SET token_version = token_version + 1 WHERE id = $1 RETURNING id`,
      mutationParams: [user.id],
    });
  } else {
    await bumpTokenVersion(user.id);
    await revokeUserServerSessions(user.id);
  }
  clearAllSessionCookies(req, res);
  await recordAuthEvent('logout_all', { userId: user.id, ip: clientIp(req) });

  sendJson(res, 200, {
    ok: true,
    redirect: portal === 'content' ? '/content/login' : portal === 'admin' ? '/admin/login' : '/auth#login',
  });
});
