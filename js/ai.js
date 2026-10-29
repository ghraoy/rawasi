// الذكاء الاصطناعي: الطلب يمر عبر سكربت Google مالتك، والمفتاح ينحفظ هناك فقط (ما ينحفظ بالتطبيق).
import { call } from './sync.js';
import { live } from './logic.js';

async function ask({ system, prompt, image, json = false }) {
  const res = await call('ai', { system, prompt, image, json }, { timeout: 90000 });
  return res.text || '';
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
  const system = 'أنت مستشار ذكي لصاحب متجر عراقي صغير على الإنستقرام (متجر رواسي). جاوب بالعربي وباللهجة العراقية الخفيفة، بشكل مختصر وعملي، واعتمد على الأرقام المرفقة فقط. إذا الأرقام ما تكفي قل هذا بصراحة. المبالغ بالدينار العراقي.';
  const past = history.slice(-6).map((m) => `${m.role === 'user' ? 'صاحب المتجر' : 'المساعد'}: ${m.text}`).join('\n');
  const prompt = `بيانات المتجر الحالية (JSON):\n${JSON.stringify(summary)}\n\n${past ? 'المحادثة السابقة:\n' + past + '\n\n' : ''}السؤال: ${question}`;
  return (await ask({ system, prompt })).trim();
}
