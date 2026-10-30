// تشغيل التطبيق: الهيكل العام، التنقل، الأحداث، القفل.
import * as store from './store.js';
import { state, actions, inputs, submits, views, parseHash, setRenderer, rerender } from './core.js';
import { icon, esc, toast } from './ui.js';
import * as sync from './sync.js';
import './views-stock.js';
import './views-sales.js';
import './views-web.js';
import * as web from './web.js';
import { hashPin } from './views-more.js';

const NAV = [
  { name: 'home', label: 'الرئيسية', icon: 'home', match: ['home'] },
  { name: 'products', label: 'المنتجات', icon: 'box', match: ['products', 'product', 'lots', 'lot', 'import'] },
  { name: 'bookings', label: 'الحجوزات', icon: 'clip', match: ['bookings', 'booking'] },
  { name: 'batches', label: 'الدفعات', icon: 'layers', match: ['batches', 'batch'] },
  { name: 'more', label: 'المزيد', icon: 'menu', match: ['more', 'ai', 'customers', 'expenses', 'reports', 'settings', 'web'] },
];
const DESKTOP_EXTRA = [
  { name: 'ai', label: 'المساعد الذكي', icon: 'spark' },
  { name: 'web', label: 'الموقع الإلكتروني', icon: 'globe' },
  { name: 'reports', label: 'التقارير', icon: 'chart' },
  { name: 'customers', label: 'الزبائن', icon: 'users' },
  { name: 'expenses', label: 'المصاريف', icon: 'wallet' },
  { name: 'settings', label: 'الإعدادات', icon: 'gear' },
];

function navHtml() {
  const r = state.route.name;
  const pending = store.all('bookings').filter((b) => b.status === 'reserved').length;
  const item = (n, extraCls = '') => {
    const on = (n.match || [n.name]).includes(r);
    return `<a href="#/${n.name}" class="nav-item ${extraCls}${on ? ' on' : ''}"${on ? ' aria-current="page"' : ''}>${icon(n.icon, 24)}<span>${n.label}</span>${n.name === 'bookings' && pending ? `<i class="nav-badge">${pending}</i>` : ''}</a>`;
  };
  return `<div class="nav-brand"><div class="brand-mark">ر</div><span>${esc(store.getData().settings.storeName || 'متجر رواسي')}</span></div>
    ${NAV.map((n) => item(n)).join('')}
    <div class="nav-sep"></div>
    ${DESKTOP_EXTRA.map((n) => item(n, 'desk-only')).join('')}`;
}

let lastRouteKey = '';
function render() {
  const route = state.route;
  const view = views[route.name] || views.home;
  let html;
  try {
    html = view(route.id);
  } catch (e) {
    console.error(e);
    html = `<div class="empty"><p>صار خطأ بهذه الشاشة.</p><pre class="small">${esc(e.message)}</pre><a class="btn" href="#/home">الرئيسية</a></div>`;
  }
  const key = route.name + '/' + (route.id || '');
  const main = document.getElementById('view');
  const keepScroll = key === lastRouteKey ? window.scrollY : 0;
  main.innerHTML = html;
  document.getElementById('nav').innerHTML = navHtml();
  document.title = (document.querySelector('#view h1')?.textContent || 'رواسي') + ' — رواسي';
  window.scrollTo(0, keepScroll);
  lastRouteKey = key;
}

function onHash() {
  state.route = parseHash(location.hash);
  render();
}

function bindEvents() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.act];
    if (!fn) return;
    if (el.tagName === 'BUTTON') e.preventDefault();
    Promise.resolve(fn(el, e)).catch((err) => toast(err.message || 'صار خطأ', 'err'));
  });
  const onInput = (e) => {
    const el = e.target.closest('[data-in]');
    if (!el) return;
    // القوائم المنسدلة والملفات تشتغل عند التغيير فقط، والنصوص عند الكتابة
    const isChange = el.tagName === 'SELECT' || el.type === 'file' || el.type === 'checkbox' || el.type === 'date' || el.type === 'month';
    if ((e.type === 'change') !== isChange) return;
    const fn = inputs[el.dataset.in];
    if (fn) Promise.resolve(fn(el, e)).catch((err) => toast(err.message || 'صار خطأ', 'err'));
  };
  document.addEventListener('input', onInput);
  document.addEventListener('change', onInput);
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-submit]');
    if (!form) return;
    e.preventDefault();
    const fn = submits[form.dataset.submit];
    if (fn) Promise.resolve(fn(form, e)).catch((err) => toast(err.message || 'صار خطأ', 'err'));
  });
}

async function lockScreen() {
  const saved = localStorage.getItem('rawasi.pin');
  if (!saved) return;
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'lock';
    el.innerHTML = `<form class="lock-box"><div class="brand-mark big">ر</div><h1>متجر رواسي</h1><label for="pinIn" class="muted">اكتب الرمز</label><input id="pinIn" type="password" inputmode="numeric" autocomplete="current-password" autofocus><button class="btn" type="submit">فتح</button><p class="neg small" hidden>الرمز غلط</p></form>`;
    document.body.appendChild(el);
    const form = el.querySelector('form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if ((await hashPin(form.pinIn.value)) === saved) {
        el.remove();
        resolve();
      } else {
        form.querySelector('p').hidden = false;
        form.pinIn.value = '';
      }
    });
  });
}

async function start() {
  await store.load();
  await lockScreen();
  setRenderer(render);
  bindEvents();
  window.addEventListener('hashchange', onHash);
  store.subscribe(() => {
    // نحدّث القائمة (عدد الحجوزات) بدون إعادة رسم الشاشة كلها
    const nav = document.getElementById('nav');
    if (nav) nav.innerHTML = navHtml();
  });
  let lastSyncState = '';
  sync.onStatus((s) => {
    // بعد انتهاء المزامنة نعيد الرسم حتى تظهر البيانات الجديدة، إلا إذا المستخدم بنص نموذج
    const typing = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    const formRoute = ['booking', 'lot', 'batch', 'product'].includes(state.route.name);
    if (s.state !== lastSyncState && !typing && !(formRoute && s.state === 'ok')) rerender();
    lastSyncState = s.state;
  });
  onHash();
  sync.startAuto();
  web.startAuto(store);
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

start();
