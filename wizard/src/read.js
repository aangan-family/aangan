// Reads the family sheet inside the browser. The file is never uploaded anywhere.
import { COLUMNS, norm, text, parseCsv } from '../../scripts/lib/sheet.mjs';

/** file: a File from the picker or a drop. Returns rows [{heading: value}] like scripts/import-sheet.mjs readSheet(). */
export async function readSheetFile(file) {
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Please choose an Excel file (.xlsx) or a CSV file. In Google Sheets: File → Download → Microsoft Excel (.xlsx).');
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  for (const ws of wb.worksheets) {
    const head = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { head[i] = text(c.value); });
    if (!head.some((h) => COLUMNS.given_name.includes(norm(h)))) continue;
    const rows = [];
    ws.eachRow({ includeEmpty: true }, (row, i) => {
      if (i === 1) return;
      const o = {};
      head.forEach((h, j) => { if (h) o[h] = text(row.getCell(j).value); });
      rows.push(o);
    });
    while (rows.length && Object.values(rows[rows.length - 1]).every((v) => v === '')) rows.pop();
    return rows;
  }
  throw new Error('No sheet with a "First name" column was found. Use the Family sheet from the template.');
}
