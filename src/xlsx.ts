// Reading and writing a workbook, without a library.
//
// An .xlsx is a zip of XML: one part naming the sheets, one holding every
// string in the book, and one per sheet holding cell references. That is
// little enough to do here, and the alternatives were worse -- `xlsx` on npm
// ships known advisories and its fixes live on the publisher's own CDN rather
// than in the registry, and `exceljs` is a megabyte and a dependency tree for
// what this needs, which is rows of text. The house rule is that a runtime
// dependency needs a reason; "we read four XML files" is not one.
//
// Inflating is the browser's own DecompressionStream, which Chrome, Edge,
// Firefox, Safari 16.4 and Node all have. What we write is *stored* -- zip's
// no-compression mode -- so writing needs nothing at all, and Excel reads it
// happily. A template of four rows does not need compressing.
//
// What this does NOT do, and is not trying to: formulas, formatting, dates,
// numbers-as-numbers, merged cells, or anything outside the first worksheet
// column range it finds. Every cell comes back as the text Excel shows. For a
// quiz that is the whole of it; for anything else this is the wrong module.

/** A workbook as this cares about it: sheet name to rows of cells. */
export type Sheets = Record<string, string[][]>;

// ---------------------------------------------------------------------------
// Zip
// ---------------------------------------------------------------------------

const utf8 = new TextDecoder();

const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number) =>
  (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

async function inflate(raw: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('this browser cannot open a spreadsheet');
  }
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The files inside a zip, by name.
 *
 *  Read from the end: the central directory is the only part that says where
 *  each file starts, and a local header's sizes may be zeroed with the real
 *  ones written after the data, which is what a streaming writer does. */
export async function unzip(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  // The end-of-central-directory record, found by its signature. It is last,
  // and at most 22 bytes plus a comment nobody writes.
  let end = -1;
  for (let i = data.length - 22; i >= 0 && i > data.length - 65_557; i -= 1) {
    if (u32(data, i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('that is not a spreadsheet');

  const count = u16(data, end + 10);
  let at = u32(data, end + 16);
  const out: Record<string, Uint8Array> = {};

  for (let n = 0; n < count; n += 1) {
    if (u32(data, at) !== 0x02014b50) break;
    const method = u16(data, at + 10);
    const compressed = u32(data, at + 20);
    const nameLength = u16(data, at + 28);
    const extraLength = u16(data, at + 30);
    const commentLength = u16(data, at + 32);
    const start = u32(data, at + 42);
    const name = utf8.decode(data.subarray(at + 46, at + 46 + nameLength));

    // The local header repeats the name and its own extra field, and the data
    // follows it. Its lengths are the ones to trust for where the data begins.
    const localName = u16(data, start + 26);
    const localExtra = u16(data, start + 28);
    const from = start + 30 + localName + localExtra;
    const raw = data.subarray(from, from + compressed);
    out[name] = method === 0 ? raw : await inflate(raw);

    at += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

/** A zip holding these files, stored rather than compressed.
 *
 *  Stored because nothing here is big and CompressionStream would make the
 *  writer async for no gain -- a template is four rows. Excel does not care
 *  which it was given. */
export function zip(files: Record<string, Uint8Array>): Uint8Array {
  const encoder = new TextEncoder();
  const entries: { name: Uint8Array; bytes: Uint8Array; crc: number; at: number }[] = [];
  const parts: Uint8Array[] = [];
  let at = 0;

  const push = (bytes: Uint8Array) => {
    parts.push(bytes);
    at += bytes.length;
  };

  for (const [name, bytes] of Object.entries(files)) {
    const encoded = encoder.encode(name);
    const crc = crc32(bytes);
    const header = new Uint8Array(30 + encoded.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0, true); // flags
    view.setUint16(8, 0, true); // stored
    view.setUint32(14, crc, true);
    view.setUint32(18, bytes.length, true);
    view.setUint32(22, bytes.length, true);
    view.setUint16(26, encoded.length, true);
    header.set(encoded, 30);
    entries.push({ name: encoded, bytes, crc, at });
    push(header);
    push(bytes);
  }

  const directoryAt = at;
  for (const entry of entries) {
    const record = new Uint8Array(46 + entry.name.length);
    const view = new DataView(record.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(10, 0, true); // stored
    view.setUint32(16, entry.crc, true);
    view.setUint32(20, entry.bytes.length, true);
    view.setUint32(24, entry.bytes.length, true);
    view.setUint16(28, entry.name.length, true);
    view.setUint32(42, entry.at, true);
    record.set(entry.name, 46);
    push(record);
  }

  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, entries.length, true);
  view.setUint16(10, entries.length, true);
  view.setUint32(12, at - directoryAt, true);
  view.setUint32(16, directoryAt, true);
  push(end);

  const out = new Uint8Array(at);
  let written = 0;
  for (const part of parts) {
    out.set(part, written);
    written += part.length;
  }
  return out;
}

/** The checksum a zip carries for every file. Excel checks it; a wrong one is
 *  a workbook that opens as "unreadable content". */
function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

// ---------------------------------------------------------------------------
// The XML inside
// ---------------------------------------------------------------------------

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

const escapeXml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Everything between <t> tags, in order: the book's shared strings, which is
 *  where Excel puts text rather than in the cells themselves. */
function sharedStrings(xml: string): string[] {
  const out: string[] = [];
  // <si> is one string; it may be split into several <t> runs by formatting,
  // and the string is all of them joined.
  for (const [, si] of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const runs = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1]));
    out.push(runs.join(''));
  }
  return out;
}

/** The column a cell reference names: A is 0, B is 1, AA is 26. */
function columnOf(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** One sheet's rows. Cells are placed by their reference rather than by order,
 *  because Excel leaves empty cells out entirely -- a row whose first cell is
 *  blank would otherwise shift left and pair the wrong columns. */
function sheetRows(xml: string, strings: string[]): string[][] {
  const rows: string[][] = [];
  for (const [, attrs, body] of xml.matchAll(/<row([^>]*)>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const [, cellAttrs, cell] of body.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = cellAttrs.match(/r="([A-Z]+)\d+"/)?.[1] ?? '';
      const type = cellAttrs.match(/t="([^"]+)"/)?.[1] ?? 'n';
      let text = '';
      if (type === 'inlineStr') {
        text = [...cell.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join('');
      } else {
        const value = cell.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
        text = type === 's' ? (strings[Number(value)] ?? '') : unescapeXml(value);
      }
      const column = ref ? columnOf(ref) : row.length;
      while (row.length < column) row.push('');
      row[column] = text.trim();
    }
    // Excel writes a row element for a row somebody merely clicked in.
    if (row.some((c) => c !== '')) rows.push(row);
    void attrs;
  }
  return rows;
}

/** A workbook's sheets, in the order the book lists them. */
export async function readWorkbook(data: Uint8Array): Promise<Sheets> {
  const files = await unzip(data);
  const text = (name: string) => (files[name] ? utf8.decode(files[name]) : '');
  const book = text('xl/workbook.xml');
  if (!book) throw new Error('that is not a spreadsheet');

  const strings = sharedStrings(text('xl/sharedStrings.xml'));
  // The relationships part maps each sheet's id to the file holding it.
  //
  // Each relationship's attributes are read one at a time rather than in one
  // pattern, because their order is the writer's choice and not ours: this
  // asked for Id before Target, which is what we write and the reverse of what
  // openpyxl writes, so a real workbook came back with no sheets at all. The
  // same reason the target is stripped of a leading "/xl/" -- some writers
  // make it absolute within the package.
  const rels = text('xl/_rels/workbook.xml.rels');
  const target: Record<string, string> = {};
  for (const [, attrs] of rels.matchAll(/<Relationship([^>]*)\/?>/g)) {
    const id = attrs.match(/\bId="([^"]+)"/)?.[1];
    const path = attrs.match(/\bTarget="([^"]+)"/)?.[1];
    if (id && path) target[id] = path.replace(/^\/?xl\//, '').replace(/^\//, '');
  }

  const sheets: Sheets = {};
  for (const [, attrs] of book.matchAll(/<sheet([^>]*)\/>/g)) {
    const name = unescapeXml(attrs.match(/name="([^"]*)"/)?.[1] ?? '');
    const id = attrs.match(/r:id="([^"]+)"/)?.[1] ?? '';
    const path = target[id] ?? '';
    const xml = text(`xl/${path}`);
    if (!name || !xml) continue;
    sheets[name] = sheetRows(xml, strings);
  }
  return sheets;
}

/** A workbook Excel will open, with every cell written as inline text.
 *
 *  Inline rather than shared strings: it costs a few bytes on a file this size
 *  and removes the part most likely to be written wrong, which is an index
 *  into a table that has to agree with every sheet. */
export function writeWorkbook(sheets: Sheets): Uint8Array {
  const encoder = new TextEncoder();
  const names = Object.keys(sheets);
  const files: Record<string, Uint8Array> = {};
  const put = (path: string, body: string) => {
    files[path] = encoder.encode(body);
  };

  put(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      names
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        )
        .join('') +
      '</Types>'
  );

  put(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>'
  );

  put(
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      names
        .map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('') +
      '</sheets></workbook>'
  );

  put(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      names
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
        )
        .join('') +
      '</Relationships>'
  );

  names.forEach((name, i) => {
    const rows = sheets[name]
      .map((row, r) => {
        const cells = row
          .map((cell, c) =>
            cell === ''
              ? ''
              : `<c r="${column(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`
          )
          .join('');
        return `<row r="${r + 1}">${cells}</row>`;
      })
      .join('');
    put(
      `xl/worksheets/sheet${i + 1}.xml`,
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        `<sheetData>${rows}</sheetData></worksheet>`
    );
  });

  return zip(files);
}

/** 0 is A, 26 is AA. */
function column(n: number): string {
  let out = '';
  let i = n;
  do {
    out = String.fromCharCode(65 + (i % 26)) + out;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return out;
}
