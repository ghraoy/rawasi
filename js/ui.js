// أدوات صغيرة للواجهة: الحماية من النصوص، الأيقونات، الشارات، التنبيهات.
import { STATUSES, fmtIQD, fmtNum, stockLevel } from './logic.js';

export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  clip: 'M7 4h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 3h6v3H9zM9 12h6M9 16h4',
  layers: 'm12 3 9 5-9 5-9-5zM3 13l9 5 9-5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  cloud: 'M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z',
  cloudOk: 'M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8zM9.5 13l2 2 3.5-3.5',
  cloudOff: 'M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8zM4 4l16 16',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
  back: 'm9 6 6 6-6 6',
  chev: 'm15 6-6 6 6 6',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  chat: 'M4 5h16v11H8l-4 4z',
  truck: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  inbox: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  users: 'M16 20v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 20v-1a3 3 0 0 0-2-2.8M17 5.3a3 3 0 0 1 0 5.4',
  wallet: 'M4 6h16v12H4zM4 10h16M8 15h3',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12h2M3 12h2M12 3v2M12 19v2M17 7l1.4-1.4M5.6 18.4 7 17M17 17l1.4 1.4M5.6 5.6 7 7',
  sheet: 'M5 3h10l4 4v14H5zM15 3v4h4M8 12h8M8 16h8M12 10v8',
  copy: 'M8 8h12v12H8zM16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  check: 'm5 12 4.5 4.5L19 7',
  x: 'M6 6l12 12M18 6 6 18',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7',
  image: 'M3 5h18v14H3zM9 11.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2M21 16l-5-5-8 8',
  barcode: 'M4 5v14M8 5v14M11 5v14M15 5v14M18 5v14M21 5v14',
  send: 'M20 12H5M11 6l-6 6 6 6',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  upload: 'M12 20V8M7 13l5-5 5 5M5 4h14',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z',
};

export function icon(name, size = 22, extra = '') {
  const d = PATHS[name] || PATHS.box;
  return `<svg class="ic" ${extra} aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

export function statusChip(status) {
  const s = STATUSES[status] || STATUSES.reserved;
  return `<span class="chip" style="background:${s.bg};color:${s.fg}">${s.label}</span>`;
}

export function stockPill(it, minStock) {
  const lvl = stockLevel(it, minStock);
  const a = it ? it.available : 0;
  if (lvl === 'out') return `<span class="chip chip-out">${a < 0 ? 'ناقص ' + fmtNum(-a) : 'نفد'}</span>`;
  if (lvl === 'low') return `<span class="chip chip-low">باقي ${fmtNum(a)}</span>`;
  return `<span class="chip chip-ok">متوفر ${fmtNum(a)}</span>`;
}

const TINTS = ['#DCEBE8', '#EDE5D6', '#F0E3E2', '#E6E0EE', '#E0E9F5', '#E1EFE2'];
export function tintFor(text) {
  let h = 0;
  for (const ch of String(text || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function thumb(p, size = 44, radius = 10) {
  const style = `width:${size}px;height:${size}px;border-radius:${radius}px`;
  if (p?.photo) return `<img class="thumb" src="${esc(p.photo)}" alt="" style="${style}" loading="lazy">`;
  return `<div class="thumb thumb-empty" style="${style};background:${tintFor(p?.category)}">${icon('image', Math.round(size * 0.42))}</div>`;
}

export function money(n) {
  return esc(fmtIQD(n));
}

export function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `قبل ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return h === 1 ? 'قبل ساعة' : h === 2 ? 'قبل ساعتين' : `قبل ${h} ساعات`;
  }
  const d = Math.floor(diff / 86400);
  if (d === 1) return 'أمس';
  if (d < 30) return `قبل ${d} يوم`;
  return fmtDate(iso);
}

const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function fmtDate(iso, withDay = false) {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso);
  const s = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return withDay ? `${DAYS[d.getDay()]}، ${s}` : s;
}
export function monthName(i) {
  return MONTHS[i];
}

export function today() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

let toastTimer;
export function toast(msg, kind = '') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.className = 'toast show ' + kind;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 2600);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('تم النسخ ✓');
}

// تصغير الصورة قبل الحفظ حتى تبقى البيانات خفيفة بالمزامنة.
export function resizeImage(file, max = 560, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function waLink(phone, text = '') {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('0')) p = '964' + p.slice(1);
  if (!p) return '';
  return `https://wa.me/${p}${text ? '?text=' + encodeURIComponent(text) : ''}`;
}

export function telLink(phone) {
  const p = String(phone || '').replace(/[^\d+]/g, '');
  return p ? `tel:${p}` : '';
}

export function options(list, selected, { empty } = {}) {
  const items = list.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (empty != null ? `<option value="">${esc(empty)}</option>` : '') +
    items.map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(selected ?? '') ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
}

export function emptyState(text, actionHtml = '') {
  return `<div class="empty">${icon('box', 34)}<p>${esc(text)}</p>${actionHtml}</div>`;
}
