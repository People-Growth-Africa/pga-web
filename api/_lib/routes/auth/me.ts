import { endpoint, sendJson } from '../../http.js';
import { requireSession } from '../../current-user.js';
import { getEmployerProfile, getTalentProfile } from '../../db.js';

export default endpoint({ methods: ['GET'] }, async (req, res) => {
  const user = await requireSession(req, res);

  const profile =
    user.role === 'talent' ? await getTalentProfile(user.id) : await getEmployerProfile(user.id);

  sendJson(res, 200, {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.email_verified,
      mustChangePassword: user.must_change_password,
      profile,
    },
  });
});
