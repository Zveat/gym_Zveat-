/** Shared bits for the end-to-end suites: a static server and a tiny reporter. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { deflateRawSync } from 'node:zlib';
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

/** The two sizes the spec names as the test targets. */
export const VIEWPORTS = {
  pro: { width: 393, height: 852 },
  proMax: { width: 430, height: 932 },
};

/** An iPhone-sized page with console errors collected. */
export async function openApp(base, viewport = VIEWPORTS.pro) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport,
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

/**
 * Every piece of text on screen must be readable against what is actually
 * behind it. This exists because a single unlayered `button { color: inherit }`
 * in globals.css outranked every Tailwind text-colour utility (unlayered CSS
 * beats every cascade layer regardless of specificity), so the lime primary
 * button rendered near-white text and selected/unselected chips were the same
 * colour app-wide. Computed styles are the only way to catch that class of bug.
 *
 * Colours are resolved by painting them on a canvas, because Tailwind emits
 * `oklab()` for opacity modifiers and parsing that by hand gets it wrong.
 * Returns null when everything passes, or a description of the worst offenders.
 */
export async function assertReadableText(page, { min = 4.5, minLarge = 3 } = {}) {
  const offenders = await page.evaluate(
    ({ min, minLarge }) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      /** Paint the layers bottom-up and read back the composited sRGB pixel. */
      const paint = (layers) => {
        ctx.clearRect(0, 0, 1, 1);
        for (const colour of layers) {
          ctx.fillStyle = colour;
          ctx.fillRect(0, 0, 1, 1);
        }
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return { r, g, b };
      };
      const luminance = ({ r, g, b }) => {
        const channel = (v) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const contrast = (a, b) => {
        const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (light + 0.05) / (dark + 0.05);
      };
      /** The page background plus every painted ancestor background, in order. */
      const backdrop = (el) => {
        const chain = [];
        for (let cur = el; cur; cur = cur.parentElement) chain.push(cur);
        const layers = ['#0b0b0d'];
        for (const node of chain.reverse()) {
          const colour = getComputedStyle(node).backgroundColor;
          if (colour && colour !== 'transparent' && colour !== 'rgba(0, 0, 0, 0)') {
            layers.push(colour);
          }
        }
        return layers;
      };

      const found = [];
      const seen = new Set();
      for (const el of document.querySelectorAll('*')) {
        const own = [...el.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
          .map((node) => node.textContent.trim())
          .join(' ');
        if (!own) continue;
        const box = el.getBoundingClientRect();
        if (box.width < 4 || box.height < 4) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue;

        const layers = backdrop(el);
        const behind = paint(layers);
        const text = paint([...layers, style.color]);
        const ratio = contrast(text, behind);
        const size = parseFloat(style.fontSize);
        const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
        const need = large ? minLarge : min;
        if (ratio >= need) continue;

        const key = `${own.slice(0, 30)}|${style.color}|${style.fontSize}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(
          `"${own.slice(0, 26)}" ${style.fontSize} ${style.color} on rgb(${behind.r},${behind.g},${behind.b}) = ${ratio.toFixed(2)}:1 (needs ${need})`,
        );
      }
      return found;
    },
    { min, minLarge },
  );
  if (!offenders.length) return null;
  return `${offenders.length} unreadable: ${offenders.slice(0, 4).join(' | ')}`;
}

/* ── .xlsx fixture builder ─────────────────────────────────────────── */

function crc32(buffer) {
  if (!crc32.table) {
    crc32.table = [];
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crc32.table[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crc32.table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const payload = deflateRawSync(entry.data);
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + payload.length;
  }

  const central = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, central, eocd]);
}

const escapeXml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Builds a genuine .xlsx from a grid of strings — ZIP container, deflate
 * compression, shared strings, the lot. Cells that look numeric are written as
 * numbers so the app has to handle both kinds, including Excel date serials.
 */
export function buildXlsx(rows) {
  const strings = [];
  const indexOf = (value) => {
    const existing = strings.indexOf(value);
    if (existing >= 0) return existing;
    strings.push(value);
    return strings.length - 1;
  };

  const sheetRows = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const ref = `${String.fromCharCode(65 + c)}${r + 1}`;
          if (value === '' || value === null || value === undefined) return '';
          if (/^-?\d+([.]\d+)?$/.test(String(value))) {
            return `<c r="${ref}"><v>${value}</v></c>`;
          }
          return `<c r="${ref}" t="s"><v>${indexOf(String(value))}</v></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');

  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet><sheetData>${sheetRows}</sheetData></worksheet>`;
  const shared = `<?xml version="1.0" encoding="UTF-8"?><sst count="${strings.length}" uniqueCount="${strings.length}">${strings
    .map((value) => `<si><t>${escapeXml(value)}</t></si>`)
    .join('')}</sst>`;

  return zip([
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet, 'utf8') },
    { name: 'xl/sharedStrings.xml', data: Buffer.from(shared, 'utf8') },
  ]);
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
