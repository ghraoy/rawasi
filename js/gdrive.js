// المزامنة المباشرة مع Google Drive بزر "ربط بحساب Google".
// التطبيق ما يشوف غير الملفات اللي هو سوّاها (صلاحية drive.file)، يعني ما يقدر يوصل لباقي ملفاتك.
import * as store from './store.js';

export const CLIENT_ID = '909839835408-vv8kb339l4svcsvbd2b8ru7kgnhc5vjp.apps.googleusercontent.com';
// صلاحيتين فقط: ملفات التطبيق بالـ Drive، والمساعد الذكي (Gemini).
const SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/generative-language.retriever';
const PROJECT = 'rawasi-app';
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-flash-latest'];
const FOLDER = 'تطبيق رواسي';
const DATA = 'rawasi-data.json';
const SHEET = 'رواسي - الجداول';
const BACKUPS = 'نسخ احتياطية';
const KEEP_BACKUPS = 30;
const API = 'https://www.googleapis.com';

let token = null;
let tokenExp = 0;
let tokenClient = null;
let gisLoading = null;

try {
  const t = JSON.parse(sessionStorage.getItem('rawasi.gtoken') || 'null');
  if (t && t.exp > Date.now() + 60000) {
    token = t.token;
    tokenExp = t.exp;
  }
} catch {}

export function hasToken() {
  return !!token && tokenExp > Date.now() + 60000;
}

function loadGis() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisLoading = null;
      reject(new Error('تعذر الاتصال بـ Google. تأكد من الإنترنت.'));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

// تحميل مكتبة Google مسبقاً حتى تنفتح نافذة الدخول فوراً عند الضغط (المتصفح يمنع النوافذ إذا تأخرت).
export function preload() {
  loadGis().then(initClient).catch(() => {});
}

let pending = null;
function initClient() {
  if (tokenClient) return tokenClient;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (resp) => {
      const p = pending;
      pending = null;
      if (!p) return;
      if (resp.error) return p.reject(new Error(resp.error === 'access_denied' ? 'ما انعطت الموافقة.' : 'فشل الدخول: ' + resp.error));
      token = resp.access_token;
      tokenExp = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
      try {
        sessionStorage.setItem('rawasi.gtoken', JSON.stringify({ token, exp: tokenExp }));
      } catch {}
      p.resolve(token);
    },
    error_callback: (err) => {
      const p = pending;
      pending = null;
      if (p) p.reject(new Error(err?.type === 'popup_closed' ? 'انسدت نافذة الدخول قبل ما تكمل.' : err?.type === 'popup_failed_to_open' ? 'المتصفح منع نافذة الدخول. اسمح بالنوافذ المنبثقة وجرب مرة ثانية.' : 'فشل الدخول بحساب Google.'));
    },
  });
  return tokenClient;
}

// لازم تنطلب من ضغطة زر حتى ما يمنعها المتصفح.
export async function signIn({ hint } = {}) {
  if (hasToken()) return token;
  await loadGis();
  initClient();
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    tokenClient.requestAccessToken({ prompt: localStorage.getItem('rawasi.gconnected') ? '' : 'consent', login_hint: hint || undefined });
  });
}

export function signOut() {
  if (token && globalThis.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {});
  token = null;
  tokenExp = 0;
  sessionStorage.removeItem('rawasi.gtoken');
}

async function api(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  if (!hasToken()) throw new Error('انتهت جلسة Google. اضغط مزامنة مرة ثانية.');
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    method,
    body,
    headers: { Authorization: 'Bearer ' + token, ...headers },
  });
  if (res.status === 401) {
    token = null;
    tokenExp = 0;
    sessionStorage.removeItem('rawasi.gtoken');
    throw new Error('انتهت جلسة Google. اضغط مزامنة مرة ثانية.');
  }
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try {
      msg = (await res.json()).error?.message || msg;
    } catch {}
    throw new Error('Google Drive: ' + msg);
  }
  if (raw) return res;
  return res.status === 204 ? null : res.json();
}

const q = (s) => encodeURIComponent(s);
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function findOne(query) {
  const r = await api(`/drive/v3/files?q=${q(query + ' and trashed=false')}&fields=files(id,name,createdTime)&orderBy=createdTime&pageSize=10`);
  return r.files?.[0] || null;
}

async function ensureFolder(name, parent) {
  const query = `name='${esc(name)}' and mimeType='application/vnd.google-apps.folder'` + (parent ? ` and '${parent}' in parents` : '');
  const found = await findOne(query);
  if (found) return found.id;
  const r = await api('/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: parent ? [parent] : undefined }),
  });
  return r.id;
}

function multipart(meta, content) {
  const boundary = 'rawasi' + Math.random().toString(36).slice(2);
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
  return { body, type: `multipart/related; boundary=${boundary}` };
}

export async function accountEmail() {
  const r = await api('/drive/v3/about?fields=user(emailAddress)');
  return r.user?.emailAddress || '';
}

export async function sync(buildSheets) {
  const folderId = await ensureFolder(FOLDER);
  const file = await findOne(`name='${DATA}' and '${folderId}' in parents`);
  let remote = {};
  if (file) {
    const res = await api(`/drive/v3/files/${file.id}?alt=media`, { raw: true });
    const text = await res.text();
    if (text.trim()) remote = JSON.parse(text);
  }
  const merged = store.merge(store.getData(), remote);
  const content = JSON.stringify(merged);
  let fileId = file?.id;
  if (fileId) {
    const m = multipart({}, content);
    await api(`/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id`, { method: 'PATCH', headers: { 'Content-Type': m.type }, body: m.body });
  } else {
    const m = multipart({ name: DATA, parents: [folderId], mimeType: 'application/json' }, content);
    fileId = (await api('/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': m.type }, body: m.body })).id;
  }
  await Promise.allSettled([backup(folderId, fileId), buildSheets ? writeSheets(folderId, buildSheets(merged)) : null]);
  return merged;
}

async function backup(folderId, fileId) {
  const day = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem('rawasi.lastBackup') === day) return;
  const sub = await ensureFolder(BACKUPS, folderId);
  const name = `rawasi-${day}.json`;
  if (!(await findOne(`name='${name}' and '${sub}' in parents`))) {
    await api(`/drive/v3/files/${fileId}/copy?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, parents: [sub] }) });
  }
  localStorage.setItem('rawasi.lastBackup', day);
  const list = await api(`/drive/v3/files?q=${q(`'${sub}' in parents and trashed=false`)}&fields=files(id,createdTime)&orderBy=createdTime desc&pageSize=100`);
  for (const f of (list.files || []).slice(KEEP_BACKUPS)) {
    await api(`/drive/v3/files/${f.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
  }
}

async function writeSheets(folderId, sheets) {
  let ss = await findOne(`name='${esc(SHEET)}' and mimeType='application/vnd.google-apps.spreadsheet' and '${folderId}' in parents`);
  if (!ss) {
    ss = await api('/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: SHEET, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [folderId] }),
    });
  }
  const id = ss.id;
  const meta = await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties`);
  const existing = new Map((meta.sheets || []).map((s) => [s.properties.title, s.properties.sheetId]));
  const names = Object.keys(sheets);
  const requests = [];
  for (const n of names) if (!existing.has(n)) requests.push({ addSheet: { properties: { title: n, rightToLeft: true, gridProperties: { frozenRowCount: 1 } } } });
  if (requests.length) {
    await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }) });
    // نحذف الورقة الافتراضية الفارغة إن وجدت
    const after = await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties`);
    const extra = (after.sheets || []).filter((s) => !names.includes(s.properties.title));
    if (extra.length && after.sheets.length > extra.length) {
      await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests: extra.map((s) => ({ deleteSheet: { sheetId: s.properties.sheetId } })) }) });
    }
  }
  await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchClear`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ranges: names.map((n) => `'${n}'`) }) });
  await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'RAW', data: names.map((n) => ({ range: `'${n}'!A1`, values: sheets[n] })) }),
  });
}

// المساعد الذكي عن طريق حساب Google نفسه (بدون مفتاح وبدون سكربت).
export async function gemini({ system, prompt, image, json = false }) {
  if (!hasToken()) await signIn({ hint: (localStorage.getItem('rawasi.gconnected') || '').includes('@') ? localStorage.getItem('rawasi.gconnected') : undefined });
  const parts = [{ text: String(prompt || '') }];
  if (image?.data) parts.push({ inline_data: { mime_type: image.mimeType || 'image/jpeg', data: image.data } });
  const payload = { contents: [{ role: 'user', parts }] };
  if (system) payload.systemInstruction = { parts: [{ text: String(system) }] };
  if (json) payload.generationConfig = { responseMimeType: 'application/json' };
  let lastErr;
  for (const model of MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'x-goog-user-project': PROJECT, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const out = await res.json().catch(() => ({}));
    if (res.ok) {
      const text = (out.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      if (text) return text;
      lastErr = new Error('ما وصل رد من Gemini، جرّب مرة ثانية.');
      continue;
    }
    if (res.status === 401) {
      token = null;
      tokenExp = 0;
      sessionStorage.removeItem('rawasi.gtoken');
      throw new Error('انتهت جلسة Google. اضغط مرة ثانية.');
    }
    lastErr = new Error('Gemini: ' + (out.error?.message || 'HTTP ' + res.status));
    if (res.status !== 404 && res.status !== 400) break; // جرب النموذج التالي فقط إذا النموذج غير متوفر
  }
  throw lastErr;
}
