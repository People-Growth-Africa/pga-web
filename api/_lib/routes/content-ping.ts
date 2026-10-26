import { endpoint, sendJson } from '../http.js';
import { requireContentManager } from '../content-auth.js';

/** GET /api/content/ping — keeps the content-manager session sliding. */
export default endpoint({ methods: ['GET'] }, async (req, res) => {
  await requireContentManager(req, res);
  sendJson(res, 200, { ok: true });
});
