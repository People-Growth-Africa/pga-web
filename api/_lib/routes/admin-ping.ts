import { endpoint, sendJson } from '../http.js';
import { requireManager } from '../manager.js';

/**
 * GET /api/admin/ping - "still here".
 *
 * The panel calls it whenever a manager actually does something (a keypress, a
 * tap, the tab regaining focus), because writing an article for an hour makes no
 * other request. Without it the idle limit would measure "no requests" rather
 * than "not at the keyboard", and it would sign a manager out mid-sentence.
 *
 * It reads and changes nothing of its own: the sliding happens inside
 * `requireManager`, which reissues the session cookie when it is stale.
 */
export default endpoint({ methods: ['GET'] }, async (req, res) => {
  await requireManager(req, res);
  sendJson(res, 200, { ok: true });
});
