// Reading and writing a workbook with no library behind it.
//
// The round trip is the claim: what this writes, this reads. Anything more --
// that Excel itself opens it -- is not checkable here and is said plainly in
// the module and the PR rather than implied by a green test.
import { describe, expect, it } from 'vitest';
import { readWorkbook, unzip, writeWorkbook, zip } from '@/xlsx';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe('zip', () => {
  it('writes files a reader can find again', async () => {
    const out = zip({
      'a.txt': encoder.encode('first'),
      'deep/b.txt': encoder.encode('second'),
    });
    const back = await unzip(out);
    expect(Object.keys(back).sort()).toEqual(['a.txt', 'deep/b.txt']);
    expect(decoder.decode(back['a.txt'])).toBe('first');
    expect(decoder.decode(back['deep/b.txt'])).toBe('second');
  });

  it('and says so when handed something that is not one', async () => {
    await expect(unzip(encoder.encode('just some text'))).rejects.toThrow(/not a spreadsheet/);
  });
});

describe('a workbook', () => {
  const book = {
    Questions: [
      ['Ref', 'Kind', 'Question'],
      ['Q1', 'Matching', 'Match the year to the event'],
    ],
    Q1: [
      ['Item', 'Matches'],
      ['1998', 'ESOP formed'],
    ],
  };

  it('comes back with its sheets, in order, cell for cell', async () => {
    const back = await readWorkbook(writeWorkbook(book));
    expect(Object.keys(back)).toEqual(['Questions', 'Q1']);
    expect(back.Questions[1]).toEqual(['Q1', 'Matching', 'Match the year to the event']);
    expect(back.Q1[1]).toEqual(['1998', 'ESOP formed']);
  });

  // The characters that break XML if they are written raw, and a sheet name
  // that carries one.
  it('survives the characters that break XML', async () => {
    const awkward = {
      'Round 1 & 2': [['a < b', 'c > d'], ['"quoted"', "it's"]],
    };
    const back = await readWorkbook(writeWorkbook(awkward));
    expect(back['Round 1 & 2']).toEqual([
      ['a < b', 'c > d'],
      ['"quoted"', "it's"],
    ]);
  });

  // Excel leaves an empty cell out of the file entirely, so a row is rebuilt
  // from cell references rather than from order. A row read by position would
  // shift everything left and pair the wrong columns.
  it('puts a blank first cell back where it was', async () => {
    const xml =
      '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetData><row r="1"><c r="B1" t="inlineStr"><is><t>second</t></is></c></row></sheetData></worksheet>';
    const files = {
      '[Content_Types].xml': encoder.encode('<Types/>'),
      'xl/workbook.xml': encoder.encode(
        '<workbook xmlns:r="x"><sheets><sheet name="One" sheetId="1" r:id="rId1"/></sheets></workbook>'
      ),
      'xl/_rels/workbook.xml.rels': encoder.encode(
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'
      ),
      'xl/worksheets/sheet1.xml': encoder.encode(xml),
    };
    const back = await readWorkbook(zip(files));
    expect(back.One).toEqual([['', 'second']]);
  });

  // Text lives in a shared table in what Excel writes, rather than in the cell.
  it('reads the shared string table Excel writes', async () => {
    const files = {
      'xl/workbook.xml': encoder.encode(
        '<workbook xmlns:r="x"><sheets><sheet name="One" sheetId="1" r:id="rId1"/></sheets></workbook>'
      ),
      'xl/_rels/workbook.xml.rels': encoder.encode(
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'
      ),
      'xl/sharedStrings.xml': encoder.encode(
        '<sst><si><t>ESOP formed</t></si><si><r><t>Fiber </t></r><r><t>launch</t></r></si></sst>'
      ),
      'xl/worksheets/sheet1.xml': encoder.encode(
        '<worksheet><sheetData><row r="1">' +
          '<c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c>' +
          '</row></sheetData></worksheet>'
      ),
    };
    const back = await readWorkbook(zip(files));
    // The second is split into two runs by formatting, and is one string.
    expect(back.One).toEqual([['ESOP formed', 'Fiber launch']]);
  });

  it('and a number in a cell comes back as the text it shows', async () => {
    const files = {
      'xl/workbook.xml': encoder.encode(
        '<workbook xmlns:r="x"><sheets><sheet name="One" sheetId="1" r:id="rId1"/></sheets></workbook>'
      ),
      'xl/_rels/workbook.xml.rels': encoder.encode(
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'
      ),
      'xl/worksheets/sheet1.xml': encoder.encode(
        '<worksheet><sheetData><row r="1"><c r="A1"><v>1350</v></c></row></sheetData></worksheet>'
      ),
    };
    expect((await readWorkbook(zip(files))).One).toEqual([['1350']]);
  });

  // Attribute order is the writer's choice. This asked for Id before Target,
  // which is what we write and the reverse of what openpyxl writes, so a real
  // workbook came back with no sheets at all -- found by opening one, not by
  // the round trip, which agreed with itself perfectly.
  it('reads a relationship whose attributes come in the other order', async () => {
    const files = {
      'xl/workbook.xml': encoder.encode(
        '<workbook xmlns:r="x"><sheets><sheet xmlns:r="x" name="One" sheetId="1" state="visible" r:id="rId1"/></sheets></workbook>'
      ),
      'xl/_rels/workbook.xml.rels': encoder.encode(
        '<Relationships><Relationship Type="worksheet" Target="/xl/worksheets/sheet1.xml" Id="rId1"/></Relationships>'
      ),
      'xl/worksheets/sheet1.xml': encoder.encode(
        '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>here</t></is></c></row></sheetData></worksheet>'
      ),
    };
    expect((await readWorkbook(zip(files))).One).toEqual([['here']]);
  });

  it('refuses a zip that is not a workbook', async () => {
    await expect(readWorkbook(zip({ 'a.txt': encoder.encode('x') }))).rejects.toThrow(
      /not a spreadsheet/
    );
  });
});
