/**
 * Minimal .xlsx reader — spec: "Excel Import: если технически несложно."
 *
 * An .xlsx file is a ZIP of XML. Browsers ship both halves natively
 * (`DecompressionStream` for deflate, string parsing for the XML we need), so
 * reading one costs no dependency at all. A spreadsheet library would add
 * ~1 MB to a PWA that has to load over gym Wi-Fi, for a feature used once.
 *
 * Scope on purpose: the first worksheet, as a grid of strings. That is exactly
 * what the CSV importer already consumes.
 */

export class XlsxError extends Error {}

/* ── ZIP ───────────────────────────────────────────────────────────── */

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
}

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

function readEntries(view: DataView): Map<string, ZipEntry> {
  // The end-of-central-directory record sits at the tail, after an optional
  // comment, so it is found by scanning backwards for its signature.
  let eocd = -1;
  const lowest = Math.max(0, view.byteLength - 66_000);
  for (let i = view.byteLength - 22; i >= lowest; i -= 1) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new XlsxError('Файл не похож на .xlsx (не найден архив).');

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder();

  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== SIG_CENTRAL) {
      throw new XlsxError('Архив повреждён.');
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(
      new Uint8Array(view.buffer, view.byteOffset + offset + 46, nameLength),
    );

    entries.set(name, { name, method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function readFile(
  view: DataView,
  entries: Map<string, ZipEntry>,
  name: string,
): Promise<string | null> {
  const entry = entries.get(name);
  if (!entry) return null;

  const header = entry.localOffset;
  if (view.getUint32(header, true) !== SIG_LOCAL) throw new XlsxError('Архив повреждён.');
  const nameLength = view.getUint16(header + 26, true);
  const extraLength = view.getUint16(header + 28, true);
  const start = header + 30 + nameLength + extraLength;

  const raw = new Uint8Array(view.buffer, view.byteOffset + start, entry.compressedSize);

  if (entry.method === 0) return new TextDecoder().decode(raw);
  if (entry.method === 8) return new TextDecoder().decode(await inflate(raw));
  throw new XlsxError(`Неподдерживаемое сжатие в архиве (${entry.method}).`);
}

/* ── XML ───────────────────────────────────────────────────────────── */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

export function unescapeXml(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (match, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    }
    if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return ENTITIES[code] ?? match;
  });
}

/** `<si>` entries, each the concatenation of its `<t>` runs. */
export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.match(/<si\b[\s\S]*?<\/si>/g) ?? []) {
    let value = '';
    for (const t of si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? []) {
      value += unescapeXml(t.replace(/<t\b[^>]*>/, '').replace(/<\/t>$/, ''));
    }
    out.push(value);
  }
  return out;
}

/** `"C"` -> 2. Spreadsheet columns are base-26 with no zero digit. */
export function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0] ?? 'A';
  let index = 0;
  for (const char of letters.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

/**
 * Excel stores dates as a day count from 1899-12-30. The odd epoch exists
 * because the format reproduces a Lotus 1-2-3 bug that treats 1900 as a leap
 * year: serial 60 is 1900-02-29, a date that never happened.
 *
 * The consequence is that serials below 61 are ambiguous — Excel displays them
 * one day later than any linear formula. Since no workout is from 1900, those
 * are refused rather than guessed at; every real date (61 = 1900-03-01 onward)
 * converts exactly.
 */
export const MIN_DATE_SERIAL = 61;

export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < MIN_DATE_SERIAL || serial > 400_000) return null;
  const ms = Math.round(serial) * 86_400_000 + Date.UTC(1899, 11, 30);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function parseSheet(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];

  for (const rowXml of xml.match(/<row\b[\s\S]*?(?:\/>|<\/row>)/g) ?? []) {
    const row: string[] = [];

    for (const cellXml of rowXml.match(/<c\b[\s\S]*?(?:\/>|<\/c>)/g) ?? []) {
      const ref = cellXml.match(/\sr="([A-Z]+\d+)"/i)?.[1] ?? '';
      const type = cellXml.match(/\st="(\w+)"/)?.[1] ?? 'n';
      const index = ref ? columnIndex(ref) : row.length;

      let value = '';
      if (type === 'inlineStr') {
        const parts = cellXml.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? [];
        value = parts
          .map((t) => unescapeXml(t.replace(/<t\b[^>]*>/, '').replace(/<\/t>$/, '')))
          .join('');
      } else {
        const raw = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? '';
        const decoded = unescapeXml(raw);
        value = type === 's' ? (sharedStrings[Number(decoded)] ?? '') : decoded;
      }

      while (row.length < index) row.push('');
      row[index] = value;
    }
    rows.push(row);
  }
  return rows;
}

/* ── Entry point ───────────────────────────────────────────────────── */

/** The first worksheet of an .xlsx file, as rows of strings. */
export async function readXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  if (buffer.byteLength < 22) throw new XlsxError('Файл пустой.');
  const view = new DataView(buffer);
  if (view.getUint16(0, true) !== 0x4b50) {
    throw new XlsxError('Это не .xlsx. Сохраните файл как Excel или CSV.');
  }

  const entries = readEntries(view);
  const sheetName =
    ['xl/worksheets/sheet1.xml', 'xl/worksheets/Sheet1.xml'].find((n) => entries.has(n)) ??
    [...entries.keys()].find((n) => n.startsWith('xl/worksheets/') && n.endsWith('.xml'));

  if (!sheetName) throw new XlsxError('В файле не найден лист.');

  const [sheetXml, sharedXml] = await Promise.all([
    readFile(view, entries, sheetName),
    readFile(view, entries, 'xl/sharedStrings.xml'),
  ]);
  if (!sheetXml) throw new XlsxError('Не удалось прочитать лист.');

  return parseSheet(sheetXml, sharedXml ? parseSharedStrings(sharedXml) : []);
}

/** Rows back to delimited text, so the CSV importer can consume them. */
export function rowsToCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => (/[",;\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join(','),
    )
    .join('\n');
}
