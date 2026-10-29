// شاشات إضافية: المساعد الذكي، المزيد، المصاريف، التقارير، الإعدادات.
import * as store from './store.js';
import { register, state, inv, data, settings, nav, rerender, ui, setUi, formData } from './core.js';
import { esc, icon, thumb, money, fmtDate, today, toast, options, emptyState, copyText, monthName } from './ui.js';
import { live, fmtNum, fmtIQD, report, aiSummary } from './logic.js';
import * as sync from './sync.js';
import * as ai from './ai.js';
import { downloadWorkbook } from './excel.js';
import { bookingDraft } from './views-sales.js';

const n = (v) => Number(v) || 0;
const REPO_GUIDE = 'https://github.com/ghraoy/rawasi#readme';

// ---------- المساعد الذكي ----------
const PRESETS = ['شنو أطلب للدفعة الجاية؟', 'شنو المنتجات الراكدة؟', 'لخّص أرباح الشهر', 'أي تصنيف يربح أكثر؟'];

function aiView() {
  if (state.route.params.mode) {
    state.ui.aiMode = state.route.params.mode;
  }
  const mode = ui('aiMode', 'parse');
  const ready = sync.aiReady();
  const busy = state.ui.aiBusy;
  const products = store.all('products').sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  const capPid = state.drafts.capProduct || state.route.params.product || products[0]?.id || '';
  state.drafts.capProduct = capPid;
  const capP = store.get('products', capPid);

  return `
  <header class="page-head">
    <div class="row gap"><a class="icon-btn" href="#/home" aria-label="رجوع">${icon('back')}</a>
    <div class="ai-logo">${icon('spark', 20)}</div>
    <div class="col"><h1>مساعد رواسي</h1><small class="muted">يعرف مخزنك وحجوزاتك</small></div></div>
  </header>
  ${ready ? '' : `<p class="note note-warn">${icon('lock', 18)} <span>المساعد يحتاج سكربت Google مع مفتاح Gemini (غير المزامنة). <a href="#/settings">افتح الإعدادات ← المساعد الذكي</a> واتبع <a href="${REPO_GUIDE}" target="_blank" rel="noopener">دليل الإعداد</a>.</span></p>`}
  <div class="tabs" role="tablist">
    ${[['parse', 'حجز من رسالة'], ['caption', 'كابشن لمنتج'], ['ask', 'اسأل عن متجرك']].map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === mode}" class="tab${k === mode ? ' on' : ''}" data-act="aiMode" data-v="${k}">${l}</button>`).join('')}
  </div>

  ${mode === 'parse' ? `
  <section class="card col gap">
    <p class="muted small">انسخ رسالة الزبون من الخاص والصقها هنا. المساعد يطلع الاسم والعنوان والقطع ويفتحلك حجز جاهز تراجعه قبل الحفظ.</p>
    <label class="field"><span class="sr">رسالة الزبون</span><textarea id="aiMsg" rows="6" placeholder="مثلاً: السلام عليكم اريد صحنين الفيروزي ومسبحة، زينب، النجف حي الأنصار قرب الجامع، 0780…">${esc(state.drafts.aiMsg || '')}</textarea></label>
    <div class="row gap">
      <button class="btn grow" data-act="aiPaste" type="button">${icon('copy', 18)}<span>لصق</span></button>
      <button class="btn grow" data-act="aiParse" type="button" ${busy || !ready ? 'disabled' : ''}>${busy ? '<span class="spin"></span><span>جاري القراءة…</span>' : icon('spark', 18) + '<span>استخراج الحجز</span>'}</button>
    </div>
  </section>` : ''}

  ${mode === 'caption' ? `
  <section class="card col gap">
    <div class="row gap">${thumb(capP, 56, 12)}
      <label class="field grow"><span>المنتج</span><select data-in="capProduct">${products.map((p) => `<option value="${esc(p.id)}"${p.id === capPid ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    </div>
    <label class="field"><span>ملاحظات إضافية (اختياري)</span><input id="capExtra" placeholder="مثلاً: كمية محدودة، مناسب هدية للعرس…" value="${esc(state.drafts.capExtra || '')}"></label>
    ${capP?.photo ? `<label class="check"><input type="checkbox" id="capPhoto" checked> <span>خلي المساعد يشوف صورة المنتج</span></label>` : '<p class="muted small">أضف صورة للمنتج حتى يوصفها المساعد بدقة أكثر.</p>'}
    <button class="btn" data-act="aiCaption" type="button" ${busy || !ready || !capP ? 'disabled' : ''}>${busy ? '<span class="spin"></span><span>جاري الكتابة…</span>' : icon('spark', 18) + '<span>اكتب الكابشن</span>'}</button>
  </section>
  ${state.drafts.capResult ? `<section class="card col gap"><div class="ai-out">${esc(state.drafts.capResult)}</div>
    <div class="row gap"><button class="btn grow" data-act="copyCap" type="button">${icon('copy', 18)}<span>نسخ</span></button><button class="btn btn-ghost" data-act="aiCaption" type="button" ${busy ? 'disabled' : ''}>${icon('refresh', 18)}<span>غيره</span></button></div></section>` : ''}` : ''}

  ${mode === 'ask' ? `
  <div class="chips">${PRESETS.map((p) => `<button type="button" class="pill" data-act="aiPreset" data-v="${esc(p)}" ${busy || !ready ? 'disabled' : ''}>${esc(p)}</button>`).join('')}</div>
  <div class="chat" id="chat">
    ${state.chat.length ? state.chat.map((m) => `<div class="msg ${m.role}">${esc(m.text)}</div>`).join('') : '<p class="muted center small">اسأل أي شي عن مبيعاتك ومخزنك. المساعد يشوف الأرقام الحالية.</p>'}
    ${busy ? '<div class="msg assistant"><span class="spin"></span></div>' : ''}
  </div>
  <form class="chat-input" data-submit="aiAsk">
    <label for="askQ" class="sr">سؤالك</label>
    <input id="askQ" name="q" placeholder="اسأل عن متجرك…" autocomplete="off" ${!ready ? 'disabled' : ''}>
    <button class="btn" type="submit" aria-label="إرسال" ${busy || !ready ? 'disabled' : ''}>${icon('send', 20)}</button>
  </form>` : ''}`;
}

async function runAi(fn) {
  state.ui.aiBusy = true;
  rerender();
  try {
    await fn();
  } catch (e) {
    toast(e.message || 'صار خطأ', 'err');
  } finally {
    state.ui.aiBusy = false;
    rerender();
  }
}

async function askQuestion(q) {
  state.chat.push({ role: 'user', text: q });
  await runAi(async () => {
    const summary = aiSummary(data(), inv(), new Date().toISOString());
    const answer = await ai.askStore(q, summary, state.chat.slice(0, -1));
    state.chat.push({ role: 'assistant', text: answer });
  });
  const c = document.getElementById('chat');
  if (c) c.lastElementChild?.scrollIntoView({ block: 'end' });
}

// ---------- المزيد ----------
function moreView() {
  const tiles = [
    ['#/customers', 'users', 'الزبائن', 'كل زبون ومشترياته', '#DCEBE8'],
    ['#/expenses', 'wallet', 'المصاريف', 'تغليف، إعلانات، توصيل', '#F8EBD3'],
    ['#/reports', 'chart', 'التقارير', 'الأرباح والأكثر مبيعاً', '#E0E9F5'],
    ['#/lots', 'truck', 'وجبات التجهيز', 'المشتريات بالتومان', '#EDE5D6'],
    ['#/import', 'sheet', 'رفع إكسل', 'منتجات وأسعار من ملف', '#E1EFE2'],
    ['#/batches', 'layers', 'الدفعات', 'نزلات الإنستقرام', '#E6E0EE'],
    ['#/settings', 'gear', 'الإعدادات', 'المزامنة، النسخ، القفل', '#EFEBE3'],
  ];
  return `
  <header class="page-head"><h1>المزيد</h1></header>
  <a class="hero" href="#/ai">
    <div class="row gap"><div class="hero-ic">${icon('spark', 26)}</div><div class="col"><b class="hero-title">المساعد الذكي</b><small>حجز من رسالة، كابشن من صورة، نصائح للدفعة</small></div></div>
    ${icon('chev', 18)}
  </a>
  <div class="tiles">
    ${tiles.map(([href, ic, t, s, tint]) => `<a class="tile" href="${href}"><div class="tile-ic" style="background:${tint}">${icon(ic, 18)}</div><b>${t}</b><small>${s}</small></a>`).join('')}
  </div>`;
}

// ---------- المصاريف ----------
function expensesView() {
  const month = ui('expMonth', today().slice(0, 7));
  const list = store.all('expenses').filter((e) => (e.date || '').startsWith(month)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = list.reduce((s, e) => s + n(e.amount), 0);
  return `
  <header class="page-head"><div class="row gap"><a class="icon-btn" href="#/more" aria-label="رجوع">${icon('back')}</a><h1>المصاريف</h1></div>
  <label class="field w-150"><span class="sr">الشهر</span><input type="month" value="${esc(month)}" data-in="expMonth"></label></header>
  <form class="card form" data-submit="addExpense">
    <div class="grid2">
      <label class="field"><span>المبلغ (دينار)</span><input name="amount" inputmode="numeric" required placeholder="0"></label>
      <label class="field"><span>النوع</span><select name="category">${options(settings().expenseCategories || [])}</select></label>
      <label class="field"><span>التاريخ</span><input type="date" name="date" value="${today()}"></label>
      <label class="field"><span>ملاحظة</span><input name="note" placeholder="اختياري"></label>
    </div>
    <button class="btn" type="submit">${icon('plus', 18)}<span>إضافة مصروف</span></button>
  </form>
  <section class="card">
    <div class="row between"><h2>مصاريف الشهر</h2><b>${money(total)}</b></div>
    ${list.length ? `<ul class="list">${list.map((e) => `<li class="row between"><span class="col"><b>${esc(e.category)}</b><small class="muted">${esc(fmtDate(e.date))}${e.note ? ' · ' + esc(e.note) : ''}</small></span><span class="row gap"><b>${money(e.amount)}</b><button class="icon-btn sm" data-act="delExpense" data-id="${esc(e.id)}" aria-label="حذف">${icon('x', 16)}</button></span></li>`).join('')}</ul>` : '<p class="muted">ما كو مصاريف بهذا الشهر.</p>'}
  </section>`;
}

// ---------- التقارير ----------
function periodRange(key) {
  const t = today();
  const d = new Date(t + 'T12:00:00');
  const iso = (x) => x.toISOString().slice(0, 10);
  if (key === 'month') return [t.slice(0, 8) + '01', t];
  if (key === 'lastMonth') {
    const s = new Date(d.getFullYear(), d.getMonth() - 1, 1, 12);
    const e = new Date(d.getFullYear(), d.getMonth(), 0, 12);
    return [iso(s), iso(e)];
  }
  if (key === '30') return [iso(new Date(d.getTime() - 29 * 864e5)), t];
  if (key === 'year') return [t.slice(0, 4) + '-01-01', t];
  if (key === 'all') return ['', ''];
  return [ui('repFrom', t.slice(0, 8) + '01'), ui('repTo', t)];
}

function barChart(byDay, from, to) {
  const days = Object.keys(byDay).filter(Boolean).sort();
  if (!days.length) return '<p class="muted small">ما كو مبيعات بهذه الفترة.</p>';
  const start = from || days[0];
  const end = to || days[days.length - 1];
  const all = [];
  for (let x = new Date(start + 'T12:00:00'); x <= new Date(end + 'T12:00:00') && all.length < 400; x = new Date(x.getTime() + 864e5)) all.push(x.toISOString().slice(0, 10));
  let series = all.map((k) => ({ k, v: byDay[k]?.revenue || 0 }));
  if (series.length > 62) {
    const by = {};
    for (const s of series) by[s.k.slice(0, 7)] = (by[s.k.slice(0, 7)] || 0) + s.v;
    series = Object.entries(by).map(([k, v]) => ({ k, v, month: true }));
  }
  const max = Math.max(...series.map((s) => s.v), 1);
  const W = 640, H = 160, gap = 2;
  const bw = Math.max((W - gap * series.length) / series.length, 2);
  return `<svg class="chart" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="المبيعات حسب ${series[0]?.month ? 'الشهر' : 'اليوم'}" preserveAspectRatio="none">
    ${series.map((s, i) => {
      const h = Math.max((s.v / max) * H, s.v ? 2 : 0);
      const x = W - (i + 1) * (bw + gap);
      return `<rect x="${x.toFixed(1)}" y="${(H - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="var(--teal)"><title>${s.month ? monthName(+s.k.slice(5, 7) - 1) : fmtDate(s.k)}: ${fmtNum(s.v)} د.ع</title></rect>`;
    }).join('')}
    <text x="${W}" y="${H + 14}" font-size="11" fill="var(--muted)" text-anchor="start">${esc(series[0].month ? monthName(+series[0].k.slice(5, 7) - 1) : fmtDate(series[0].k))}</text>
    <text x="0" y="${H + 14}" font-size="11" fill="var(--muted)" text-anchor="end" direction="rtl">${esc(series.at(-1).month ? monthName(+series.at(-1).k.slice(5, 7) - 1) : fmtDate(series.at(-1).k))}</text>
  </svg>`;
}

function reportsView() {
  const key = ui('repPeriod', 'month');
  const [from, to] = periodRange(key);
  const r = report(data(), inv(), from, to);
  const margin = r.revenue > 0 ? Math.round((r.grossProfit / r.revenue) * 100) : 0;
  return `
  <header class="page-head"><div class="row gap"><a class="icon-btn" href="#/more" aria-label="رجوع">${icon('back')}</a><h1>التقارير</h1></div>
    <button class="btn btn-ghost btn-sm" data-act="exportAll">${icon('download', 18)}<span>إكسل</span></button></header>
  <div class="row gap wrap">
    <div class="chips">${[['month', 'هذا الشهر'], ['lastMonth', 'الشهر الماضي'], ['30', 'آخر 30 يوم'], ['year', 'هذه السنة'], ['all', 'الكل'], ['custom', 'مخصص']].map(([k, l]) => `<button type="button" class="pill${k === key ? ' on' : ''}" data-act="repPeriod" data-v="${k}">${l}</button>`).join('')}</div>
    ${key === 'custom' ? `<div class="row gap"><label class="field"><span class="sr">من</span><input type="date" value="${esc(from)}" data-in="repFrom"></label><label class="field"><span class="sr">إلى</span><input type="date" value="${esc(to)}" data-in="repTo"></label></div>` : ''}
  </div>
  <section class="kpis">
    <div class="kpi"><span>المبيعات (بعد الخصم)</span><b>${fmtNum(r.revenue)} <small>د.ع</small></b></div>
    <div class="kpi"><span>كلفة القطع المباعة</span><b>${fmtNum(r.cost)} <small>د.ع</small></b></div>
    <div class="kpi"><span>الربح الإجمالي</span><b>${fmtNum(r.grossProfit)} <small>${margin}%</small></b></div>
    <div class="kpi"><span>المصاريف</span><b>${fmtNum(r.expenses)} <small>د.ع</small></b></div>
    <div class="kpi kpi-strong"><span>الربح الصافي</span><b>${fmtNum(r.netProfit)} <small>د.ع</small></b></div>
    <div class="kpi"><span>الخصومات المعطاة</span><b>${fmtNum(r.discounts)} <small>د.ع</small></b></div>
    <div class="kpi"><span>الطلبات / القطع</span><b>${fmtNum(r.orders)} <small>/ ${fmtNum(r.pieces)}</small></b></div>
    <div class="kpi"><span>المشتريات (وجبات)</span><b>${fmtNum(r.purchases)} <small>د.ع</small></b></div>
  </section>
  <p class="muted small">الأرقام تعتمد على الحجوزات المُرسلة والمُستلمة فقط. أجور التوصيل ما تنحسب من الربح.</p>
  <section class="card"><h2>المبيعات</h2>${barChart(r.byDay, from, to)}</section>
  <div class="two-col">
    <section class="card"><h2>الأكثر مبيعاً</h2>
      ${r.top.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>المنتج</th><th>القطع</th><th>المبيعات</th><th>الربح</th></tr></thead><tbody>${r.top.slice(0, 15).map((t) => `<tr><td>${esc(t.name)}</td><td>${fmtNum(t.qty)}</td><td>${fmtNum(t.revenue)}</td><td class="${t.profit < 0 ? 'neg' : ''}">${fmtNum(t.profit)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">لا شي بعد.</p>'}
    </section>
    <section class="card"><h2>المصاريف حسب النوع</h2>
      ${Object.keys(r.expensesByCat).length ? `<ul class="list">${Object.entries(r.expensesByCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<li class="row between"><span>${esc(k)}</span><b>${money(v)}</b></li>`).join('')}</ul>` : '<p class="muted">ما كو مصاريف.</p>'}
    </section>
  </div>`;
}

// ---------- الإعدادات ----------
function settingsView() {
  const s = settings();
  const c = sync.getConfig();
  const st = sync.getStatus();
  const hasPin = !!localStorage.getItem('rawasi.pin');
  return `
  <header class="page-head"><div class="row gap"><a class="icon-btn" href="#/more" aria-label="رجوع">${icon('back')}</a><h1>الإعدادات</h1></div></header>

  <section class="card form">
    <h2>${icon('cloud', 20)} المزامنة مع Google Drive</h2>
    ${sync.isGoogle() ? `
      <div class="row gap"><div class="avatar">${icon('cloudOk', 20)}</div><div class="col grow"><b>متصل</b><small class="muted" dir="ltr" style="text-align:right">${esc(sync.googleEmail())}</small></div></div>
      <div class="row gap wrap">
        <button class="btn grow" type="button" data-act="syncNow">${icon('refresh', 18)}<span>مزامنة الآن</span></button>
        <button class="btn btn-ghost" type="button" data-act="disconnectGoogle">فصل</button>
      </div>
      <label class="check"><input type="checkbox" data-in="syncAuto" ${c.auto ? 'checked' : ''}> <span>مزامنة تلقائية بعد كل تعديل</span></label>
      <p class="small ${st.state === 'error' ? 'neg' : 'muted'}">${st.state === 'error' ? esc(st.message) : c.lastSync ? 'آخر مزامنة: ' + esc(new Date(c.lastSync).toLocaleString('ar-IQ')) : 'لم تتم أي مزامنة بعد'}</p>
      <p class="muted small">البيانات بمجلد "تطبيق رواسي" بالـ Drive مالتك، وبيه جدول Google Sheet ونسخ احتياطية يومية.</p>`
    : `
      <p class="muted small">اضغط الزر واختر حسابك، وخلص. سوّها بنفس الطريقة على كل جهاز (موبايل وحاسبة) حتى تتوحد البيانات.</p>
      <button class="btn btn-google" type="button" data-act="connectGoogle"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg><span>ربط بحساب Google</span></button>
      ${st.state === 'error' || st.state === 'needsAuth' ? `<p class="small neg">${esc(st.message)}</p>` : ''}`}
  </section>

  <form class="card form" data-submit="saveSettings">
    <h2>${icon('gear', 20)} المتجر</h2>
    <div class="grid2">
      <label class="field"><span>اسم المتجر</span><input name="storeName" value="${esc(s.storeName)}"></label>
      <label class="field"><span>أجور التوصيل الافتراضية</span><input name="deliveryFee" inputmode="numeric" value="${esc(s.deliveryFee)}"></label>
      <label class="field"><span>آخر سعر صرف (تومان/1000 د.ع)</span><input name="tomanPer1000" inputmode="numeric" value="${esc(s.tomanPer1000 || '')}"></label>
      <label class="field"><span>تنبيه المخزن الافتراضي</span><input name="defaultMinStock" inputmode="numeric" value="${esc(s.defaultMinStock)}"></label>
    </div>
    <label class="field"><span>التصنيفات (افصل بفاصلة)</span><input name="categories" value="${esc((s.categories || []).join('، '))}"></label>
    <label class="field"><span>أنواع المصاريف (افصل بفاصلة)</span><input name="expenseCategories" value="${esc((s.expenseCategories || []).join('، '))}"></label>
    <button class="btn" type="submit">${icon('check', 18)}<span>حفظ</span></button>
  </form>

  <section class="card form">
    <h2>${icon('download', 20)} نسخة احتياطية يدوية</h2>
    <p class="muted small">غير المزامنة، تقدر تنزل ملف بكل بياناتك وتحتفظ بيه.</p>
    <div class="row gap wrap">
      <button class="btn btn-ghost" data-act="backupDownload">${icon('download', 18)}<span>تنزيل نسخة</span></button>
      <label class="btn btn-ghost" for="restoreFile">${icon('upload', 18)}<span>استرجاع من ملف</span></label>
      <input id="restoreFile" class="sr" type="file" accept=".json,application/json" data-in="restoreFile">
      <button class="btn btn-ghost" data-act="exportAll">${icon('sheet', 18)}<span>تصدير إكسل</span></button>
    </div>
  </section>

  <details class="card form">
    <summary><b>${icon('spark', 18)} المساعد الذكي (اختياري)</b></summary>
    <p class="muted small">يحتاج سكربت Google مع مفتاح Gemini. الخطوات بـ <a href="${REPO_GUIDE}" target="_blank" rel="noopener">دليل الإعداد</a>.</p>
    <form class="col gap" data-submit="saveSync">
      <label class="field"><span>رابط السكربت</span><input name="url" dir="ltr" value="${esc(c.url)}" placeholder="https://script.google.com/macros/s/…/exec"></label>
      <label class="field"><span>الرمز السري</span><input name="token" dir="ltr" type="password" value="${esc(c.token)}" autocomplete="off"></label>
      <button class="btn btn-ghost" type="submit">${icon('check', 18)}<span>حفظ واختبار</span></button>
    </form>
  </details>

  <section class="card form">
    <h2>${icon('lock', 20)} قفل التطبيق</h2>
    <p class="muted small">${hasPin ? 'القفل مفعّل على هذا الجهاز.' : 'ضع رمز من 4 أرقام أو أكثر حتى ما أحد يفتح التطبيق غيرك.'}</p>
    <form class="row gap wrap end" data-submit="setPin">
      <label class="field"><span>رمز جديد</span><input name="pin" type="password" inputmode="numeric" minlength="4" autocomplete="new-password"></label>
      <button class="btn btn-ghost" type="submit">حفظ الرمز</button>
      ${hasPin ? '<button class="btn btn-danger-ghost" type="button" data-act="removePin">إلغاء القفل</button>' : ''}
    </form>
  </section>
  <p class="muted small center">تطبيق رواسي · بياناتك محفوظة على جهازك وبالـ Drive مالتك فقط.</p>`;
}

export async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('rawasi:' + pin));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

register({
  view: {
    ai: () => aiView(),
    more: () => moreView(),
    expenses: () => expensesView(),
    reports: () => reportsView(),
    settings: () => settingsView(),
  },
  input: {
    capProduct: (el) => {
      state.drafts.capProduct = el.value;
      state.drafts.capResult = '';
      rerender();
    },
    expMonth: (el) => el.value && setUi('expMonth', el.value),
    syncAuto: (el) => sync.setConfig({ auto: el.checked }),
    repFrom: (el) => setUi('repFrom', el.value),
    repTo: (el) => setUi('repTo', el.value),
    restoreFile: async (el) => {
      const f = el.files?.[0];
      if (!f) return;
      try {
        const raw = JSON.parse(await f.text());
        if (!confirm('تستبدل كل البيانات الحالية بهذه النسخة؟')) return;
        store.replaceAll(raw);
        toast('انسترجعت النسخة ✓');
        nav('#/home');
      } catch {
        toast('الملف غير صالح', 'err');
      }
    },
  },
  act: {
    aiMode: (el) => {
      state.route.params.mode = '';
      setUi('aiMode', el.dataset.v);
    },
    aiPaste: async () => {
      try {
        const t = await navigator.clipboard.readText();
        const ta = document.getElementById('aiMsg');
        if (ta) ta.value = t;
      } catch {
        toast('الصق يدوياً (اضغط مطولاً على المربع)');
      }
    },
    aiParse: () => {
      const msg = document.getElementById('aiMsg')?.value.trim();
      if (!msg) return toast('الصق رسالة الزبون أولاً', 'err');
      state.drafts.aiMsg = msg;
      runAi(async () => {
        const r = await ai.parseBooking(msg, data());
        delete state.drafts['booking:new'];
        const d = bookingDraft('new');
        d.customer = { name: r.name || '', phone: r.phone || '', gov: r.gov || '', address: r.address || '', ig: r.ig || '' };
        const batch = d.batchId ? store.get('batches', d.batchId) : null;
        const matched = (r.lines || []).filter((l) => l.productId);
        if (matched.length) {
          d.lines = matched.map((l) => {
            const p = store.get('products', l.productId);
            const bp = batch?.items?.find((x) => x.productId === l.productId)?.price;
            return { productId: l.productId, qty: l.qty, price: n(bp) > 0 ? n(bp) : n(p?.price), discType: 'amt', disc: '', showDisc: false };
          });
        }
        const unknown = [...(r.lines || []).filter((l) => !l.productId).map((l) => l.guess), ...(r.unmatched || [])].filter(Boolean);
        d.note = r.note || '';
        d.aiNote = 'عبّاه المساعد من الرسالة، راجعه قبل الحفظ.' + (unknown.length ? ' ما عرفت هذي القطع: ' + unknown.join('، ') : '');
        state.drafts.aiMsg = '';
        state.ui.aiBusy = false;
        nav('#/booking/new');
      });
    },
    aiCaption: () => {
      const p = store.get('products', state.drafts.capProduct);
      if (!p) return;
      state.drafts.capExtra = document.getElementById('capExtra')?.value || '';
      const usePhoto = document.getElementById('capPhoto')?.checked;
      runAi(async () => {
        state.drafts.capResult = await ai.caption(p, { photo: usePhoto ? p.photo : '', extra: state.drafts.capExtra });
      });
    },
    copyCap: () => copyText(state.drafts.capResult || ''),
    aiPreset: (el) => askQuestion(el.dataset.v),
    repPeriod: (el) => setUi('repPeriod', el.dataset.v),
    delExpense: (el) => {
      if (!confirm('تحذف هذا المصروف؟')) return;
      store.remove('expenses', el.dataset.id);
      rerender();
    },
    backupDownload: () => download(`rawasi-backup-${today()}.json`, JSON.stringify(data())),
    exportAll: async () => {
      try {
        const sheets = sync.buildSheets(data());
        const [from, to] = periodRange(ui('repPeriod', 'month'));
        const r = report(data(), inv(), from, to);
        sheets['الأكثر مبيعاً'] = [['المنتج', 'القطع', 'المبيعات', 'الكلفة', 'الربح'], ...r.top.map((t) => [t.name, t.qty, Math.round(t.revenue), Math.round(t.cost), Math.round(t.profit)])];
        await downloadWorkbook(`rawasi-${today()}.xlsx`, sheets);
      } catch (e) {
        toast(e.message, 'err');
      }
    },
    disconnectGoogle: () => {
      sync.disconnectGoogle();
      toast('انفصل حساب Google. بياناتك باقية على الجهاز وبالـ Drive.');
      rerender();
    },
    removePin: () => {
      localStorage.removeItem('rawasi.pin');
      toast('انلغى القفل');
      rerender();
    },
  },
  submit: {
    aiAsk: (form) => {
      const q = form.elements.q.value.trim();
      if (!q) return;
      askQuestion(q);
    },
    addExpense: (form) => {
      const v = formData(form);
      if (!n(v.amount)) return toast('اكتب المبلغ', 'err');
      store.put('expenses', { amount: n(v.amount), category: v.category, date: v.date || today(), note: v.note });
      toast('انضاف ✓');
      state.ui.expMonth = (v.date || today()).slice(0, 7);
      rerender();
    },
    saveSync: async (form) => {
      const v = formData(form);
      sync.setConfig({ url: v.url, token: v.token });
      if (!v.url || !v.token) {
        toast('انحفظ');
        return rerender();
      }
      try {
        toast('جاري الاختبار…');
        const r = await sync.ping();
        toast(`السكربت شغال ✓ ${r.email ? '(' + r.email + ')' : ''}`);
      } catch (e) {
        toast(e.message, 'err');
      }
      rerender();
    },
    saveSettings: (form) => {
      const v = formData(form);
      const split = (s) => s.split(/[،,]/).map((x) => x.trim()).filter(Boolean);
      store.setSettings({ storeName: v.storeName, deliveryFee: n(v.deliveryFee), tomanPer1000: n(v.tomanPer1000), defaultMinStock: n(v.defaultMinStock), categories: split(v.categories), expenseCategories: split(v.expenseCategories) });
      toast('انحفظ ✓');
      rerender();
    },
    setPin: async (form) => {
      const pin = form.elements.pin.value.trim();
      if (!/^\d{4,}$/.test(pin)) return toast('الرمز لازم 4 أرقام أو أكثر', 'err');
      localStorage.setItem('rawasi.pin', await hashPin(pin));
      toast('انحفظ الرمز ✓');
      rerender();
    },
  },
});
