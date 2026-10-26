import { requireContentManager } from '../content-auth.js';
import { makeCategoriesHandler } from './admin-categories.js';

/** Content desk only: /api/content/categories and /api/content/category. */
export default makeCategoriesHandler(requireContentManager);
