/**
 * Shristi Hub — Google Sheets read API
 * =====================================================================
 * Read-only Apps Script web app that exposes the three council spreadsheets
 * to the Council Hub website. Council members edit the sheet; the hub reads it.
 *
 * Sheets (keep these names and headers exactly):
 *
 *   House Points  : Specific | Type | House | Position | Teams Won | Points
 *                   Type  = Individual | Team
 *                   House = Dhaulagiri | Annapurna | Manaslu
 *                   Position = 1 | 2 | 3      (1st / 2nd / 3rd)
 *                   Teams Won = how many teams won (informational)
 *                   Points = points awarded; the website adds this column up
 *
 *   Calendar      : Date | Type | Details
 *                   Type = Holiday | Normal | Competition | Event | Examination
 *
 *   Monetary Fund : Date | Type | Amount | Description
 *                   Type = Income | Expense
 *                   The website shows Total Income, Total Expenses and Balance.
 *
 * Endpoints (all GET):
 *   ?section=housePoints | calendar | finances   → { ok, section, updatedAt, count, rows[] }
 *   ?section=ping                                → tab names + spreadsheet name
 *   &token=YOUR_TOKEN   optional shared token (see SHARED_TOKEN below)
 *   &callback=fn        optional JSONP wrapper for browsers that block CORS
 *
 * Setup: paste this file into a new Apps Script project, run setup() once (it creates and
 * configures the spreadsheet), then deploy it as a web app and paste the URL into
 * Admin Panel → Google Sheets. See GOOGLE-SHEETS-SETUP.md for the click-by-click steps.
 * Already have a spreadsheet with your own column titles? Run fixHeaders() once.
 * =====================================================================
 */

/** Optional shared read token. Leave '' to keep the endpoint open (read-only data). */
var SHARED_TOKEN = '';

/** Leave blank to use the spreadsheet this script is bound to, or the one setup() created. */
var SPREADSHEET_ID = '';

/** Name of the spreadsheet setup() creates when the script is not bound to one. */
var SPREADSHEET_NAME = 'Shristi Council Hub Data';
var ID_PROPERTY = 'SHRISTI_SPREADSHEET_ID';

/** The three tabs, in the order the hub expects them. */
var TABS = {
  housePoints: 'House Points',
  calendar: 'Calendar',
  finances: 'Monetary Fund'
};

/** Columns of each tab — the single source of truth for setup() and the API. */
var COLUMNS = {
  housePoints: ['Specific', 'Type', 'House', 'Position', 'Teams Won', 'Points'],
  calendar: ['Date', 'Type', 'Details'],
  finances: ['Date', 'Type', 'Amount', 'Description']
};

/** Dropdown values written by setup(). */
var LISTS = {
  hpType: ['Individual', 'Team'],
  house: ['Dhaulagiri', 'Annapurna', 'Manaslu'],
  position: ['1', '2', '3'],
  calType: ['Holiday', 'Normal', 'Competition', 'Event', 'Examination'],
  moneyType: ['Income', 'Expense']
};

/**
 * Example rows written by setup(). Delete them once real results are entered —
 * they exist so the hub has something to render on the first refresh.
 */
var EXAMPLES = {
  housePoints: [
    ['Spelling Bee (Senior)', 'Individual', 'Annapurna', 1, 1, 3],
    ['Inter-house Football', 'Team', 'Dhaulagiri', 2, 1, 4],
    ['Science Quiz', 'Individual', 'Manaslu', 3, 1, 1]
  ],
  /* Real dates (year, month-1, day) so the examples mean the same thing in every
     spreadsheet locale; the dd/MM/yyyy format above decides how they are displayed. */
  calendar: [
    [new Date(2026, 4, 2), 'Holiday', 'Weekend'],
    [new Date(2026, 4, 5), 'Competition', 'Spelling Bee'],
    [new Date(2026, 4, 8), 'Examination', 'Mathematics Examination'],
    [new Date(2026, 4, 10), 'Event', 'Council Assembly'],
    [new Date(2026, 4, 12), 'Normal', 'Department Meeting']
  ],
  finances: [
    [new Date(2026, 4, 2), 'Income', 5000, 'Event collection'],
    [new Date(2026, 4, 3), 'Expense', 1500, 'Event materials']
  ]
};

/**
 * Alternative header spellings fixHeaders() understands. Only the header cell is renamed —
 * the column keeps its data and its position, so an existing sheet keeps working.
 */
var HEADER_ALIASES = {
  housePoints: {
    specific: ['specific', 'event', 'events', 'eventname', 'competition', 'activity', 'particulars', 'item', 'result', 'award'],
    type: ['type', 'category', 'awardtype', 'kind', 'individualteam', 'level'],
    house: ['house', 'housename', 'team', 'housecolor', 'greenhouse', 'colourhouse', 'colorhouse'],
    position: ['position', 'rank', 'place', 'standing', 'positionheld'],
    teamsWon: ['teamswon', 'teams', 'noofteams', 'numberofteams', 'teamcount', 'winners'],
    points: ['points', 'points awarded', 'pointsawarded', 'score', 'scorecard', 'marks', 'pts', 'point']
  },
  calendar: {
    date: ['date', 'eventdate', 'dateofevent', 'day', 'when'],
    type: ['type', 'category', 'daytype', 'kind', 'eventtype'],
    details: ['details', 'detail', 'event', 'eventname', 'title', 'name', 'description', 'occasion', 'particulars', 'activity']
  },
  finances: {
    date: ['date', 'transactiondate', 'dateoftransaction', 'day', 'when'],
    type: ['type', 'kind', 'direction', 'incomeexpense', 'flow'],
    amount: ['amount', 'amountrs', 'amountnpr', 'amountinr', 'value', 'sum', 'money', 'total', 'rs', 'npr'],
    description: ['description', 'particulars', 'purpose', 'details', 'remarks', 'narration', 'note', 'notes', 'title', 'reason']
  }
};

var DATE_FORMAT = 'dd/MM/yyyy';

/* ===================================================================== */
/* Web app entry point                                                   */
/* ===================================================================== */

function doGet(e) {
  var params = (e && e.parameter) || {};
  var callback = params.callback || '';
  try {
    if (SHARED_TOKEN && params.token !== SHARED_TOKEN) {
      return respond_({ ok: false, error: 'Unauthorized: the read token is missing or wrong.' }, callback);
    }
    var section = String(params.section || 'housePoints');
    if (section === 'ping') return respond_(pingSheet_(), callback);
    if (!TABS[section]) {
      return respond_({ ok: false, section: section, error: 'Unknown section. Use housePoints, calendar, finances or ping.' }, callback);
    }
    return respond_(readSection_(section), callback);
  } catch (error) {
    return respond_({
      ok: false,
      section: String((e && e.parameter && e.parameter.section) || ''),
      error: (error && error.message) ? error.message : String(error)
    }, callback);
  }
}

/** One section of the hub, ready to render. */
function readSection_(section) {
  var sheet = openSheet_(TABS[section]);
  var table = readTable_(sheet);
  var warnings = [];
  if (!table.length) {
    warnings.push('The ' + TABS[section] + ' tab has no data rows yet.');
  }
  return {
    ok: true,
    section: section,
    updatedAt: new Date().toISOString(),
    count: table.length,
    rows: table,
    warnings: warnings
  };
}

/** Connection check used by Admin Panel → Test connection. */
function pingSheet_() {
  var spreadsheet = openSpreadsheet_();
  var names = spreadsheet.getSheets().map(function (sheet) { return sheet.getName(); });
  var expected = [];
  var missing = [];
  Object.keys(TABS).forEach(function (key) {
    expected.push(TABS[key]);
    var sheet = spreadsheet.getSheetByName(TABS[key]);
    if (!sheet) missing.push(TABS[key]);
  });
  return {
    ok: true,
    section: 'ping',
    updatedAt: new Date().toISOString(),
    count: 1,
    rows: [{
      spreadsheetName: spreadsheet.getName(),
      tabs: names,
      expectedTabs: expected,
      missingTabs: missing,
      tokenRequired: Boolean(SHARED_TOKEN),
      housePointsRows: countRows_(spreadsheet.getSheetByName(TABS.housePoints)),
      calendarRows: countRows_(spreadsheet.getSheetByName(TABS.calendar)),
      financeRows: countRows_(spreadsheet.getSheetByName(TABS.finances))
    }],
    warnings: missing.length ? ['Missing tabs: ' + missing.join(', ') + '. Run setup() once.'] : []
  };
}

function countRows_(sheet) {
  if (!sheet) return 0;
  return Math.max(sheet.getLastRow() - 1, 0);
}

/* ===================================================================== */
/* One-time sheet setup                                                  */
/* ===================================================================== */

/**
 * Creates/repairs the three tabs: headers, dropdowns, number and date formats,
 * frozen header row, filter, and a few example rows. Safe to run more than once —
 * existing data rows are never touched.
 */
function setup() {
  var spreadsheet = resolveSpreadsheet_(true);
  setupHousePoints_(spreadsheet);
  setupCalendar_(spreadsheet);
  setupFinances_(spreadsheet);
  dropDefaultSheet_(spreadsheet);
  var url = spreadsheet.getUrl();
  Logger.log('Spreadsheet: ' + spreadsheet.getName() + '\n' + url);
  debugPayloads();
  try {
    SpreadsheetApp.getUi().alert(
      'Council spreadsheets are ready.\n\n' +
      'Tabs: House Points, Calendar, Monetary Fund.\n' +
      'Dropdowns, date formats and example rows are in place.\n\n' +
      'Spreadsheet: ' + url + '\n\n' +
      'Delete the example rows when you start for real, then deploy the read API ' +
      '(Deploy → New deployment → Web app).'
    );
  } catch (ignored) {
    // Running from the Apps Script editor without a UI is fine.
  }
  return url;
}

/** Removes the blank "Sheet1" that Google adds to a brand new spreadsheet. */
function dropDefaultSheet_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName('Sheet1');
  if (sheet && spreadsheet.getSheets().length > 3 && sheet.getLastRow() === 0) {
    spreadsheet.deleteSheet(sheet);
  }
}

function setupHousePoints_(spreadsheet) {
  var sheet = ensureSheet_(spreadsheet, TABS.housePoints, COLUMNS.housePoints);
  var rows = 800;
  applyHeader_(sheet, COLUMNS.housePoints);
  sheet.getRange(2, 1, rows, 1).setNumberFormat('@');                 // Specific
  validate_(sheet, sheet.getRange(2, 2, rows, 1), LISTS.hpType, 'Choose Individual or Team.');
  validate_(sheet, sheet.getRange(2, 3, rows, 1), LISTS.house, 'Choose the house.');
  validate_(sheet, sheet.getRange(2, 4, rows, 1), LISTS.position, 'Choose 1 (first), 2 (second) or 3 (third).');
  sheet.getRange(2, 5, rows, 1).setNumberFormat('0').setHorizontalAlignment('center');
  sheet.getRange(2, 6, rows, 1).setNumberFormat('0').setHorizontalAlignment('center');
  writeExamples_(sheet, COLUMNS.housePoints.length, EXAMPLES.housePoints);
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidths(2, 5, 96);
  sheet.getRange(1, 1, rows, COLUMNS.housePoints.length).setVerticalAlignment('middle');
  freezeAndFilter_(sheet, COLUMNS.housePoints.length);
  return sheet;
}

function setupCalendar_(spreadsheet) {
  var sheet = ensureSheet_(spreadsheet, TABS.calendar, COLUMNS.calendar);
  var rows = 800;
  applyHeader_(sheet, COLUMNS.calendar);
  sheet.getRange(2, 1, rows, 1).setNumberFormat(DATE_FORMAT).setHorizontalAlignment('center');
  validate_(sheet, sheet.getRange(2, 2, rows, 1), LISTS.calType, 'Choose Holiday, Normal, Competition, Event or Examination.');
  sheet.getRange(2, 3, rows, 1).setNumberFormat('@');
  writeExamples_(sheet, COLUMNS.calendar.length, EXAMPLES.calendar, null, 1);
  sheet.setColumnWidth(1, 110);
  sheet.setColumnWidth(2, 130);
  sheet.setColumnWidth(3, 340);
  sheet.getRange(1, 1, rows, COLUMNS.calendar.length).setVerticalAlignment('middle');
  freezeAndFilter_(sheet, COLUMNS.calendar.length);
  return sheet;
}

function setupFinances_(spreadsheet) {
  var sheet = ensureSheet_(spreadsheet, TABS.finances, COLUMNS.finances);
  var rows = 800;
  applyHeader_(sheet, COLUMNS.finances);
  sheet.getRange(2, 1, rows, 1).setNumberFormat(DATE_FORMAT).setHorizontalAlignment('center');
  validate_(sheet, sheet.getRange(2, 2, rows, 1), LISTS.moneyType, 'Choose Income or Expense.');
  sheet.getRange(2, 3, rows, 1).setNumberFormat('#,##0.00').setHorizontalAlignment('right');
  sheet.getRange(2, 4, rows, 1).setNumberFormat('@');
  writeExamples_(sheet, COLUMNS.finances.length, EXAMPLES.finances, null, 1, 3);
  sheet.setColumnWidth(1, 110);
  sheet.setColumnWidth(2, 110);
  sheet.setColumnWidth(3, 130);
  sheet.setColumnWidth(4, 320);
  sheet.getRange(1, 1, rows, COLUMNS.finances.length).setVerticalAlignment('middle');
  freezeAndFilter_(sheet, COLUMNS.finances.length);
  return sheet;
}

function ensureSheet_(spreadsheet, name, header) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name, spreadsheet.getSheets().length);
  // A brand new tab is 1000×26; make sure the header row is what the API expects.
  var firstRow = sheet.getRange(1, 1, 1, header.length).getValues()[0];
  var matches = firstRow.every(function (value, index) {
    return String(value).trim().toLowerCase() === header[index].toLowerCase();
  });
  if (!matches && sheet.getLastRow() <= 1) sheet.getRange(1, 1, 1, header.length).setValues([header]);
  return sheet;
}

function applyHeader_(sheet, header) {
  var range = sheet.getRange(1, 1, 1, header.length);
  range.setValues([header]);
  range.setFontWeight('bold').setBackground('#3b2f9e').setFontColor('#ffffff')
    .setHorizontalAlignment('left').setVerticalAlignment('middle');
  sheet.setRowHeight(1, 30);
  sheet.setFrozenRows(1);
}

/** Careful: only writes into empty cells, so re-running setup() never overwrites data. */
function writeExamples_(sheet, width, examples, dateColumn, amountColumn) {
  if (isEmptyBelowHeader_(sheet, width)) {
    var range = sheet.getRange(2, 1, examples.length, width);
    range.setValues(examples);
    if (dateColumn) sheet.getRange(2, dateColumn, examples.length, 1).setNumberFormat(DATE_FORMAT);
    if (amountColumn) sheet.getRange(2, amountColumn, examples.length, 1).setNumberFormat('#,##0.00');
  }
}

function isEmptyBelowHeader_(sheet, width) {
  if (sheet.getLastRow() < 2) return true;
  var values = sheet.getRange(2, 1, Math.min(sheet.getLastRow() - 1, 50), width).getValues();
  return !values.some(function (row) {
    return row.some(function (cell) { return String(cell).trim() !== ''; });
  });
}

function freezeAndFilter_(sheet, width) {
  sheet.setFrozenRows(1);
  var existing = sheet.getFilter();
  if (existing) existing.remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), width).createFilter();
}

function validate_(sheet, range, options, help) {
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(options, true)
    .setAllowInvalid(false)
    .setHelpText(help)
    .build();
  range.setDataValidation(rule);
}

/* ===================================================================== */
/* Reading the sheet                                                     */
/* ===================================================================== */

/** Reads a tab into an array of objects keyed by the column headers. */
function readTable_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(normaliseHeader_);
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var raw = values[r];
    var row = {};
    var hasValue = false;
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      var value = formatCell_(raw[c]);
      if (value !== '' && value !== null) hasValue = true;
      row[headers[c]] = value;
    }
    if (hasValue) rows.push(row);
  }
  return rows;
}

/** "Teams Won" → "teamsWon", "Date" → "date"; unknown headers are kept as-is. */
function normaliseHeader_(header) {
  var text = String(header === null || header === undefined ? '' : header).trim();
  if (!text) return '';
  var parts = text.split(/[^A-Za-z0-9]+/).filter(function (part) { return part !== ''; });
  if (!parts.length) return '';
  return parts.map(function (part, index) {
    var lower = part.toLowerCase();
    if (index === 0) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join('');
}

/** Dates become yyyy-MM-dd, numbers stay numbers, everything else becomes trimmed text. */
function formatCell_(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Renames the header cells of an existing spreadsheet to the names this API expects.
 * Use it when you already have tabs with your own column titles: the rename happens in
 * place (data and column order are untouched), and any missing column is added empty at
 * the end of the header row. Run setup() first if the tabs do not exist yet.
 */
function fixHeaders() {
  var spreadsheet = openSpreadsheet_();
  var report = [];
  Object.keys(TABS).forEach(function (section) {
    var sheet = spreadsheet.getSheetByName(TABS[section]);
    if (!sheet) {
      report.push(TABS[section] + ': tab missing — run setup()');
      return;
    }
    report.push(applyHeaderNames_(sheet, COLUMNS[section], HEADER_ALIASES[section]).join(' | ') || TABS[section] + ': headers already correct');
  });
  Logger.log(report.join('\n'));
  try {
    SpreadsheetApp.getUi().alert('Header check\n\n' + report.join('\n'));
  } catch (ignored) {
    // No UI when called from a trigger or the editor's headless run.
  }
  return report.join('\n');
}

/** Matches/renames/appends one tab's headers. Returns human-readable notes. */
function applyHeaderNames_(sheet, expected, aliases) {
  var width = Math.max(sheet.getLastColumn(), expected.length);
  var row = sheet.getRange(1, 1, 1, width).getValues()[0];
  var key = function (value) {
    return String(value === null || value === undefined ? '' : value).toLowerCase().replace(/[^a-z0-9]/g, '');
  };
  var notes = [];
  var used = {};
  var appended = 0;
  expected.forEach(function (name) {
    var wanted = key(name);
    var exact = -1;
    var alias = -1;
    for (var c = 0; c < row.length; c++) {
      if (used[c]) continue;
      var current = key(row[c]);
      if (!current) continue;
      if (current === wanted) { exact = c; break; }
      if (alias === -1 && (aliases[wanted] || []).indexOf(current) !== -1) alias = c;
    }
    if (exact !== -1) { used[exact] = true; return; }
    if (alias !== -1) {
      notes.push('renamed "' + String(row[alias]).trim() + '" → "' + name + '"');
      row[alias] = name;
      used[alias] = true;
      return;
    }
    var column = row.length + appended;
    notes.push('added missing column "' + name + '"');
    appended += 1;
    row[column] = name;
    used[column] = true;
  });
  if (notes.length === 0) return [];
  sheet.getRange(1, 1, 1, row.length).setValues([row]);
  sheet.setFrozenRows(1);
  return notes;
}

/**
 * Finds the council spreadsheet: the ID at the top of this file, the spreadsheet this
 * script is bound to, or the one setup() created earlier (remembered in script
 * properties). setup() creates a fresh spreadsheet when none of those exist yet.
 */
function resolveSpreadsheet_(createIfMissing) {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  var properties = PropertiesService.getScriptProperties();
  var stored = properties.getProperty(ID_PROPERTY);
  if (stored) {
    try {
      return SpreadsheetApp.openById(stored);
    } catch (gone) {
      properties.deleteProperty(ID_PROPERTY);
    }
  }
  if (!createIfMissing) return null;
  var created = SpreadsheetApp.create(SPREADSHEET_NAME);
  properties.setProperty(ID_PROPERTY, created.getId());
  return created;
}

function openSpreadsheet_() {
  var spreadsheet = resolveSpreadsheet_(false);
  if (!spreadsheet) {
    throw new Error('No spreadsheet found. Run setup() once in the Apps Script editor, or set SPREADSHEET_ID at the top of this file.');
  }
  return spreadsheet;
}

function openSheet_(name) {
  var sheet = openSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('Tab "' + name + '" was not found. Run setup() once from the Apps Script editor.');
  return sheet;
}

/* ===================================================================== */
/* Responses                                                             */
/* ===================================================================== */

function respond_(payload, callback) {
  payload = payload || {};
  if (payload.ok !== true) payload.ok = false;
  if (payload.section === undefined) payload.section = '';
  if (payload.updatedAt === undefined) payload.updatedAt = new Date().toISOString();
  if (payload.count === undefined) payload.count = 0;
  if (!payload.rows) payload.rows = [];
  if (!payload.warnings) payload.warnings = [];
  var body = JSON.stringify(payload);
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$.]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + body + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

/* ===================================================================== */
/* Diagnostics                                                           */
/* ===================================================================== */

/** Logs what the website receives. Run from the editor after entering data. */
function debugPayloads() {
  Object.keys(TABS).forEach(function (section) {
    try {
      var payload = readSection_(section);
      Logger.log('--- ' + TABS[section] + ' (' + payload.count + ' rows) ---');
      Logger.log(JSON.stringify(payload.rows.slice(0, 5), null, 2));
      if (payload.warnings.length) Logger.log('warnings: ' + payload.warnings.join(' '));
    } catch (error) {
      Logger.log('--- ' + TABS[section] + ' FAILED: ' + (error && error.message ? error.message : error));
    }
  });
  return 'see View → Logs';
}
