import { endpoint } from '../../http.js';
import { handleStaffLogin } from '../../staff-login.js';

/** POST /api/admin/login - administrator portal only (admin, project, HR). */
export default endpoint({ methods: ['POST'], csrf: true }, async (req, res) => {
  await handleStaffLogin(req, res, 'admin');
});
