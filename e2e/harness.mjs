/** Shared bits for the end-to-end suites: a static server and a tiny reporter. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const ROOT = new URL('../out/', import.meta.url).pathname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Resolves extensionless routes to the .html Next's static export produced. */
async function resolveFile(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  for (const candidate of [
    join(ROOT, clean),
    join(ROOT, `${clean}.html`),
    join(ROOT, clean, 'index.html'),
  ]) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

export function startServer(port) {
  const server = createServer(async (req, res) => {
    const file = await resolveFile(new URL(req.url, `http://localhost:${port}`).pathname);
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

/** An iPhone-sized page with console errors collected. */
export async function openApp(base) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'ru-RU',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  return { browser, context, page, consoleErrors };
}

/**
 * The page body must never scroll sideways on a phone. Beyond looking broken,
 * horizontal overflow makes Chromium shrink-to-fit the mobile viewport, which
 * silently changes every tap coordinate. Intentional scrollers (chip rows) are
 * fine — they clip inside `overflow-x: auto`, so the document stays the width
 * of the screen.
 */
export async function assertNoHorizontalOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;
    const offenders = [];
    for (const el of document.querySelectorAll('*')) {
      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.right > doc.clientWidth + 1) {
        const cls = typeof el.className === 'string' ? el.className : '';
        offenders.push(`${el.tagName}[${cls.slice(0, 40)}] → ${Math.round(box.right)}px`);
      }
    }
    return `${doc.scrollWidth}px wide on a ${doc.clientWidth}px screen: ${offenders.slice(0, 3).join(', ')}`;
  });
}

export function reporter() {
  let passed = 0;
  const failures = [];
  return {
    check(label, condition, detail = '') {
      if (condition) {
        passed += 1;
        console.log(`  ✓ ${label}`);
      } else {
        failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
        console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
      }
    },
    finish() {
      console.log(`\n${passed} passed, ${failures.length} failed`);
      if (failures.length) {
        console.log('\nFailures:');
        failures.forEach((f) => console.log(`  - ${f}`));
        process.exit(1);
      }
    },
  };
}

/**
 * `innerText` reflects CSS `text-transform`, so labels styled uppercase come
 * back uppercase. Both helpers normalise for that.
 */
export function textHelpers(page) {
  return {
    text: async () => (await page.locator('body').innerText()).toUpperCase(),
    has: (body, ...needles) => needles.every((n) => body.includes(n.toUpperCase())),
  };
}
