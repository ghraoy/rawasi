// شاشة "الموقع الإلكتروني": ربط الموقع، النشر، والمعلومات اللي تظهر للزبون.
import * as store from './store.js';
import { register, settings, data, rerender, formData } from './core.js';
import { esc, icon, toast, copyText } from './ui.js';
import { fmtNum, live } from './logic.js';
import * as web from './web.js';

function when(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ar-IQ', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
}

function summary() {
  const { catalog } = web.buildCatalog(data());
  const all = live(data().products);
  const shown = catalog.products;
  const hidden = all.filter((p) => p.webHide);
  const noPrice = all.filter((p) => !p.webHide && !(Number(p.price) > 0));
  const shownIds = new Set(shown.map((p) => p.id));
  const noPhoto = all.filter((p) => shownIds.has(p.id) && !p.photo);
  return { shown, hidden, noPrice, noPhoto, catalog };
}

function webView() {
  const c = web.getConfig();
  const st = web.getStatus();
  const w = web.webSettings(settings());
  const url = web.siteUrl(settings());
  const s = summary();
  const avail = s.shown.filter((p) => p.status !== 'out').length;
  const list = (arr) => arr.slice(0, 6).map((p) => `<a class="chip" href="#/product/${esc(p.id)}">${esc(p.name)}</a>`).join('') + (arr.length > 6 ? `<span class="muted small">و${fmtNum(arr.length - 6)} غيرها</span>` : '');

  return `
  <header class="page-head"><div class="row gap"><a class="icon-btn" href="#/more" aria-label="رجوع">${icon('back')}</a><h1>الموقع الإلكتروني</h1></div>
    ${url ? `<a class="btn btn-ghost btn-sm" href="${esc(url)}" target="_blank" rel="noopener">${icon('globe', 18)}<span>افتح الموقع</span></a>` : ''}
  </header>

  <section class="kpis kpis-3">
    <div class="kpi"><span>قطع ظاهرة بالموقع</span><b>${fmtNum(s.shown.length)}</b></div>
    <div class="kpi"><span>منها متوفرة</span><b>${fmtNum(avail)}</b></div>
    <div class="kpi"><span>مخفية</span><b>${fmtNum(s.hidden.length)}</b></div>
  </section>

  ${c.token ? `
  <section class="card form">
    <h2>${icon('upload', 20)} النشر</h2>
    <p class="muted small">الموقع يعرض المنتجات وأسعار البيع والمتوفر فقط. الكلفة والتومان والأرباح وملاحظاتك الداخلية ما تطلع أبداً.</p>
    <div class="row gap wrap">
      <button class="btn grow" type="button" data-act="webPublish" ${st.state === 'publishing' ? 'disabled' : ''}>${icon('upload', 18)}<span>${st.state === 'publishing' ? 'جاري النشر…' : 'انشر التحديثات الآن'}</span></button>
      ${url ? `<button class="btn btn-ghost" type="button" data-act="webCopyLink">${icon('copy', 18)}<span>انسخ الرابط</span></button>` : ''}
    </div>
    <label class="check"><input type="checkbox" data-in="webAuto" ${c.auto ? 'checked' : ''}> <span>نشر تلقائي: بعد أي تعديل يخص الزبون (سعر، كمية، حجز، صورة) بدقيقة</span></label>
    <p class="small ${st.state === 'error' || c.lastError ? 'neg' : 'muted'}">${st.state === 'error' ? esc(st.message) : st.state === 'ok' ? esc(st.message) : c.lastError ? esc(c.lastError) : c.lastAt ? 'آخر نشر: ' + esc(when(c.lastAt)) : 'ما صار نشر بعد. اضغط الزر حتى تنزل القطع على الموقع.'}</p>
    ${url ? `<p class="small muted">الرابط: <a href="${esc(url)}" target="_blank" rel="noopener" dir="ltr">${esc(url.replace(/^https:\/\//, ''))}</a></p>` : ''}
    <details>
      <summary class="small muted">إعدادات متقدمة</summary>
      <form class="col gap" data-submit="webAdvanced" style="margin-top:10px">
        <div class="grid3">
          <label class="field"><span>المستودع</span><input name="repo" dir="ltr" value="${esc(c.repo)}"></label>
          <label class="field"><span>الفرع</span><input name="branch" dir="ltr" value="${esc(c.branch)}"></label>
          <label class="field"><span>مجلد الموقع</span><input name="dir" dir="ltr" value="${esc(c.dir)}"></label>
        </div>
        <div class="row gap wrap">
          <button class="btn btn-ghost" type="submit">${icon('check', 18)}<span>حفظ</span></button>
          <button class="btn btn-danger-ghost" type="button" data-act="webDisconnect">فصل الموقع عن هذا الجهاز</button>
        </div>
      </form>
    </details>
  </section>` : `
  <section class="card form">
    <h2>${icon('globe', 20)} اربط الموقع (مرة وحدة بكل جهاز)</h2>
    <p class="muted small">التطبيق يحتاج رمز من GitHub حتى يقدر يحدّث الموقع. الرمز يبقى على هذا الجهاز فقط، وما ينرفع للـ Drive.</p>
    <ol class="setup-steps">
      <li><b>افتح صفحة الرمز</b> وسجّل دخول بحساب GitHub مالتك.<br><a class="btn btn-ghost btn-sm" href="${esc(web.TOKEN_URL)}" target="_blank" rel="noopener">${icon('globe', 16)}<span>افتح صفحة GitHub</span></a></li>
      <li>بخانة <b>Expiration</b> اختار <b dir="ltr">No expiration</b>. الخيار <b dir="ltr">public_repo</b> مأشّر جاهز، لا تغيّر شي.</li>
      <li>انزل لتحت واضغط <b dir="ltr">Generate token</b>، وانسخ الرمز اللي يبدي بـ <b dir="ltr">ghp_</b>.</li>
      <li>الصقه هنا واضغط ربط.</li>
    </ol>
    <form class="row gap wrap end" data-submit="webToken">
      <label class="field grow"><span>رمز GitHub</span><input name="token" dir="ltr" autocomplete="off" spellcheck="false" placeholder="ghp_…" required></label>
      <button class="btn" type="submit">${icon('check', 18)}<span>ربط ونشر</span></button>
    </form>
  </section>`}

  ${s.noPrice.length || s.noPhoto.length ? `
  <section class="card col gap">
    <h2>${icon('bulb', 20)} تحتاج انتباه</h2>
    ${s.noPrice.length ? `<p class="small">ما تظهر بالموقع لأن ما إلها سعر بيع:</p><div class="row gap wrap">${list(s.noPrice)}</div>` : ''}
    ${s.noPhoto.length ? `<p class="small">ظاهرة بس بدون صورة (الصورة ترفع الطلب كثير):</p><div class="row gap wrap">${list(s.noPhoto)}</div>` : ''}
  </section>` : ''}

  <form class="card form" data-submit="saveWebInfo">
    <h2>${icon('edit', 20)} اللي يشوفه الزبون</h2>
    <label class="field"><span>جملة تعريفية تحت اسم المتجر</span><input name="tagline" value="${esc(w.tagline)}"></label>
    <label class="field"><span>نبذة عن المتجر (أسفل الموقع)</span><textarea name="about" rows="2">${esc(w.about)}</textarea></label>
    <label class="field"><span>شريط إعلان أعلى الموقع <small class="muted">اختياري</small></span><input name="announcement" value="${esc(w.announcement)}" placeholder="مثلاً: النزلة الجديدة وصلت، والكمية محدودة"></label>
    <div class="grid2">
      <label class="field"><span>حساب الانستقرام</span><input name="instagram" dir="ltr" value="${esc(w.instagram)}" placeholder="rawaas_y"></label>
      <label class="field"><span>رقم واتساب <small class="muted">اختياري</small></span><input name="whatsapp" dir="ltr" inputmode="tel" value="${esc(w.whatsapp)}" placeholder="07xxxxxxxxx"></label>
    </div>
    <div class="grid2">
      <label class="field"><span>ملاحظة التوصيل</span><input name="deliveryNote" value="${esc(w.deliveryNote)}"></label>
      <label class="field"><span>وقت الرد على الرسائل <small class="muted">اختياري</small></span><input name="dmHours" value="${esc(w.dmHours)}" placeholder="مثلاً: نرد يومياً الساعة 8 مساءً"></label>
    </div>
    <label class="field"><span>ملاحظة الطلب</span><input name="orderNote" value="${esc(w.orderNote)}"></label>
    <div class="grid2">
      <label class="field"><span>نهاية النزلة الحالية <small class="muted">يظهر عدّاد تنازلي، فقط إذا عندك موعد حقيقي</small></span><input name="dropEndsAt" type="datetime-local" value="${esc(w.dropEndsAt)}"></label>
      <label class="field"><span>دومين خاص <small class="muted">بعد ما تشتريه</small></span><input name="siteUrl" dir="ltr" value="${esc(w.siteUrl)}" placeholder="rawasi.store"></label>
    </div>
    <label class="check"><input type="checkbox" name="showSoldOut" ${w.showSoldOut ? 'checked' : ''}> <span>اعرض القطع النافدة بعلامة "نفدت" (إذا تشيلها، تختفي من الموقع)</span></label>
    <p class="muted small">أجور التوصيل تنقرى من إعدادات المتجر (${fmtNum(settings().deliveryFee)} د.ع). "النزلة الحالية" بالموقع هي آخر دفعة حالتها مفتوحة، وأسعار الدفعة تغلب على السعر العادي.</p>
    <button class="btn" type="submit">${icon('check', 18)}<span>حفظ</span></button>
  </form>`;
}

async function doPublish({ force = true } = {}) {
  try {
    const r = await web.publish(data(), { force });
    toast(r.skipped ? 'الموقع محدّث، ماكو تغييرات' : `انشر ${fmtNum(r.products)} منتج ✓ يظهر بالموقع خلال دقيقة`);
  } catch (e) {
    toast(e.message, 'err');
  }
}

web.onStatus(() => {
  if (location.hash.startsWith('#/web')) rerender();
});

register({
  view: { web: () => webView() },
  input: {
    webAuto: (el) => web.setConfig({ auto: el.checked }),
  },
  act: {
    webPublish: () => doPublish({ force: true }),
    webCopyLink: () => copyText(web.siteUrl(settings())),
    webDisconnect: () => {
      if (!confirm('تفصل الموقع عن هذا الجهاز؟ الموقع يبقى شغال، بس التحديثات توقف من هذا الجهاز.')) return;
      web.setConfig({ token: '', lastHash: '' });
      rerender();
    },
  },
  submit: {
    webToken: async (form) => {
      const token = formData(form).token.replace(/\s/g, '');
      if (!token) return;
      const c = web.getConfig();
      const btn = form.querySelector('button');
      btn.disabled = true;
      try {
        const { branch } = await web.testToken(token, c.repo);
        web.setConfig({ token, branch, lastHash: '' });
        toast('انربط الموقع ✓ جاري النشر…');
        rerender();
        await doPublish({ force: true });
      } catch (e) {
        toast(e.message, 'err');
        btn.disabled = false;
      }
    },
    webAdvanced: (form) => {
      const v = formData(form);
      web.setConfig({ repo: v.repo || 'ghraoy/rawasi', branch: v.branch || 'main', dir: v.dir.replace(/^\/|\/$/g, ''), lastHash: '' });
      toast('انحفظ ✓');
      rerender();
    },
    saveWebInfo: (form) => {
      const v = formData(form);
      const next = {
        tagline: v.tagline, about: v.about, announcement: v.announcement,
        instagram: v.instagram.replace(/^@/, ''), whatsapp: v.whatsapp,
        deliveryNote: v.deliveryNote, dmHours: v.dmHours, orderNote: v.orderNote,
        dropEndsAt: v.dropEndsAt, siteUrl: v.siteUrl.replace(/^https?:\/\//, '').replace(/\/+$/, ''),
        showSoldOut: !!v.showSoldOut,
      };
      store.setSettings({ web: { ...(settings().web || {}), ...next } });
      toast('انحفظ ✓ ينشر للموقع مع التحديث الجاي');
      rerender();
    },
  },
});
