import { clientIp, endpoint, sendJson } from '../../http.js';
import { clearSessionCookie, readSession } from '../../session.js';
import { bumpTokenVersion } from '../../db.js';
import { recordAuthEvent } from '../../audit.js';

export default endpoint({ methods: ['POST'], csrf: true }, async (req, res) => {
  // Best effort: identify the user for the audit row, but logging out must
  // succeed even with an expired or missing session.
  const claims = await readSession(req);
  // Clearing the cookie only tells this browser to forget the token; the token
  // itself would still verify. Bumping the version retires every session minted
  // for the account, so a copy of the cookie taken before signing out stops
  // working too. readSession has already proved the token is valid, so a failed
  // write here is a database problem, not a reason to block the sign-out.
  if (claims) {
    try {
      await bumpTokenVersion(claims.userId);
    } catch (error) {
      console.error('[auth] could not revoke the session on logout', error);
    }
  }
  clearSessionCookie(req, res);
  await recordAuthEvent('logout', { userId: claims?.userId ?? null, ip: clientIp(req) });
  sendJson(res, 200, { ok: true, redirect: '/' });
});
