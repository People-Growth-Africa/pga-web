import { clientIp, endpoint, sendJson } from '../../http.js';
import { clearAllSessionCookies, readAnySession } from '../../session.js';
import { bumpTokenVersion, findSessionUserById, isAdminPortalRole, isContentManagerRole } from '../../db.js';
import { auditedMutation, recordAuthEvent } from '../../audit.js';

export default endpoint({ methods: ['POST'], csrf: true }, async (req, res) => {
  // Best effort: identify the user for the audit row, but logging out must
  // succeed even with an expired or missing session.
  const found = await readAnySession(req);
  const claims = found?.session ?? null;
  const user = claims ? await findSessionUserById(claims.userId) : null;
  // Clearing the cookies only tells this browser to forget the tokens; the
  // tokens themselves would still verify. Bumping the version retires every
  // session minted for the account, so a copy of any cookie taken before
  // signing out stops working too. A failed write here is a database problem,
  // not a reason to block the sign-out.
  if (claims && user && (isAdminPortalRole(user.role) || isContentManagerRole(user.role))) {
    await auditedMutation({
      req,
      actor: { id: user.id, email: user.email, role: user.role },
      action: 'auth.logout',
      entity: { type: 'staff_account', id: user.id, label: user.email },
      mutationSql: 'UPDATE users SET token_version = token_version + 1 WHERE id = $1 RETURNING id',
      mutationParams: [user.id],
    });
  } else if (claims) {
    try {
      await bumpTokenVersion(claims.userId);
    } catch (error) {
      console.error('[auth] could not revoke the session on logout', error);
    }
  }
  clearAllSessionCookies(req, res);
  await recordAuthEvent('logout', { userId: claims?.userId ?? null, ip: clientIp(req) });
  sendJson(res, 200, { ok: true, redirect: '/' });
});
