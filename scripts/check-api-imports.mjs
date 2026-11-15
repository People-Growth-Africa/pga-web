/**
 * Guards the one thing that took every /api/auth/* route down in production:
 * the endpoints are deployed as native ES modules, so every relative import
 * inside api/ has to carry a file extension.
 *
 *   node scripts/check-api-imports.mjs      # exits 1 on the first problem
 *
 * Vercel compiles each file in api/ to a .js file beside its neighbours and
 * lets Node resolve the specifiers at runtime. A bare `./http` therefore type
 * checks, builds, and passes locally, then fails live with:
 *
 *   ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/api/_lib/http'
 *
 * This script closes that gap twice over:
 *   1. it reads every file in api/ and reports relative specifiers that are not
 *      explicitly `*.js` (directory imports included);
 *   2. it strips the types out of api/ into a temporary directory the way the
 *      deployment does - one .js per .ts, same layout - and then imports every
 *      module in api/ with plain Node ESM, no hooks and no transpiler in the
 *      way, so a bad specifier surfaces as the same ERR_MODULE_NOT_FOUND. The
 *      endpoints, which are the files the platform exposes, also have to hand
 *      back a callable default export; shared code under api/_lib need not.
 *
 * Nothing here connects anywhere, so the placeholder values it fills in are
 * only there to get past the import-time configuration checks.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const apiDir = path.join(root, 'api');
const buildDir = path.join(root, 'node_modules', '.tmp', 'api-imports');

/** Relative import specifiers, with any comments removed first. */
const SPECIFIER = /(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]/g;

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      const cut = line.indexOf('//');
      // `https://` and friends are not the start of a comment.
      return cut > 0 && line[cut - 1] !== ':' ? line.slice(0, cut) : line;
    })
    .join('\n');
}

/** Every .ts file under api/, as project relative paths. */
function apiFiles() {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.name.endsWith('.ts')) {
        files.push(path.relative(root, fullPath).split(path.sep).join('/'));
      }
    }
  };
  if (existsSync(apiDir)) walk(apiDir);
  return files.sort();
}

/** A route is a file the platform would expose, so nothing under an `_` path. */
function isRoute(relative) {
  return relative.split('/').every((segment) => !segment.startsWith('_'));
}

/** Relative specifiers that are not explicitly `*.js`. */
function badSpecifiers(relative) {
  const source = stripComments(readFileSync(path.join(root, relative), 'utf8'));
  const found = [];
  for (const match of source.matchAll(SPECIFIER)) {
    const specifier = match[1];
    if (/^\.\.?\/[^'"]*\.js$/.test(specifier)) continue;
    const line = source.slice(0, match.index).split('\n').length;
    const hint = specifier.endsWith('/')
      ? 'directory import, needs /index.js'
      : 'missing the .js extension';
    found.push({ file: relative, line, specifier, hint });
  }
  return found;
}

/** Writes the api/ tree and its shared source dependency as production .js files. */
function writeCompiled(files) {
  rmSync(buildDir, { recursive: true, force: true });
  for (const relative of [...files, 'src/lib/event-registration.ts']) {
    const target = path.join(buildDir, relative.replace(/\.ts$/, '.js'));
    const source = readFileSync(path.join(root, relative), 'utf8');
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, stripTypeScriptTypes(source, { mode: 'strip' }));
  }
}

/**
 * Imports every route module the way the deployed runtime does. Returns
 * `{ ok, files, routes, missing, summary }` and never throws for a failure it
 * can report.
 */
export async function checkApiImports({ quiet = false, keepBuild = false } = {}) {
  const files = apiFiles();
  const missing = files.flatMap(badSpecifiers);
  const canStrip = typeof stripTypeScriptTypes === 'function';
  const routes = [];

  if (!canStrip) {
    if (!quiet) {
      console.warn(
        'Node here has no module.stripTypeScriptTypes, so only the specifier scan ran. Node 22.13 or newer runs both.',
      );
    }
  } else {
    // Placeholders only: importing a route must not need credentials, because
    // this check has to be runnable anywhere.
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/api-import-check';
    }
    if ((process.env.JWT_SECRET ?? '').length < 32) {
      process.env.JWT_SECRET = 'api-import-check-placeholder-secret-0123456789';
    }

    writeCompiled(files);

    for (const relative of files) {
      const compiled = pathToFileURL(path.join(buildDir, relative.replace(/\.ts$/, '.js'))).href;
      try {
        const module = await import(compiled);
        if (isRoute(relative) && typeof module.default !== 'function') {
          throw new Error('the route has no default export to call');
        }
        routes.push({ route: relative, ok: true });
      } catch (error) {
        routes.push({
          route: relative,
          ok: false,
          error: `${error.code ?? error.name}: ${error.message}`,
        });
      }
    }

    if (keepBuild) {
      if (!quiet) {
        console.log(
          `\nCompiled api/ left in ${path.relative(root, buildDir).split(path.sep).join('/')}, so any module can be imported directly:\n  node --input-type=module -e "import('./${path.relative(root, buildDir).split(path.sep).join('/')}/api/[...path].js')"\n`,
        );
      }
    } else {
      rmSync(buildDir, { recursive: true, force: true });
    }
  }

  const failedRoutes = routes.filter((entry) => !entry.ok);
  const endpoints = routes.filter((entry) => isRoute(entry.route)).length;
  const ok = missing.length === 0 && failedRoutes.length === 0;
  const summary = ok
    ? `${routes.length} modules (${endpoints} endpoints) import as native ESM, every relative specifier is explicit`
    : `api/ import check failed: ${missing.length} specifier(s) without .js, ${failedRoutes.length} module(s) that do not import`;

  if (!quiet) {
    console.log(
      `api/ import check: ${files.length} files, ${routes.length} modules, ${endpoints} exposed\n`,
    );
    for (const entry of missing) {
      console.log(
        `FAIL  ${entry.file}:${entry.line}  '${entry.specifier}' (${entry.hint})`,
      );
    }
    for (const entry of routes.filter((route) => !route.ok)) {
      console.log(`FAIL  ${entry.route.replace(/\.ts$/, '.js')}  ${entry.error}`);
    }
    if (ok) {
      for (const entry of routes) console.log(`PASS  ${entry.route.replace(/\.ts$/, '.js')}`);
    }
    console.log(`\n${ok ? 'OK' : 'FAILED'} - ${summary}`);
  }

  return { ok, files, routes, missing, summary };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  // --keep leaves the compiled .js tree behind so the import that failed can be
  // run by hand exactly as the runtime sees it.
  const result = await checkApiImports({ keepBuild: process.argv.includes('--keep') });
  process.exit(result.ok ? 0 : 1);
}
