import { endpoint } from '../../http.js';
import { handleStaffLogin } from '../../staff-login.js';

/** POST /api/content/login - content manager portal only. */
export default endpoint({ methods: ['POST'], csrf: true }, async (req, res) => {
  await handleStaffLogin(req, res, 'content');
});
