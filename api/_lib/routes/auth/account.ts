import { ApiError, clientIp, endpoint, parseJsonBody, safeRedirect, sendJson } from '../../http.js';
import { deleteAccountSchema, parseInput } from '../../validation.js';
import { deleteUser, findUserByEmail } from '../../db.js';
import { verifyPassword } from '../../security.js';
import { clearAllSessionCookies } from '../../session.js';
import { requireSession } from '../../current-user.js';
import { enforceRateLimit } from '../../ratelimit.js';
import { recordAuthEvent } from '../../audit.js';

export default endpoint({ methods: ['DELETE'], csrf: true }, async (req, res) => {
  const ip = clientIp(req);
  const user = await requireSession(req, res);
  const data = parseInput(deleteAccountSchema, parseJsonBody(req));

  await enforceRateLimit({
    name: 'delete-account',
    identifier: user.id,
    limit: 5,
    windowSeconds: 3600,
  });

  // Re-authenticate before a destructive, irreversible action.
  const stored = await findUserByEmail(user.email);
  const passwordMatches = stored ? await verifyPassword(data.password, stored.password_hash) : false;
  if (!passwordMatches) {
    await recordAuthEvent('account_delete_failed', { userId: user.id, ip });
    throw new ApiError(401, 'invalid_credentials', 'That password is not correct.');
  }

  // Profiles, tokens and audit rows referencing this user cascade or are detached.
  await deleteUser(user.id);
  clearAllSessionCookies(req, res);
  await recordAuthEvent('account_deleted', { userId: null, ip });

  sendJson(res, 200, { ok: true, redirect: safeRedirect('/') });
});
