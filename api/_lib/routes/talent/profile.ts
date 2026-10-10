import { ApiError, clientIp, endpoint, parseJsonBody, sendJson } from '../../http.js';
import { parseInput, talentProfileSchema } from '../../validation.js';
import { requireSession } from '../../current-user.js';
import { updateTalentProfile } from '../../db.js';
import { enforceRateLimit } from '../../ratelimit.js';
import { recordAuthEvent } from '../../audit.js';

/**
 * Saves the two talent profile fields the dashboard owns: availability and
 * country.
 *
 * The account is taken from the session and never from the body, so this can
 * only ever write the caller's own profile, and the schema is strict so no other
 * column can be reached through it. Nothing else in the profile is writable
 * here: name and field are identity, not preferences, and they are set at
 * signup.
 */
export default endpoint({ methods: ['POST'], csrf: true }, async (req, res) => {
  const ip = clientIp(req);
  const user = await requireSession(req, res);

  if (user.role !== 'talent') {
    throw new ApiError(403, 'wrong_role', 'This endpoint is for talent accounts.');
  }

  const data = parseInput(talentProfileSchema, parseJsonBody(req));

  await enforceRateLimit({
    name: 'talent-profile-user',
    identifier: user.id,
    limit: 30,
    windowSeconds: 3600,
  });

  const profile = await updateTalentProfile({
    userId: user.id,
    ...(data.availability !== undefined ? { availability: data.availability } : {}),
    ...(data.country !== undefined ? { country: data.country } : {}),
  });

  // A signed in talent always has a profile row (signup writes both in one
  // statement), so this only fires if the row was removed underneath them.
  if (!profile) {
    throw new ApiError(
      409,
      'profile_missing',
      'We could not find your talent profile. Write to us and we will rebuild it.',
    );
  }

  await recordAuthEvent('talent_profile_updated', { userId: user.id, ip });

  sendJson(res, 200, { ok: true, profile });
});
