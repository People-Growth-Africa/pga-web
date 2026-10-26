import { clientIp, endpoint, sendJson } from '../../http.js';
import { bumpTokenVersion } from '../../db.js';
import { requireAnySession } from '../../current-user.js';
import { clearAllSessionCookies } from '../../session.js';
import { recordAuthEvent } from '../../audit.js';

/**
 * Ends every session for the account, on every device, by raising the user's
 * token_version. All three portal cookies are cleared here too, so this browser
 * signs out along with the rest.
 */
export default endpoint({ methods: ['POST'], csrf: true }, async (req, res) => {
  const { user, portal } = await requireAnySession(req, res);

  await bumpTokenVersion(user.id);
  clearAllSessionCookies(req, res);
  await recordAuthEvent('logout_all', { userId: user.id, ip: clientIp(req) });

  sendJson(res, 200, {
    ok: true,
    redirect: portal === 'content' ? '/content/login' : portal === 'admin' ? '/admin/login' : '/auth#login',
  });
});
