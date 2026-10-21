import { BrowserRouter } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import SiteShell from './SiteShell';

/**
 * The browser entry point. The routes and layout live in SiteShell, because the
 * build renders the same tree through StaticRouter; this file adds only the
 * pieces that belong to a live browser session.
 */
export default function App() {
  return (
    <BrowserRouter>
      <SiteShell />
      <Analytics />
    </BrowserRouter>
  );
}
