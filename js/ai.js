// الذكاء الاصطناعي: يشتغل بحساب Google المربوط بالتطبيق (Gemini)، بدون مفتاح.
import { call, aiViaScript, isGoogle } from './sync.js';
import { gemini } from './gdrive.js';
import { live } from './logic.js';

async function ask({ system, prompt, image, json = false }) {
  // الطريقة الأساسية: حساب Google المربوط. السكربت يبقى خيار إضافي إذا كان مضبوط.
  if (aiViaScript() && !isGoogle()) {
    const res = await call('ai', { system, prompt, image, json }, { timeout: 90000 });
    return res.text || '';
  }
  return gemini({ system, prompt, image, json });
}

function parseJson(text) {
  const clean = String(text).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  return JSON.parse(start >= 0 ? clean.slice(start, end + 1) : clean);
}

// تحويل رسالة زبون من الخاص إلى حجز جاهز.
export async function parseBooking(message, data) {
  const catalog = live(data.products).map((p) => ({ id: p.id, name: p.name, category: p.category, price: Number(p.price) || 0 }));
  const govs = data.settings.governorates || [];
  const system = 'أنت مساعد لمتجر عراقي على الإنستقرام اسمه متجر رواسي. مهمتك تستخرج بيانات حجز من رسالة زبون مكتوبة باللهجة العراقية. لا تخترع معلومات غير موجودة بالرسالة.';
  const prompt = `قائمة المنتجات (JSON):\n${JSON.stringify(catalog)}\n\nالمحافظات المسموحة: ${govs.join('، ')}\n\nرسالة الزبون:\n"""${message}"""\n\nأرجع JSON فقط بهذا الشكل:\n{"name":"","phone":"","gov":"","address":"","ig":"","lines":[{"productId":"","qty":1,"guess":""}],"note":"","unmatched":[""]}\n- productId لازم يكون من القائمة فقط. إذا ما متأكد من المنتج اتركه فارغاً واكتب وصفه في guess.\n- gov لازم تكون من المحافظات المسموحة أو فارغة.\n- الهاتف بالأرقام الإنجليزية بدون مسافات.\n- unmatched: أي شي طلبه الزبون وما لقيته بالقائمة.`;
  const out = parseJson(await ask({ system, prompt, json: true }));
  const ids = new Set(catalog.map((c) => c.id));
  out.lines = (out.lines || []).filter((l) => l && (ids.has(l.productId) || l.guess)).map((l) => ({ productId: ids.has(l.productId) ? l.productId : '', qty: Math.max(1, Number(l.qty) || 1), guess: l.guess || '' }));
  if (out.gov && !govs.includes(out.gov)) out.gov = '';
  return out;
}

// كتابة كابشن لمنتج، ويمكن إرفاق صورة المنتج.
export async function caption(product, { photo, extra = '' } = {}) {
  const system = 'أنت تكتب كابشنات إنستقرام لمتجر عراقي اسمه متجر رواسي، يبيع ديكور وسيراميك وأمور دينية للرجال والنساء.';
  const prompt = `اكتب كابشن لهذا المنتج:\nالاسم: ${product.name}\nالتصنيف: ${product.category || ''}\nالسعر: ${product.price || ''} دينار\n${extra ? 'ملاحظات: ' + extra : ''}\n\nالقواعد:\n- ابدأ بسطر واحد فيه مشكلة واقعية ومنطقية وبعدها الحل (المنتج)، عاطفي بدون مبالغة.\n- لهجة عراقية بسيطة وعفوية ومقنعة، مو رسمية، وما تبين مكتوبة بالذكاء الاصطناعي.\n- قصير ومهني، يخاطب الكل (رجال ونساء).\n- اختم بالسعر وطريقة الحجز بالخاص، وبعدها 3 إلى 5 هاشتاكات مناسبة.\n- أرجع نص الكابشن فقط.`;
  let image;
  if (photo && photo.startsWith('data:')) {
    const [head, b64] = photo.split(',');
    image = { mimeType: head.slice(5, head.indexOf(';')), data: b64 };
  }
  return (await ask({ system, prompt, image })).trim();
}

// سؤال حر عن المتجر، مع ملخص للأرقام.
export async function askStore(question, summary, history = []) {
  const system = 'أنت مستشار ذكي لصاحب متجر عراقي صغير على الإنستقرام (متجر رواسي). جاوب بالعربي وباللهجة العراقية الخفيفة، بشكل مختصر وعملي، واعتمد على الأرقام المرفقة فقط. إذا الأرقام ما تكفي قل هذا بصراحة. لا تخاطبه باسم ولا تبدأ بتحية طويلة. المبالغ بالدينار العراقي.';
  const past = history.slice(-6).map((m) => `${m.role === 'user' ? 'صاحب المتجر' : 'المساعد'}: ${m.text}`).join('\n');
  const prompt = `بيانات المتجر الحالية (JSON):\n${JSON.stringify(summary)}\n\n${past ? 'المحادثة السابقة:\n' + past + '\n\n' : ''}السؤال: ${question}`;
  return (await ask({ system, prompt })).trim();
}

function toImagePart(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return undefined;
  const [head, b64] = dataUrl.split(',');
  return { mimeType: head.slice(5, head.indexOf(';')), data: b64 };
}

// استخراج منتجات من نص (قائمة، رسالة مورد، جدول منسوخ) أو صورة (فاتورة، قائمة أسعار، صورة بضاعة).
export async function extractProducts({ text = '', images = [], data }) {
  const cats = data.settings.categories || [];
  const existing = live(data.products).map((p) => p.name).slice(0, 300);
  const system = 'أنت تساعد صاحب متجر عراقي يبيع ديكور وسيراميك وأمور دينية. تستخرج قائمة منتجات وكمياتها وأسعارها من نص أو صورة. لا تخترع أرقام غير موجودة.';
  const prompt = `التصنيفات المتاحة: ${cats.join('، ')}\nمنتجات موجودة سابقاً (إذا نفس المنتج اكتب اسمه بنفس الصيغة): ${JSON.stringify(existing)}\n\n${text ? 'النص:\n"""' + text + '"""\n\n' : ''}${images.length ? 'وارفقت ' + images.length + ' صورة (فاتورة أو قائمة أو بضاعة).\n\n' : ''}أرجع JSON فقط بهذا الشكل:\n{"rows":[{"name":"","category":"","qty":0,"costToman":0,"costIqd":0,"price":0,"code":""}],"currency":"toman","note":""}\n- name: اسم واضح ومختصر بالعربي.\n- category: من التصنيفات المتاحة إذا يناسب، وإلا اقترح تصنيف قصير.\n- qty: الكمية إذا مذكورة وإلا 0.\n- costToman: سعر شراء القطعة بالتومان إذا مذكور بالتومان، وإلا 0. costIqd: سعر شراء القطعة بالدينار إذا مذكور بالدينار، وإلا 0.\n- price: سعر البيع بالدينار إذا مذكور، وإلا 0.\n- إذا السعر المذكور للمجموع مو للقطعة، اقسمه على الكمية.\n- currency: "toman" أو "iqd" حسب عملة الشراء الغالبة.\n- note: أي ملاحظة مهمة (مثلاً رقم ما واضح) بجملة قصيرة، أو فارغ.`;
  // الصور الإضافية ترسل كأجزاء منفصلة عبر عدة طلبات إذا أكثر من وحدة
  const first = await ask({ system, prompt, image: toImagePart(images[0]), json: true });
  const out = parseJson(first);
  let rows = out.rows || [];
  for (const img of images.slice(1)) {
    try {
      const more = parseJson(await ask({ system, prompt: prompt.replace(/وارفقت \d+ صورة/, 'وارفقت صورة'), image: toImagePart(img), json: true }));
      rows = rows.concat(more.rows || []);
    } catch {}
  }
  const num = (v) => Math.max(0, Number(String(v ?? '').replace(/[^\d.]/g, '')) || 0);
  rows = rows
    .filter((r) => r && String(r.name || '').trim())
    .map((r) => ({ name: String(r.name).trim(), category: String(r.category || '').trim(), qty: num(r.qty), costToman: num(r.costToman), costIqd: num(r.costIqd), price: num(r.price), code: String(r.code || '').trim() }));
  return { rows, currency: out.currency === 'iqd' ? 'iqd' : 'toman', note: out.note || '' };
}

// اقتراح اسم وتصنيف ووصف لمنتج من صورته.
export async function productFromPhoto(photo, data) {
  const cats = data.settings.categories || [];
  const system = 'أنت تساعد صاحب متجر عراقي يبيع ديكور وسيراميك وأمور دينية بتسمية منتجاته.';
  const prompt = `شوف صورة المنتج واقترح:\n{"name":"","category":"","notes":""}\n- name: اسم قصير وواضح بالعربي (مثل: صحن سيراميك بنقش فيروزي).\n- category: واحد من: ${cats.join('، ')}، أو تصنيف قصير جديد إذا ما يناسب.\n- notes: وصف قصير للمادة واللون والقياس التقريبي.\nأرجع JSON فقط.`;
  return parseJson(await ask({ system, prompt, image: toImagePart(photo), json: true }));
}

// وصف قصير للمنتج يظهر بموقع المتجر.
export async function webDescription(product, { photo } = {}) {
  const system = 'أنت تكتب وصف منتجات لموقع متجر عراقي اسمه متجر رواسي، يبيع سيراميك وديكور وأمور دينية للرجال والنساء.';
  const prompt = `اكتب وصف لهذا المنتج حتى يظهر بصفحته بالموقع:\nالاسم: ${product.name}\nالتصنيف: ${product.category || ''}\n${product.notes ? 'معلومات من صاحب المتجر (القياس، المادة…): ' + product.notes : ''}\n\nالقواعد:\n- جملتين إلى ثلاث، عربي بسيط وواضح مع لمسة عراقية خفيفة.\n- اذكر المادة واللون والاستخدام أو المكان المناسب بالبيت، وإذا تصلح هدية.\n- اذكر القياس فقط إذا مذكور بالمعلومات، ولا تخترع أرقام أو مواصفات.\n- بدون سعر، بدون إيموجي، بدون هاشتاكات، بدون مبالغة.\n- أرجع نص الوصف فقط.`;
  let image;
  if (photo && photo.startsWith('data:')) {
    const [head, b64] = photo.split(',');
    image = { mimeType: head.slice(5, head.indexOf(';')), data: b64 };
  }
  return (await ask({ system, prompt, image })).trim();
}
