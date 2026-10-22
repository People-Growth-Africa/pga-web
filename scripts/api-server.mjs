/**
 * Runs the Vercel serverless functions in api/ on a local port, and serves the
 * built site from dist/ with the same SPA fallback vercel.json uses.
 *
 *   node scripts/api-server.mjs --port 4173      # start the server
 *
 * Why this exists: the real deployment turns api/ into serverless endpoints -
 * one of them now, api/[...path].ts, which looks its handler up in the table at
 * api/_lib/routes/index.ts - and the Vercel CLI is the usual way to reproduce
 * that locally. This script does the small part of that job the auth tests and
 * a browser check need, so `npm run test:auth` works without any extra tooling.
 * It is development only: nothing here is deployed.
 *
 * Node strips the TypeScript types on import, which is why api/ is written to
 * stay inside what type stripping supports (see tsconfig.api.json).
 */
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { register, registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Teaches this process to resolve the `./http.js` specifiers api/ is written
// with back to the ./http.ts sources, mirroring the compiled .js files that sit
// beside each other in the deployed function. Node strips the types on import,
// so the endpoint modules run as written while the specifiers stay exactly as
// they are on disk. Extensionless imports are deliberately left to fail.
if (typeof registerHooks === 'function') {
  const resolveWithTs = (specifier, context, nextResolve) => {
    if (specifier.startsWith('.') && specifier.endsWith('.js')) {
      try {
        return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
      } catch {
        // Fall through to the normal resolution.
      }
    }
    return nextResolve(specifier, context);
  };
  registerHooks({ resolve: resolveWithTs });
} else {
  register('./ts-resolve-hook.mjs', import.meta.url);
}

const root = path.resolve(import.meta.dirname, '..');
const ENV_FILES = ['.env.development.local', '.env.local', '.env'];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
};

/** Loads .env files the way Vite does, without overwriting anything already set. */
export function loadEnvFiles({ quiet = false } = {}) {
  const loaded = [];
  for (const file of ENV_FILES) {
    const fullPath = path.join(root, file);
    if (!existsSync(fullPath)) continue;
    for (const rawLine of readFileSync(fullPath, 'utf8').split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separator = line.indexOf('=');
      if (separator === -1) continue;
      const key = line.slice(0, separator).replace(/^export\s+/, '').trim();
      let value = line.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
    loaded.push(file);
    if (!quiet) console.log(`Loaded ${file}`);
  }
  return loaded;
}

/**
 * Every module in api/ the platform would expose, keyed by the URL Vercel
 * serves it at. A `[...name].ts` file answers for any path under its directory,
 * which is how the whole API is reached through one function; anything else is
 * an exact path. Files behind an `_` are shared code and are not endpoints.
 */
function discoverFunctions() {
  const routes = new Map();
  const catchAlls = [];
  const apiDir = path.join(root, 'api');

  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      const relative = path.relative(root, fullPath).split(path.sep).join('/');
      // Anything behind an `_` path segment is shared code. Vercel does not
      // expose api/_lib, so this must not either: serving it here would put
      // endpoints in front of the tests that production does not have.
      if (relative.split('/').some((segment) => segment.startsWith('_'))) continue;
      if (/^\[\.\.\.[A-Za-z0-9_-]+\]\.ts$/.test(entry.name)) {
        const directory = path.posix.dirname(relative);
        catchAlls.push({ prefix: directory === '.' ? '' : `/${directory}`, file: fullPath });
        continue;
      }
      routes.set(`/${relative.replace(/\.ts$/, '')}`, fullPath);
    }
  };

  if (existsSync(apiDir)) walk(apiDir);
  return { routes, catchAlls };
}

function shimResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
    return res;
  };
  res.send = (body) => {
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    return res;
  };
  res.redirect = (status, location) => {
    res.statusCode = status;
    res.setHeader('Location', location);
    res.end();
    return res;
  };
  return res;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      // Same ceiling as the largest body an endpoint accepts (an admin post or
      // a base64 cover upload), so an oversized body cannot sit in memory here
      // before the handler refuses it. Endpoints with a tighter limit still
      // enforce their own.
      if (size > 8 * 1024 * 1024) {
        req.destroy();
        reject(new Error('body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendStaticFile(req, res, pathname, distDir) {
  if (!existsSync(distDir)) {
    res.statusCode = 200;
    res.end(
      'Nothing in dist/ yet. Run `npm run build` first, or use the Vite dev server for the UI.\n',
    );
    return;
  }

  const candidates = [pathname];
  if (pathname.endsWith('/')) candidates.push(`${pathname}index.html`);
  // SPA fallback, mirroring the rewrite in vercel.json: a path with no file
  // extension is a client side route.
  if (!path.extname(pathname)) candidates.push('/index.html');

  for (const candidate of candidates) {
    const filePath = path.join(distDir, candidate);
    if (!filePath.startsWith(distDir)) continue;
    if (!existsSync(filePath) || !statSync(filePath).isFile()) continue;
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(readFileSync(filePath));
    return;
  }

  res.statusCode = 404;
  res.end('Not found\n');
}

/**
 * Starts the API (and, when dist/ exists, the site) on a local port.
 * Returns the origin to call plus a close function.
 */
export async function startApiServer({ port = 0, serveStatic = true, quiet = false } = {}) {
  // The endpoints refuse to run without a proper secret, which is the right
  // behaviour in production. Locally that would make every request fail, so a
  // throwaway secret is generated instead and the difference is called out.
  if (!process.env.JWT_SECRET && process.env.VERCEL_ENV !== 'production') {
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    if (!quiet) {
      console.warn(
        'JWT_SECRET was not set, so this run uses a temporary one. Sessions end when it stops. Run `npm run setup:auth` for a real value.',
      );
    }
  }

  const { routes, catchAlls } = discoverFunctions();
  const distDir = path.join(root, 'dist');
  const cache = new Map();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);

    const file =
      routes.get(pathname) ??
      catchAlls.find(({ prefix }) => pathname.startsWith(`${prefix}/`))?.file;
    if (file) {
      shimResponse(res);
      req.query = Object.fromEntries(url.searchParams);
      try {
        let handler = cache.get(file);
        if (!handler) {
          const module = await import(pathToFileURL(file).href);
          handler = module.default;
          if (typeof handler !== 'function') {
            throw new Error(`${path.relative(root, file)} has no default export to call`);
          }
          cache.set(file, handler);
        }
        req.body = await readBody(req);
        await handler(req, res);
      } catch (error) {
        console.error('[api-server] handler crashed', pathname, error);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Local server error.', code: 'local_server_error' }));
        } else {
          res.end();
        }
      }
      return;
    }

    if (!serveStatic) {
      res.statusCode = 404;
      res.end('Not found\n');
      return;
    }
    sendStaticFile(req, res, pathname, distDir);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve());
  });

  const address = server.address();
  const origin = `http://localhost:${typeof address === 'object' && address ? address.port : port}`;
  if (!quiet) {
    const functions = routes.size + catchAlls.length;
    console.log(`Auth API ready on ${origin}`);
    console.log(
      `${functions} function${functions === 1 ? '' : 's'} from api/, ${existsSync(distDir) ? 'serving dist/' : 'no dist/ build found'}`,
    );
  }

  return {
    origin,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

// `node scripts/api-server.mjs --port 4173`
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  loadEnvFiles();
  const portArg = process.argv.indexOf('--port');
  const port = portArg === -1 ? 4173 : Number(process.argv[portArg + 1]) || 4173;
  await startApiServer({ port });
}
