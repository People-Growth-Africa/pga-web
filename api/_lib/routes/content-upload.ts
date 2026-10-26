import { requireContentManager } from '../content-auth.js';
import { makeUploadHandler } from './admin-upload.js';

/** Content desk only: POST /api/content/upload. */
export default makeUploadHandler(requireContentManager);
