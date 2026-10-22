import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const container = document.getElementById('root')!;

/*
 * Pages rendered at request time - /blog, /events and any post published after
 * the build - arrive with a readable copy of their content in front of #root
 * (see api/_lib/shell.ts). That copy exists for crawlers, not for the app: the
 * app renders the same page from its own data. Removing it before mounting means
 * it never appears twice in the live DOM and the container is exactly what
 * createRoot expects.
 */
document.getElementById('fallback-content')?.remove();

/*
 * Hydrate when the build already wrote this page, render when it did not.
 *
 * Public pages arrive with their real markup (see scripts/prerender.mjs), so
 * hydrating keeps it instead of throwing it away and painting it again. The
 * client-only routes - accounts, legal pages - are served an empty shell and
 * take the createRoot path they always took.
 */
if (container.firstElementChild) {
  hydrateRoot(
    container,
    <StrictMode>
      <App />
    </StrictMode>,
  );
} else {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
