import {
  ApiError,
  clientIp,
  endpoint,
  parseJsonBody,
  safeRedirect,
  sendJson,
} from '../../http.js';
import { parseInput, signupSchema } from '../../validation.js';
import {
  createEmployerUser,
  createTalentUser,
  isUniqueViolation,
  type Role,
} from '../../db.js';
import { hashPassword, isPasswordBreached } from '../../security.js';
import {
  assertSessionConfigured,
  createSessionToken,
  sessionTtlSeconds,
  setSessionCookie,
} from '../../session.js';
import { enforceRateLimit } from '../../ratelimit.js';
import { recordAuthEvent } from '../../audit.js';
import { issueToken } from '../../auth-tokens.js';
import { sendVerificationEmail } from '../../email.js';

export default endpoint({ methods: ['POST'], csrf: true }, async (req, res) => {
  const ip = clientIp(req);
  const data = parseInput(signupSchema, parseJsonBody(req));
  assertSessionConfigured();

  await enforceRateLimit({ name: 'signup-ip', identifier: ip, limit: 10, windowSeconds: 3600 });
  await enforceRateLimit({
    name: 'signup-email',
    identifier: data.email,
    limit: 5,
    windowSeconds: 3600,
  });

  // Checked before hashing, because hashing is the expensive part and a
  // breached password is refused either way. Fails open if HIBP is unreachable.
  if (await isPasswordBreached(data.password)) {
    await recordAuthEvent('signup_breached_password', { ip });
    throw new ApiError(
      400,
      'password_breached',
      'That password has appeared in a known data breach. Choose one you have not used anywhere else.',
      { password: 'This password has appeared in a known data breach.' },
    );
  }

  const passwordHash = await hashPassword(data.password);

  let created: { id: string; role: Role } | null;
  try {
    created =
      data.role === 'talent'
        ? await createTalentUser({
            email: data.email,
            passwordHash,
            name: data.name,
            field: data.field,
            country: data.country ?? null,
            availability: data.availability ?? null,
          })
        : await createEmployerUser({
            email: data.email,
            passwordHash,
            name: data.name,
            company: data.company,
            needs: data.needs,
          });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(409, 'email_taken', 'That email already has an account. Log in instead.');
    }
    throw error;
  }

  if (!created) {
    throw new ApiError(500, 'signup_failed', 'We could not create your account. Try again in a moment.');
  }

  // A failed email must not fail the signup, so this is awaited but never
  // allowed to throw (see api/_lib/email.ts).
  const verifyToken = await issueToken(created.id, 'verify');
  await sendVerificationEmail(data.email, verifyToken);

  const sessionToken = await createSessionToken({
    userId: created.id,
    role: created.role,
    tokenVersion: 0,
  });
  setSessionCookie(req, res, sessionToken, sessionTtlSeconds(created.role));
  await recordAuthEvent('signup', { userId: created.id, ip });

  // The profile travels with the response so the dashboard renders real values
  // straight after signup instead of waiting for a second request.
  const profile =
    data.role === 'talent'
      ? {
          name: data.name,
          field: data.field,
          country: data.country ?? null,
          availability: data.availability ?? null,
        }
      : { name: data.name, company: data.company, needs: data.needs };

  sendJson(res, 201, {
    user: {
      id: created.id,
      role: created.role,
      email: data.email,
      name: data.name,
      emailVerified: false,
      profile,
    },
    redirect: safeRedirect(created.role === 'talent' ? '/talent/dashboard' : '/employer/dashboard'),
  });
});
