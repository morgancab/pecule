// Pécule : script à coller dans ta feuille Google (Extensions → Apps Script).
// Lecture seule de l'onglet de suivi + enregistrement des réglages de l'app dans ton compte Google.
// Ne renvoie rien sans le jeton. Remplace les trois valeurs ci-dessous.
var TOKEN = 'REMPLACE_PAR_UN_JETON_ALEATOIRE'; // même valeur que GSHEET_TOKEN
var SPREADSHEET_ID = 'ID_DE_TA_FEUILLE'; // dans l'adresse : /spreadsheets/d/<ID>/edit
var SHEET_ID = null; // gid de l'onglet (dans l'adresse : #gid=<nombre>) ; null = premier onglet

function doGet(e) {
  if (!e || !e.parameter || e.parameter.token !== TOKEN) return json_({ error: 'forbidden' });
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheets().filter(function (s) { return SHEET_ID === null || s.getSheetId() === SHEET_ID; })[0] || ss.getSheets()[0];
  var prefs = PropertiesService.getScriptProperties().getProperty('pecule_prefs');
  return json_({ sheet: sheet.getName(), values: sheet.getDataRange().getDisplayValues(), prefs: prefs ? JSON.parse(prefs) : null });
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
  if (body.token !== TOKEN) return json_({ error: 'forbidden' });
  PropertiesService.getScriptProperties().setProperty('pecule_prefs', JSON.stringify(body.prefs || {}));
  return json_({ ok: true });
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
