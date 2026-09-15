import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  columnIndex,
  excelSerialToIso,
  parseSharedStrings,
  parseSheet,
  readXlsx,
  rowsToCsv,
  unescapeXml,
  XlsxError,
} from './xlsx';

/* ── A real .xlsx builder, so the test exercises actual ZIP + deflate ── */

interface Entry {
  name: string;
  data: Buffer;
  /** 0 = stored, 8 = deflate. Both appear in files Excel and exporters emit. */
  method: 0 | 8;
}

function crc32(buffer: Buffer): number {
  let table = (crc32 as { table?: number[] }).table;
  if (!table) {
    table = [];
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    (crc32 as { table?: number[] }).table = table;
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(entries: Entry[]): ArrayBuffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const payload = entry.method === 8 ? deflateRawSync(entry.data) : entry.data;
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + payload.length;
  }

  const centralBuffer = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);

  const zip = Buffer.concat([...locals, centralBuffer, eocd]);
  return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
}

const SHARED = `<?xml version="1.0"?>
<sst count="5" uniqueCount="5">
  <si><t>Date</t></si>
  <si><t>Exercise</t></si>
  <si><t>Weight</t></si>
  <si><t>Reps</t></si>
  <si><t>Жим штанги лежа</t></si>
</sst>`;

const SHEET = `<?xml version="1.0"?>
<worksheet><sheetData>
  <row r="1">
    <c r="A1" t="s"><v>0</v></c>
    <c r="B1" t="s"><v>1</v></c>
    <c r="C1" t="s"><v>2</v></c>
    <c r="D1" t="s"><v>3</v></c>
  </row>
  <row r="2">
    <c r="A2"><v>46235</v></c>
    <c r="B2" t="s"><v>4</v></c>
    <c r="C2"><v>52.5</v></c>
    <c r="D2"><v>12</v></c>
  </row>
  <row r="3">
    <c r="A3" t="inlineStr"><is><t>2026-08-01</t></is></c>
    <c r="B3" t="inlineStr"><is><t>Жим &amp; тяга</t></is></c>
    <c r="D3"><v>10</v></c>
  </row>
</sheetData></worksheet>`;

function xlsx(method: 0 | 8 = 8): ArrayBuffer {
  return buildZip([
    { name: 'xl/sharedStrings.xml', data: Buffer.from(SHARED, 'utf8'), method },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(SHEET, 'utf8'), method },
  ]);
}

/* ── Tests ─────────────────────────────────────────────────────────── */

describe('xml helpers', () => {
  it('unescapes entities including numeric ones', () => {
    expect(unescapeXml('a &amp; b &lt;c&gt; &quot;d&quot; &#1046; &#x416;')).toBe(
      'a & b <c> "d" Ж Ж',
    );
  });

  it('concatenates rich-text runs in shared strings', () => {
    const strings = parseSharedStrings(
      '<sst><si><r><t>Жим </t></r><r><t>лежа</t></r></si><si><t>Тяга</t></si></sst>',
    );
    expect(strings).toEqual(['Жим лежа', 'Тяга']);
  });

  it('maps column letters to indexes', () => {
    expect(columnIndex('A1')).toBe(0);
    expect(columnIndex('D2')).toBe(3);
    expect(columnIndex('Z9')).toBe(25);
    expect(columnIndex('AA1')).toBe(26);
    expect(columnIndex('AB1')).toBe(27);
  });

  it('keeps sparse rows aligned to their columns', () => {
    // C1 present, A and B missing: the value must land in the third column.
    const rows = parseSheet('<sheetData><row r="1"><c r="C1"><v>7</v></c></row></sheetData>', []);
    expect(rows[0]).toEqual(['', '', '7']);
  });
});

describe('excel date serials', () => {
  it('converts real dates exactly', () => {
    expect(excelSerialToIso(25569)).toBe('1970-01-01');
    expect(excelSerialToIso(45000)).toBe('2023-03-15');
    expect(excelSerialToIso(46235)).toBe('2026-08-01');
    expect(excelSerialToIso(46234)).toBe('2026-07-31');
  });

  it('refuses the 1900 range instead of guessing', () => {
    // Excel's leap-year bug makes serials below 61 ambiguous by a day, and no
    // workout is from 1900 anyway.
    expect(excelSerialToIso(1)).toBeNull();
    expect(excelSerialToIso(60)).toBeNull();
    expect(excelSerialToIso(61)).toBe('1900-03-01');
  });

  it('rejects values that cannot be dates', () => {
    expect(excelSerialToIso(0)).toBeNull();
    expect(excelSerialToIso(-5)).toBeNull();
    expect(excelSerialToIso(Number.NaN)).toBeNull();
    expect(excelSerialToIso(999_999)).toBeNull();
  });
});

describe('readXlsx', () => {
  it('reads a deflate-compressed workbook', async () => {
    const rows = await readXlsx(xlsx(8));
    expect(rows[0]).toEqual(['Date', 'Exercise', 'Weight', 'Reps']);
    expect(rows[1]).toEqual(['46235', 'Жим штанги лежа', '52.5', '12']);
  });

  it('reads an uncompressed workbook too', async () => {
    const rows = await readXlsx(xlsx(0));
    expect(rows[1][1]).toBe('Жим штанги лежа');
  });

  it('reads inline strings and leaves gaps for empty cells', async () => {
    const rows = await readXlsx(xlsx(8));
    expect(rows[2]).toEqual(['2026-08-01', 'Жим & тяга', '', '10']);
  });

  it('refuses files that are not spreadsheets', async () => {
    const notZip = new TextEncoder().encode('это просто текст, а не таблица').buffer;
    await expect(readXlsx(notZip)).rejects.toBeInstanceOf(XlsxError);
    await expect(readXlsx(new ArrayBuffer(4))).rejects.toBeInstanceOf(XlsxError);
  });

  it('turns rows back into csv the importer can read', async () => {
    const csv = rowsToCsv(await readXlsx(xlsx(8)));
    expect(csv.split('\n')[0]).toBe('Date,Exercise,Weight,Reps');
    // A cell containing the delimiter gets quoted.
    expect(rowsToCsv([['a,b', 'c']])).toBe('"a,b",c');
  });
});
