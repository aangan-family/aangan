#!/usr/bin/env node
// Makes the two spreadsheets in templates/:
//   family-tree-template.xlsx  – empty, with instructions and drop-downs: fill this in for your family
//   sample-family.xlsx         – a made-up family (no real people) to see how it's done and to try the site
//   npm run template
import ExcelJS from 'exceljs';
import { mkdirSync } from 'node:fs';

export const HEADINGS = [
  ['ID', 9, 'Optional. A short code for this person, e.g. P001. Leave blank and we number them for you.'],
  ['First name', 16, 'Required. The name the family uses.'],
  ['Surname', 16, 'Surname, family name or initial.'],
  ['Maiden name', 14, 'Surname before marriage, if it changed.'],
  ['Gender', 10, 'Male, Female or Other.'],
  ['Father', 20, 'His ID, or his full name exactly as written in his own row. He needs a row too.'],
  ['Mother', 20, 'Her ID, or her full name exactly as written in her own row. She needs a row too.'],
  ['Spouse', 20, 'Husband or wife: ID or full name. Fill it on either row (one is enough). Two spouses? Separate with ;'],
  ['Wedding date', 13, 'DD-MM-YYYY, or just the year.'],
  ['Birth date or year', 15, 'DD-MM-YYYY (e.g. 14-07-1968), or just the year. Only close family see full birth dates.'],
  ['Living (Yes or No)', 12, 'Yes or No. Leave blank for Yes.'],
  ['Date or year of passing', 15, 'Only for those who have passed away.'],
  ['Birth place', 14, ''],
  ['Native place', 14, 'Native village or town, the family\'s roots.'],
  ['City', 14, 'Where they live now.'],
  ['Work', 16, 'Occupation or studies.'],
  ['Gothram (gotra)', 14, 'Optional, if your community uses it.'],
  ['Family deity (kuldevi / kuladeivam)', 18, 'Optional, if your community uses it.'],
  ['Known as', 12, 'Pet name or what relatives call them.'],
  ['Notes', 30, 'Anything else the family should know.'],
];

const START = [
  ['Your family tree, in one sheet.', 'title'],
  ['', ''],
  ['1. Open the "Family" tab. Each row is one person.', ''],
  ['2. Start with the oldest couple you know, then their children, then grandchildren. Order doesn\'t matter, but it\'s easier.', ''],
  ['3. Link people with the Father, Mother and Spouse columns. Write the person\'s ID (e.g. P001) or their full name exactly as in their own row.', ''],
  ['4. Everyone you link to needs their own row, including people who married in and their parents if you want their side too.', ''],
  ['5. Dates: DD-MM-YYYY (14-07-1968) or just the year (1968). Unsure? Leave it blank. You can fill it in later on the website.', ''],
  ['6. Save the file and upload it in the setup (or run: npm run import -- your-file.xlsx --check).', ''],
  ['', ''],
  ['What not to put here', 'h'],
  ['Phone numbers, emails and home addresses. Even if you add them, they are not imported. Each person adds their own after they join and choose who can see them.', ''],
  ['', ''],
  ['Any community, any tradition', 'h'],
  ['Gothram and family deity are optional. Leave them blank if your family doesn\'t use them. Names in any script are fine.', ''],
  ['', ''],
  ['Stuck? Open sample-family.xlsx to see a filled-in example (a made-up family).', ''],
];

function startSheet(wb) {
  const ws = wb.addWorksheet('Start here', { properties: { tabColor: { argb: 'FF0A84FF' } } });
  ws.getColumn(1).width = 110;
  START.forEach(([t, k], i) => {
    const c = ws.getCell(i + 1, 1);
    c.value = t;
    c.alignment = { wrapText: true, vertical: 'top' };
    c.font = k === 'title' ? { size: 20, bold: true } : k === 'h' ? { size: 13, bold: true } : { size: 12 };
  });
}

function familySheet(wb, rows = []) {
  const ws = wb.addWorksheet('Family', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
  ws.columns = HEADINGS.map(([h, w]) => ({ header: h, width: w }));
  const head = ws.getRow(1);
  head.height = 34;
  head.eachCell((c, i) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i <= 2 ? 'FF0A84FF' : 'FF3A3A3C' } };
    c.alignment = { wrapText: true, vertical: 'middle' };
    const note = HEADINGS[i - 1][2];
    if (note) c.note = note;
  });
  for (const r of rows) ws.addRow(r);
  const last = Math.max(rows.length + 1, 500);
  const list = (col, items) => {
    for (let r = 2; r <= last; r++) ws.getCell(r, col).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${items}"`] };
  };
  list(5, 'Male,Female,Other');
  list(11, 'Yes,No');
  for (const col of [9, 10, 12]) ws.getColumn(col).numFmt = '@'; // keep dates as typed (DD-MM-YYYY)
  return ws;
}

// A made-up family across communities: a Tamil family whose children married into Bengali, Punjabi,
// Malayali, Marwari, Gujarati and Hyderabadi families. None of these people are real.
export const SAMPLE = [
  ['P001', 'Seshadri', 'Iyer', '', 'Male', '', '', 'P002', '1953', '1930', 'No', '2008', 'Kumbakonam', 'Kumbakonam', '', 'Schoolteacher', 'Bharadwaja', 'Swamimalai Murugan', '', 'Started the family\'s Diwali get-together.'],
  ['P002', 'Kamakshi', 'Iyer', 'Krishnan', 'Female', '', '', '', '', '1934', 'No', '2016', 'Thanjavur', '', '', '', '', '', 'Paati', ''],
  ['P003', 'Ramesh', 'Seshadri', '', 'Male', 'P001', 'P002', 'P004', '08-02-1982', '11-03-1956', 'Yes', '', 'Kumbakonam', 'Kumbakonam', 'Chennai', 'Retired engineer', '', '', '', ''],
  ['P004', 'Uma', 'Ramesh', 'Natarajan', 'Female', '', '', '', '', '1960', 'Yes', '', 'Madurai', '', 'Chennai', 'Carnatic music teacher', '', '', '', ''],
  ['P005', 'Arjun', 'Ramesh', '', 'Male', 'P003', 'P004', 'P006', '12-12-2012', '05-06-1984', 'Yes', '', 'Chennai', '', 'Bengaluru', 'Software architect', '', '', '', ''],
  ['P006', 'Priyanka', 'Arjun', 'Banerjee', 'Female', 'P007', 'P008', '', '', '22-09-1986', 'Yes', '', 'Kolkata', '', 'Bengaluru', 'Doctor', '', '', 'Mishti', ''],
  ['P007', 'Subhash', 'Banerjee', '', 'Male', '', '', 'P008', '1983', '1955', 'Yes', '', 'Kolkata', 'Bardhaman', 'Kolkata', 'Professor', 'Shandilya', '', '', ''],
  ['P008', 'Mitali', 'Banerjee', 'Ghosh', 'Female', '', '', '', '', '1958', 'Yes', '', 'Kolkata', '', 'Kolkata', '', '', '', '', ''],
  ['P009', 'Ishaan', 'Arjun', '', 'Male', 'P005', 'P006', '', '', '2015', 'Yes', '', 'Bengaluru', '', 'Bengaluru', 'School', '', '', '', ''],
  ['P010', 'Mira', 'Arjun', '', 'Female', 'Arjun Ramesh', 'Priyanka Arjun', '', '', '2019', 'Yes', '', 'Bengaluru', '', 'Bengaluru', 'School', '', '', '', ''],
  ['P011', 'Kavya', 'Gill', 'Ramesh', 'Female', 'P003', 'P004', 'P012', '2017', '17-01-1988', 'Yes', '', 'Chennai', '', 'Pune', 'Architect', '', '', '', ''],
  ['P012', 'Harpreet Singh', 'Gill', '', 'Male', 'P013', 'P014', '', '', '1987', 'Yes', '', 'Ludhiana', 'Ludhiana', 'Pune', 'Army officer', '', '', 'Harry', ''],
  ['P013', 'Gurmeet Singh', 'Gill', '', 'Male', '', '', 'P014', '', '1958', 'Yes', '', 'Ludhiana', 'Ludhiana', 'Ludhiana', 'Farmer', '', '', '', ''],
  ['P014', 'Jasbir', 'Kaur', '', 'Female', '', '', '', '', '1961', 'Yes', '', 'Amritsar', '', 'Ludhiana', '', '', '', '', ''],
  ['P015', 'Noor', 'Gill', '', 'Female', 'P012', 'P011', '', '', '2020', 'Yes', '', 'Pune', '', 'Pune', '', '', '', '', ''],
  ['P016', 'Lakshmi', 'Menon', 'Seshadri', 'Female', 'P001', 'P002', 'P017', '1982', '1959', 'Yes', '', 'Kumbakonam', '', 'Kochi', 'Bank manager (retired)', '', '', 'Lakshmi Athai', ''],
  ['P017', 'Vinod', 'Menon', '', 'Male', '', '', '', '', '1955', 'Yes', '', 'Thrissur', 'Thrissur', 'Kochi', 'Chartered accountant', '', '', '', ''],
  ['P018', 'Anjali', 'Agarwal', 'Menon', 'Female', 'P017', 'P016', 'P019', '2013', '1985', 'Yes', '', 'Kochi', '', 'Jaipur', 'Designer', '', '', '', ''],
  ['P019', 'Rohan', 'Agarwal', '', 'Male', 'P020', 'P021', '', '', '1983', 'Yes', '', 'Jaipur', 'Jhunjhunu', 'Jaipur', 'Family business (textiles)', 'Garg', 'Rani Sati Dadi', '', ''],
  ['P020', 'Suresh', 'Agarwal', '', 'Male', '', '', 'P021', '', '1952', 'Yes', '', 'Jhunjhunu', 'Jhunjhunu', 'Jaipur', 'Textile trader', 'Garg', 'Rani Sati Dadi', '', ''],
  ['P021', 'Sunita', 'Agarwal', 'Goyal', 'Female', '', '', '', '', '1956', 'Yes', '', 'Bikaner', '', 'Jaipur', '', '', '', '', ''],
  ['P022', 'Vihaan', 'Agarwal', '', 'Male', 'P019', 'P018', '', '', '2016', 'Yes', '', 'Jaipur', '', 'Jaipur', '', '', '', '', ''],
  ['P023', 'Karthik', 'Menon', '', 'Male', 'P017', 'P016', 'P024', '2021', '1990', 'Yes', '', 'Kochi', '', 'Hyderabad', 'Marine biologist', '', '', '', ''],
  ['P024', 'Fatima', 'Sheikh', '', 'Female', '', '', '', '', '1991', 'Yes', '', 'Hyderabad', 'Hyderabad', 'Hyderabad', 'Journalist', '', '', '', ''],
  ['P025', 'Suresh', 'Seshadri', '', 'Male', 'P001', 'P002', 'P026', '1992', '1962', 'Yes', '', 'Kumbakonam', '', 'Ahmedabad', 'Pharmacist', '', '', '', ''],
  ['P026', 'Neha', 'Patel', '', 'Female', '', '', '', '', '1966', 'Yes', '', 'Vadodara', 'Anand', 'Ahmedabad', 'Pharmacist', '', '', '', ''],
  ['P027', 'Riya', 'Suresh', '', 'Female', 'P025', 'P026', '', '', '1994', 'Yes', '', 'Ahmedabad', '', 'Mumbai', 'Chef', '', '', '', ''],
  ['P028', 'Dev', 'Suresh', '', 'Male', 'P025', 'P026', '', '', '1997', 'Yes', '', 'Ahmedabad', '', 'Ahmedabad', 'Studying law', '', '', '', ''],
  ['P029', 'Meenakshi', 'Seshadri', '', 'Female', 'P001', 'P002', '', '', '1965', 'No', '2020', 'Kumbakonam', '', '', 'Veena artist', '', '', 'Meenu', ''],
];

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(new URL('../templates/', import.meta.url), { recursive: true });
  for (const [name, rows] of [['family-tree-template.xlsx', []], ['sample-family.xlsx', SAMPLE]]) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Family website';
    startSheet(wb);
    familySheet(wb, rows);
    wb.views = [{ activeTab: 1 }];
    await wb.xlsx.writeFile(new URL(`../templates/${name}`, import.meta.url).pathname);
    console.log('wrote templates/' + name);
  }
}
