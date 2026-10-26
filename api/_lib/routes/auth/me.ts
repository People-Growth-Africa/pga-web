import { endpoint, sendJson } from '../../http.js';
import { requireAnySession } from '../../current-user.js';
import { getEmployerProfile, getTalentProfile } from '../../db.js';

export default endpoint({ methods: ['GET'] }, async (req, res) => {
  const { user } = await requireAnySession(req, res);

  const profile =
    user.role === 'talent'
      ? await getTalentProfile(user.id)
      : user.role === 'employer'
        ? await getEmployerProfile(user.id)
        : null;

  sendJson(res, 200, {
    user: {
      id: user.id,
      // Null for accounts made before a name was collected; the panel greets
      // only the ones that have one.
      name: user.name ?? null,
      email: user.email,
      role: user.role,
      emailVerified: user.email_verified,
      mustChangePassword: user.must_change_password,
      profile,
    },
  });
});
