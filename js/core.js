// نواة الواجهة: حالة التطبيق، سجل الأوامر، والتنقل بين الشاشات.
import * as store from './store.js';
import { computeInventory } from './logic.js';

export const state = {
  route: { name: 'home', id: null, params: {} },
  ui: {},      // فلاتر وبحث لكل شاشة
  drafts: {},  // نماذج قيد التعديل (حجز، وجبة…)
  chat: [],    // محادثة المساعد الذكي
};

export const actions = {};
export const inputs = {};
export const submits = {};
export const views = {};

export function register({ act = {}, input = {}, submit = {}, view = {} } = {}) {
  Object.assign(actions, act);
  Object.assign(inputs, input);
  Object.assign(submits, submit);
  Object.assign(views, view);
}

let version = 0;
store.subscribe(() => {
  version++;
});

let invCache = null;
let invVersion = -1;
export function inv() {
  if (invVersion !== version || !invCache) {
    invCache = computeInventory(store.getData());
    invVersion = version;
  }
  return invCache;
}
export function bumpVersion() {
  version++;
}

export function data() {
  return store.getData();
}
export function settings() {
  return store.getData().settings;
}

export function parseHash(hash) {
  const h = (hash || '').replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { name: parts[0] || 'home', id: parts[1] ? decodeURIComponent(parts[1]) : null, params };
}

export function nav(hash) {
  if (location.hash === hash) rerender();
  else location.hash = hash;
}

export function back(fallback = '#/home') {
  if (history.length > 1) history.back();
  else nav(fallback);
}

let renderFn = null;
export function setRenderer(fn) {
  renderFn = fn;
}
export function rerender() {
  if (renderFn) renderFn();
}

export function ui(key, def) {
  if (!(key in state.ui)) state.ui[key] = def;
  return state.ui[key];
}
export function setUi(key, value, { render = true } = {}) {
  state.ui[key] = value;
  if (render) rerender();
}

export function formData(form) {
  const fd = new FormData(form);
  const o = {};
  for (const [k, v] of fd.entries()) o[k] = typeof v === 'string' ? v.trim() : v;
  return o;
}
