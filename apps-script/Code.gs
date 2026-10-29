/**
 * سكربت تطبيق رواسي — ينحط بحساب Google مالتك (script.google.com)
 * يحفظ بيانات التطبيق بالـ Drive، ويكتب جداول مقروءة بـ Google Sheet،
 * وياخذ نسخة احتياطية يومية، ويمرر طلبات الذكاء الاصطناعي إلى Gemini.
 *
 * عدّل السطرين التاليين فقط:
 */
const TOKEN = 'اكتب-هنا-رمز-سري-طويل';      // نفس الرمز تكتبه بإعدادات التطبيق
const GEMINI_KEY = '';                        // مفتاح Gemini من aistudio.google.com (اختياري، للمساعد الذكي فقط)

// إعدادات إضافية (ما تحتاج تغيّرها)
const GEMINI_MODEL = 'gemini-3.5-flash-lite'; // أرخص نموذج سريع؛ تقدر تغيّره لـ gemini-3.8-flash لنتائج أدق
const FOLDER_NAME = 'رواسي - بيانات التطبيق';
const DATA_FILE = 'rawasi-data.json';
const SHEET_NAME = 'رواسي - الجداول';
const KEEP_BACKUPS = 30;
const COLLECTIONS = ['products', 'lots', 'bookings', 'batches', 'expenses', 'adjustments'];

function doGet() {
  return ContentService.createTextOutput('سكربت رواسي يشتغل ✓');
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const token = getSetting_('TOKEN', TOKEN);
    if (!token || token.indexOf('اكتب') === 0) return json_({ ok: false, error: 'لازم تكتب رمز سري بالسكربت (TOKEN) وتعيد النشر.' });
    if (body.token !== token) return json_({ ok: false, error: 'الرمز السري غلط.' });

    if (body.action === 'ping') return json_({ ok: true, email: Session.getEffectiveUser().getEmail() });
    if (body.action === 'sync') return json_(sync_(body));
    if (body.action === 'ai') return json_(ai_(body));
    return json_({ ok: false, error: 'طلب غير معروف' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

// ---------- المزامنة ----------
function sync_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const folder = folder_();
    const file = dataFile_(folder);
    let saved = {};
    const text = file.getBlob().getDataAsString('UTF-8');
    if (text) saved = JSON.parse(text);
    const merged = merge_(saved, body.data || {});
    file.setContent(JSON.stringify(merged));
    backup_(folder, merged);
    if (body.sheets) {
      try { writeSheets_(folder, body.sheets); } catch (err) { console.warn('sheets: ' + err); }
    }
    return { ok: true, data: merged, at: new Date().toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function merge_(a, b) {
  const out = { settings: {}, meta: {} };
  COLLECTIONS.forEach(function (c) {
    const map = {};
    [].concat(a[c] || [], b[c] || []).forEach(function (r) {
      if (!r || !r.id) return;
      const cur = map[r.id];
      if (!cur || String(r.updatedAt || '') > String(cur.updatedAt || '')) map[r.id] = r;
    });
    out[c] = Object.keys(map).map(function (k) { return map[k]; });
  });
  const sa = a.settings || {}, sb = b.settings || {};
  out.settings = String(sa.updatedAt || '') >= String(sb.updatedAt || '') ? sa : sb;
  if (!out.settings || !Object.keys(out.settings).length) out.settings = sb;
  out.meta = { bookingSeq: Math.max(Number((a.meta || {}).bookingSeq) || 0, Number((b.meta || {}).bookingSeq) || 0) };
  return out;
}

function folder_() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function dataFile_(folder) {
  const it = folder.getFilesByName(DATA_FILE);
  return it.hasNext() ? it.next() : folder.createFile(DATA_FILE, '{}', MimeType.PLAIN_TEXT);
}

function backup_(folder, data) {
  const props = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(new Date(), 'Asia/Baghdad', 'yyyy-MM-dd');
  if (props.getProperty('lastBackup') === today) return;
  const subIt = folder.getFoldersByName('نسخ احتياطية');
  const sub = subIt.hasNext() ? subIt.next() : folder.createFolder('نسخ احتياطية');
  sub.createFile('rawasi-' + today + '.json', JSON.stringify(data), MimeType.PLAIN_TEXT);
  props.setProperty('lastBackup', today);
  const files = [];
  const fit = sub.getFiles();
  while (fit.hasNext()) files.push(fit.next());
  files.sort(function (x, y) { return y.getDateCreated() - x.getDateCreated(); });
  files.slice(KEEP_BACKUPS).forEach(function (f) { f.setTrashed(true); });
}

function writeSheets_(folder, sheets) {
  const props = PropertiesService.getScriptProperties();
  let ss = null;
  const id = props.getProperty('sheetId');
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(SHEET_NAME);
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    props.setProperty('sheetId', ss.getId());
  }
  Object.keys(sheets).forEach(function (name) {
    const rows = sheets[name] || [];
    let sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.clearContents();
    sh.setRightToLeft(true);
    if (!rows.length) return;
    const width = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    const norm = rows.map(function (r) { const x = r.slice(); while (x.length < width) x.push(''); return x; });
    sh.getRange(1, 1, norm.length, width).setValues(norm);
    sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#DCEBE8');
    sh.setFrozenRows(1);
  });
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('ورقة1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
}

// ---------- الذكاء الاصطناعي ----------
function ai_(body) {
  const key = getSetting_('GEMINI_KEY', GEMINI_KEY);
  if (!key) return { ok: false, error: 'ما مضاف مفتاح Gemini بالسكربت. شوف دليل الإعداد.' };
  const model = getSetting_('GEMINI_MODEL', GEMINI_MODEL);
  const parts = [{ text: String(body.prompt || '') }];
  if (body.image && body.image.data) parts.push({ inline_data: { mime_type: body.image.mimeType || 'image/jpeg', data: body.image.data } });
  const payload = { contents: [{ role: 'user', parts: parts }] };
  if (body.system) payload.systemInstruction = { parts: [{ text: String(body.system) }] };
  if (body.json) payload.generationConfig = { responseMimeType: 'application/json' };
  const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  const out = JSON.parse(res.getContentText() || '{}');
  if (code !== 200) {
    const msg = out.error && out.error.message ? out.error.message : 'HTTP ' + code;
    return { ok: false, error: 'Gemini: ' + msg };
  }
  const cand = (out.candidates || [])[0];
  const text = cand && cand.content && cand.content.parts ? cand.content.parts.map(function (p) { return p.text || ''; }).join('') : '';
  if (!text) return { ok: false, error: 'ما وصل رد من Gemini، جرّب مرة ثانية.' };
  return { ok: true, text: text };
}

// ---------- أدوات ----------
function getSetting_(name, fallback) {
  const v = PropertiesService.getScriptProperties().getProperty(name);
  return v || fallback;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** شغّل هذه الدالة مرة وحدة من المحرر حتى توافق على الصلاحيات وتتأكد إن كل شي شغال. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN') && (!TOKEN || TOKEN.indexOf('اكتب') === 0)) {
    // إذا ما كتبت رمز، نسوي رمز عشوائي قوي ونحفظه بخصائص السكربت
    props.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, ''));
  }
  Logger.log('الرمز السري (انسخه لإعدادات التطبيق): ' + getSetting_('TOKEN', TOKEN));
  const folder = folder_();
  dataFile_(folder);
  Logger.log('المجلد جاهز: ' + folder.getUrl());
  if (GEMINI_KEY) {
    const r = ai_({ prompt: 'قل: جاهز' });
    Logger.log('Gemini: ' + (r.ok ? r.text : r.error));
  }
}
