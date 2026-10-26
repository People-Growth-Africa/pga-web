import { requireContentManager } from '../content-auth.js';
import { makePostsHandler } from './admin-posts.js';

/** Content desk only: /api/content/posts, /api/content/post, /api/content/post-status. */
export default makePostsHandler(requireContentManager);
