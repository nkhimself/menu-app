(function () {
  'use strict';
  var KEY = 'repricer.v1';
  var L = window.Logic;
  var DEFAULT = { ingredients: [], items: [], subs: [],
    settings: { targetFC: 30, minPortion: 85, roundTo: 5000, elasticity: 1.2, qualityDrop: 3 },
    meta: { setupSeconds: null, setups: 0, priceUpdates: 0 } };
  var state = load();
  var tab = state.items.length ? 'res' : 'qs';
  var T = window.Templates;
  var qs = { dishes: {}, prices: {}, sell: {}, t0: null };
  var upd = {};

  function load() {
    try { var s = localStorage.getItem(KEY); if (s) return merge(JSON.parse(s)); } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT));
  }
  function merge(s) {
    var d = JSON.parse(JSON.stringify(DEFAULT));
    d.ingredients = s.ingredients || []; d.items = s.items || []; d.subs = s.subs || [];
    for (var k in s.settings || {}) d.settings[k] = s.settings[k];
    for (var m in s.meta || {}) d.meta[m] = s.meta[m];
    return d;
  }
  function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function save() { saveLocal(); if (window.Sync && Sync.user()) { Sync.markDirty(); scheduleSync(); } }
  function uid() { return 'i' + Math.random().toString(36).slice(2, 9); }
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
  function pct(n) { return (Math.round(n * 10) / 10) + '%'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ingOptions(sel) {
    return state.ingredients.map(function (i) { return '<option value="' + i.id + '"' + (i.id === sel ? ' selected' : '') + '>' + esc(i.name) + '</option>'; }).join('');
  }
  var UNIT = { kg: 'هر کیلوگرم', l: 'هر لیتر', piece: 'هر عدد' };
  var AMT = { kg: 'گرم', l: 'میلی‌لیتر', piece: 'عدد' };

  // ---------- views ----------
  function viewIng() {
    var h = '<div class="card"><h2>مواد اولیه و قیمت امروز</h2><p class="mute">هر وقت قیمتی عوض شد، فقط همین‌جا عدد را اصلاح کنید؛ بقیه خودکار حساب می‌شود.</p>';
    state.ingredients.forEach(function (g) {
      h += '<div class="row" data-id="' + g.id + '">' +
        '<input class="name" data-f="ing-name" value="' + esc(g.name) + '" placeholder="نام ماده">' +
        '<select data-f="ing-unit"><option value="kg"' + (g.unit === 'kg' ? ' selected' : '') + '>کیلوگرم</option><option value="l"' + (g.unit === 'l' ? ' selected' : '') + '>لیتر</option><option value="piece"' + (g.unit === 'piece' ? ' selected' : '') + '>عدد</option></select>' +
        '<input type="number" min="0" data-f="ing-price" value="' + g.price + '" title="' + UNIT[g.unit] + '">' +
        '<label><input type="checkbox" data-f="ing-trim"' + (g.trimmable !== false ? ' checked' : '') + '> قابل کم‌کردن</label>' +
        '<button class="x" data-act="ing-del" title="حذف">×</button></div>';
      if (g.prevPrice != null && g.prevPrice !== g.price) h += '<div class="mute" style="margin:-4px 0 8px">قیمت قبلی: ' + fmt(g.prevPrice) + ' ← ' + fmt(g.price) + ' (' + pct((g.price / g.prevPrice - 1) * 100) + ')</div>';
    });
    h += '<button class="btn pri" data-act="ing-add">+ ماده جدید</button></div>';
    if (!state.ingredients.length) h += '<div class="card"><button class="btn" data-act="demo">بارگذاری نمونهٔ پیتزا و ساندویچ</button></div>';
    return h;
  }

  function viewMenu() {
    var h = '';
    state.items.forEach(function (it) {
      h += '<div class="card" data-id="' + it.id + '"><div class="row">' +
        '<input class="name" data-f="it-name" value="' + esc(it.name) + '" placeholder="نام آیتم (مثلاً پیتزا مارگاریتا)">' +
        '<label>قیمت فروش <input type="number" min="0" data-f="it-price" value="' + it.price + '"></label>' +
        '<label>فروش ماهانه (اختیاری) <input type="number" min="0" data-f="it-sales" value="' + (it.sales || '') + '"></label>' +
        '<button class="x" data-act="it-del" title="حذف آیتم">×</button></div>';
      (it.lines || []).forEach(function (l, idx) {
        var g = state.ingredients.filter(function (x) { return x.id === l.ingId; })[0];
        h += '<div class="row" data-line="' + idx + '"><select data-f="ln-ing">' + ingOptions(l.ingId) + '</select>' +
          '<input type="number" min="0" data-f="ln-amt" value="' + l.amount + '"> <span class="mute">' + (g ? AMT[g.unit] : '') + '</span>' +
          '<button class="x" data-act="ln-del">×</button></div>';
      });
      h += '<button class="btn" data-act="ln-add">+ ماده در این آیتم</button></div>';
    });
    h += '<button class="btn pri" data-act="it-add">+ آیتم جدید</button>';
    if (!state.ingredients.length) h = '<div class="note">اول در بخش «مواد اولیه» مواد را وارد کنید.</div>' + h;
    return h;
  }

  function viewSub() {
    var h = '<div class="card"><h2>جایگزین‌های مجاز</h2><p class="mute">مثلاً «به‌جای ۵۰٪ پنیر پیتزا، پنیر پروسسی بگذارم». برنامه فقط از جایگزین‌هایی استفاده می‌کند که شما تأیید کرده‌اید.</p>';
    state.subs.forEach(function (s) {
      h += '<div class="row" data-id="' + s.id + '"><select data-f="sb-from">' + ingOptions(s.fromId) + '</select> ← <select data-f="sb-to">' + ingOptions(s.toId) + '</select>' +
        '<label>نسبت مقدار <input type="number" step="0.1" min="0" data-f="sb-ratio" value="' + s.ratio + '"></label>' +
        '<label>حداکثر سهم (٪) <input type="number" min="0" max="100" data-f="sb-share" value="' + s.maxShare + '"></label>' +
        '<button class="x" data-act="sb-del">×</button></div>';
    });
    h += '<button class="btn pri" data-act="sb-add">+ جایگزین جدید</button></div>';
    return h;
  }

  function viewRes() {
    var map = L.buildMap(state), h = '';
    var s = state.settings;
    if (!state.items.length) return '<div class="note">هنوز آیتمی وارد نشده است.</div>';
    h += '<p class="mute">هدف هزینهٔ مواد: ' + s.targetFC + '٪ قیمت فروش. ' + 'اگر «فروش ماهانه» وارد کرده باشید، سود ماهانه هم مقایسه می‌شود.</p>';
    state.items.forEach(function (it) {
      var r = L.scenarios(it, map, s, state.subs);
      h += '<div class="card"><div class="row"><h2 style="margin:0;flex:1">' + esc(it.name || '(بدون نام)') + '</h2>' +
        '<span class="badge ' + (r.over ? 'bad' : 'ok') + '">هزینهٔ مواد ' + pct(r.fc * 100) + '</span></div>' +
        '<div class="mute">هزینهٔ مواد: ' + fmt(r.cost) + ' — قیمت فروش: ' + fmt(it.price) + '</div>';
      var ex = r.explain;
      if (ex.length && ex[0].delta > 0) h += '<div class="note">بیشترین اثر: ' + esc(ex[0].name) + ' (' + pct(ex[0].pct) + ' گران‌تر شده؛ +' + fmt(ex[0].delta) + ' برای هر واحد)</div>';
      if (!r.over) { h += '<p>در محدودهٔ هدف است؛ تغییری لازم نیست.</p></div>'; return; }
      var unit = r.hasSales ? 'سود ماهانه' : 'سود هر واحد';
      var names = { nothing: 'تغییر نمی‌دهم', raise: 'قیمت را بالا می‌برم', keep: 'قیمت را نگه می‌دارم و مواد را اصلاح می‌کنم' };
      h += '<table><tr><th>گزینه</th><th>قیمت</th><th>هزینه</th><th>' + unit + '</th></tr>';
      ['nothing', 'raise', 'keep'].forEach(function (k) {
        var x = r.scenarios[k];
        h += '<tr' + (r.best === k ? ' class="best"' : '') + '><td>' + names[k] + (r.best === k ? ' ✓' : '') + '</td><td class="n">' + fmt(x.price) + '</td><td class="n">' + fmt(x.cost) + '</td><td class="n">' + fmt(x.profit) + '</td></tr>';
      });
      h += '</table>';
      if (r.plan.actions.length) {
        h += '<div><b>اگر قیمت را نگه دارید:</b><ul>';
        r.plan.actions.forEach(function (a) {
          if (a.type === 'swap') h += '<li>' + Math.round(a.amountFrom) + ' از «' + esc(a.fromName) + '» (' + pct(a.percent) + ' آن) را با ' + Math.round(a.amountTo) + ' از «' + esc(a.toName) + '» عوض کنید؛ صرفه‌جویی ' + fmt(a.saving) + ' برای هر واحد</li>';
          else h += '<li>«' + esc(a.name) + '» را ' + pct(a.percent) + ' کم کنید (از ' + Math.round(a.amountFrom) + ' به ' + Math.round(a.amountTo) + ')؛ صرفه‌جویی ' + fmt(a.saving) + ' برای هر واحد</li>';
        });
        h += '</ul>';
        if (r.plan.needsPriceRise) h += '<div class="note">این کم‌کردن‌ها کافی نیست؛ برای رسیدن به هدف قیمت باید حداقل ' + fmt(r.plan.priceNeeded) + ' شود.</div>';
        h += '</div>';
      } else if (r.plan.needsPriceRise) h += '<div class="note">جایگزین یا کم‌کردن مجازی تعریف نشده است؛ فقط افزایش قیمت باقی می‌ماند.</div>';
      h += '</div>';
    });
    h += '<div class="note">پیشنهادها تقریبی‌اند. افت فروش با ضریب حساسیت ' + s.elasticity + ' فرض شده و باید با فروش واقعی خودتان اصلاح شود؛ تغییر مواد را قبل از اجرا خودتان تأیید کنید.</div>';
    return h;
  }


  // ---------- quick start ----------
  function qsNeeded() {
    var need = {};
    T.dishes.forEach(function (d) { if (qs.dishes[d.id]) d.lines.forEach(function (l) { need[l[0]] = true; }); });
    return Object.keys(need);
  }
  function viewQs() {
    if (qs.t0 == null) qs.t0 = Date.now();
    var h = '<div class="card"><h2>شروع سریع (حدود دو دقیقه)</h2><p class="mute">۱) غذاهای خود را انتخاب کنید ۲) قیمت مواد و قیمت فروش را بنویسید ۳) نتیجه را ببینید. مقدارهای هر غذا نمونهٔ تقریبی است و بعداً در بخش «منو» اصلاح می‌شود.</p>';
    h += '<h2 style="margin-top:12px">۱) غذاها</h2><div class="row">';
    T.dishes.forEach(function (d) {
      h += '<label class="chip"><input type="checkbox" data-f="qs-dish" data-k="' + d.id + '"' + (qs.dishes[d.id] ? ' checked' : '') + '> ' + esc(d.name) + '</label>';
    });
    h += '</div>';
    var need = qsNeeded();
    if (need.length) {
      h += '<h2 style="margin-top:12px">۲) قیمت مواد (آخرین قیمت خرید شما، به تومان)</h2>';
      need.forEach(function (k) {
        var c = T.catalog[k], ex = state.ingredients.filter(function (g) { return g.name === c.name; })[0];
        var v = qs.prices[k] != null ? qs.prices[k] : (ex ? ex.price : '');
        h += '<div class="row"><label style="flex:1">' + esc(c.name) + ' <span class="mute">(' + UNIT[c.unit] + ')</span></label><input type="number" min="0" inputmode="numeric" data-f="qs-price" data-k="' + k + '" value="' + v + '"></div>';
      });
      h += '<h2 style="margin-top:12px">قیمت فروش هر غذا (تومان)</h2>';
      T.dishes.forEach(function (d) {
        if (!qs.dishes[d.id]) return;
        var ex = state.items.filter(function (it) { return it.name === d.name; })[0];
        var v = qs.sell[d.id] != null ? qs.sell[d.id] : (ex ? ex.price : '');
        h += '<div class="row"><label style="flex:1">' + esc(d.name) + '</label><input type="number" min="0" inputmode="numeric" data-f="qs-sell" data-k="' + d.id + '" value="' + v + '"></div>';
      });
      h += '<button class="btn pri" data-act="qs-go">محاسبه و نمایش نتیجه</button>';
    } else h += '<p class="mute">حداقل یک غذا را انتخاب کنید.</p>';
    h += '</div>';
    if (state.meta.setupSeconds != null) h += '<p class="mute">آخرین راه‌اندازی: ' + Math.round(state.meta.setupSeconds) + ' ثانیه</p>';
    h += '<div class="card"><p class="mute">غذای شما در فهرست نیست؟ از بخش «منو» خودتان اضافه کنید.</p><button class="btn" data-act="demo">نمونهٔ آماده را ببینم</button></div>';
    return h;
  }
  function qsApply() {
    var need = qsNeeded(), miss = [];
    need.forEach(function (k) { if (!(Number(qs.prices[k]) > 0) && !(findByName(state.ingredients, T.catalog[k].name))) miss.push(T.catalog[k].name); });
    T.dishes.forEach(function (d) { if (qs.dishes[d.id] && !(Number(qs.sell[d.id]) > 0) && !findByName(state.items, d.name)) miss.push('قیمت فروش ' + d.name); });
    if (miss.length) { alert('این موارد را پر کنید:\n' + miss.join('\n')); return false; }
    var idOf = {};
    need.forEach(function (k) {
      var c = T.catalog[k], g = findByName(state.ingredients, c.name), p = Number(qs.prices[k]);
      if (!g) { g = { id: uid(), name: c.name, unit: c.unit, price: p > 0 ? p : 0, trimmable: true }; state.ingredients.push(g); }
      else if (p > 0 && p !== g.price) { g.prevPrice = g.price; g.price = p; }
      idOf[k] = g.id;
    });
    T.dishes.forEach(function (d) {
      if (!qs.dishes[d.id]) return;
      var price = Number(qs.sell[d.id]), it = findByName(state.items, d.name);
      if (!it) { it = { id: uid(), name: d.name, price: price, sales: 0, lines: [] }; state.items.push(it); }
      else if (price > 0) it.price = price;
      if (!it.lines.length) it.lines = d.lines.map(function (l) { return { ingId: idOf[l[0]], amount: l[1] }; });
    });
    if (state.meta.setupSeconds == null && qs.t0) state.meta.setupSeconds = (Date.now() - qs.t0) / 1000;
    state.meta.setups++;
    qs = { dishes: {}, prices: {}, sell: {}, t0: null };
    return true;
  }
  function findByName(arr, name) { return arr.filter(function (x) { return x.name === name; })[0]; }

  // ---------- what changed ----------
  function viewChg() {
    var h = '<div class="card"><h2>قیمت‌های جدید را وارد کنید</h2><p class="mute">فقط قیمت موادی را که عوض شده بنویسید و یک بار «ثبت» را بزنید. بقیه را خالی بگذارید.</p>';
    if (!state.ingredients.length) return '<div class="note">اول از «شروع سریع» مواد را وارد کنید.</div>';
    state.ingredients.forEach(function (g) {
      h += '<div class="row"><label style="flex:1">' + esc(g.name) + ' <span class="mute">(الان ' + fmt(g.price) + ')</span></label><input type="number" min="0" inputmode="numeric" data-f="up-price" data-k="' + g.id + '" value="' + (upd[g.id] != null ? upd[g.id] : '') + '" placeholder="قیمت جدید"></div>';
    });
    h += '<button class="btn pri" data-act="up-go">ثبت قیمت‌های جدید</button></div>';
    var c = L.changes(state);
    if (!c.ingredients.length) return h + '<div class="note">هنوز تغییر قیمتی ثبت نشده است. بعد از ثبت قیمت جدید، اینجا می‌بینید چه چیزی گران شد و کدام غذاها را اذیت کرد.</div>';
    h += '<div class="card"><h2>چه چیزی عوض شد</h2>';
    c.ingredients.forEach(function (g) {
      h += '<div class="row"><span style="flex:1">' + esc(g.name) + '</span><span class="mute">' + fmt(g.prev) + ' ← ' + fmt(g.now) + '</span><span class="badge ' + (g.pct > 0 ? 'bad' : 'ok') + '">' + '\u200e' + (g.pct > 0 ? '+' : '') + pct(g.pct) + '</span></div>';
    });
    h += '</div><div class="card"><h2>اثر روی غذاها</h2><table><tr><th>غذا</th><th>هزینه</th><th>سهم هزینهٔ مواد</th><th>بیشترین علت</th></tr>';
    c.items.forEach(function (x) {
      if (Math.abs(x.delta) < 1e-9) return;
      h += '<tr><td>' + esc(x.name) + (x.crossed ? ' <span class="badge bad">از هدف گذشت</span>' : '') + '</td><td class="n">' + fmt(x.costPrev) + ' ← ' + fmt(x.costNow) + '</td><td class="n">' + pct(x.fcPrev * 100) + ' ← ' + pct(x.fcNow * 100) + '</td><td>' + esc(x.cause) + '</td></tr>';
    });
    h += '</table><p class="mute">برای دیدن پیشنهاد (بالا بردن قیمت یا اصلاح مواد) به بخش «نتیجه» بروید.</p></div>';
    h += '<div class="card"><button class="btn" data-act="share">متن خلاصه برای ارسال به کارکنان یا شریک</button><div id="sharebox"></div></div>';
    return h;
  }
  function shareText() {
    var c = L.changes(state), map = L.buildMap(state), s = state.settings, out = [];
    out.push('خلاصهٔ تغییر قیمت مواد:');
    c.ingredients.forEach(function (g) { out.push('• ' + g.name + ': ' + fmt(g.prev) + ' ← ' + fmt(g.now) + ' (' + (g.pct > 0 ? '+' : '') + pct(g.pct) + ')'); });
    var over = c.items.filter(function (x) { return x.over; });
    if (over.length) {
      out.push('', 'غذاهایی که هزینهٔ مواد از هدف (' + s.targetFC + '٪) بالاتر است:');
      over.forEach(function (x) {
        var it = state.items.filter(function (y) { return y.id === x.id; })[0], r = L.scenarios(it, map, s, state.subs);
        out.push('• ' + x.name + ': ' + pct(x.fcNow * 100) + '، حداقل قیمت برای رسیدن به هدف: ' + fmt(r.scenarios.raise.price));
      });
    } else out.push('', 'همهٔ غذاها در محدودهٔ هدف هستند.');
    return out.join('\n');
  }

  function viewSet() {
    var s = state.settings;
    function f(key, label, hint) { return '<div class="row"><label style="flex:1">' + label + '<br><span class="mute">' + hint + '</span></label><input type="number" step="any" data-f="st-' + key + '" value="' + s[key] + '"></div>'; }
    return '<div class="card"><h2>تنظیمات</h2>' +
      f('targetFC', 'هدف هزینهٔ مواد (٪ قیمت فروش)', 'معمولاً بین ۲۸ تا ۳۵؛ برای خودتان تنظیم کنید') +
      f('minPortion', 'حداقل مقدار مجاز نسبت به مقدار فعلی (٪)', 'مثلاً ۸۵ یعنی تا ۱۵٪ کم‌کردن مجاز است') +
      f('roundTo', 'رند کردن قیمت به', 'مثلاً ۱۰۰۰ یا ۵۰۰۰ تومان') +
      f('elasticity', 'حساسیت مشتری به گرانی', 'عدد ۱٫۲ یعنی ۱۰٪ گرانی ≈ ۱۲٪ کاهش فروش؛ فرض محتاطانه') +
      f('qualityDrop', 'افت فروش بر اثر کم‌کردن مواد (٪)', 'اگر کیفیت کمی پایین بیاید') + '</div>' +
      '<div class="card"><h2>داده</h2><div class="row">' +
      '<button class="btn" data-act="export">دریافت پشتیبان (فایل)</button>' +
      '<label class="btn">بازیابی از فایل<input type="file" accept=".json" data-f="import" hidden></label>' +
      '<button class="btn" data-act="demo">نمونهٔ پیتزا و ساندویچ</button>' +
      '<button class="btn" data-act="reset" style="color:var(--bad)">پاک‌کردن همه</button></div>' +
      '<p class="mute">اگر وارد حساب نشده‌اید اطلاعات فقط روی همین دستگاه ذخیره می‌شود؛ حتماً گاهی پشتیبان بگیرید.</p></div>' +
      '<div class="card"><h2>آمار استفاده (فقط روی همین دستگاه)</h2><p class="mute">زمان راه‌اندازی: ' + (state.meta.setupSeconds == null ? '—' : Math.round(state.meta.setupSeconds) + ' ثانیه') + ' — دفعات شروع سریع: ' + state.meta.setups + ' — دفعات ثبت قیمت جدید: ' + state.meta.priceUpdates + '</p></div>';
  }

  // ---------- account + cloud ----------
  var cloud = { kind: '', msg: '', conflict: false, busy: false, timer: null, checked: null, remote: null };
  var S = window.Sync;
  function when(ts) { try { return new Date(ts).toLocaleString('fa-IR'); } catch (e) { return ts; } }
  function setCloud(kind, msg) { cloud.kind = kind; cloud.msg = msg; paintStat(); if (tab === 'acc') render(); }
  function paintStat() {
    var el = document.getElementById('syncstat'); if (!el) return;
    if (!S || !S.user()) { el.textContent = ''; return; }
    var t = cloud.conflict ? '⚠ تداخل داده' : cloud.busy ? '… همگام‌سازی' : cloud.kind === 'err' ? '⚠ بدون اتصال' : (S.meta().dirty ? '● ذخیره‌نشده در ابر' : '✓ ذخیره در ابر');
    el.textContent = t; el.className = cloud.conflict || cloud.kind === 'err' ? 'bad' : '';
  }
  function profile() { var m = S.meta(); return { city: m.city || '', share: !!m.share }; }
  function scheduleSync() { clearTimeout(cloud.timer); paintStat(); cloud.timer = setTimeout(function () { syncNow(false); }, 1500); }
  function syncNow(force) {
    if (!S || !S.user() || cloud.busy) return Promise.resolve();
    if (cloud.conflict && !force) return Promise.resolve();
    cloud.busy = true; paintStat();
    return S.push(state, profile(), force).then(function (r) {
      cloud.busy = false;
      if (r.conflict) { cloud.conflict = true; setCloud('err', 'داده‌ای از دستگاه دیگر در ابر هست که با این دستگاه فرق دارد. یکی را انتخاب کنید.'); }
      else { cloud.conflict = false; setCloud('ok', 'آخرین ذخیره در ابر: ' + when(Date.now())); }
    }).catch(function (e) {
      cloud.busy = false;
      if (e && e.auth) { setCloud('err', 'نشست شما تمام شده؛ دوباره وارد شوید.'); }
      else setCloud('err', 'اتصال برقرار نشد؛ تغییرات روی دستگاه ذخیره است و بعداً ارسال می‌شود. ' + ((e && e.text) || ''));
    });
  }
  function isEmpty(st) { return !st.ingredients.length && !st.items.length; }
  // after login or on start: reconcile this device with the cloud
  function reconcile(justLoggedIn) {
    if (!S || !S.user()) return Promise.resolve();
    cloud.busy = true; paintStat();
    return S.pull().then(function (row) {
      cloud.busy = false;
      var m = S.meta();
      if (row) { m.city = row.city || ''; m.share = !!row.share_prices; }
      if (!row) { S.meta().lastSynced = null; return syncNow(false); }                // nothing in cloud yet: upload this device
      if (!justLoggedIn && m.lastSynced === row.updated_at) { return m.dirty ? syncNow(false) : (setCloud('ok', 'همه‌چیز همگام است.')); }
      var remote = merge(row.state || {});
      if (justLoggedIn && !isEmpty(state) && !isEmpty(remote)) {
        if (confirm('هم روی این دستگاه و هم در ابر اطلاعات دارید.\nتأیید = اطلاعات ابر بارگذاری شود (اطلاعات این دستگاه کنار گذاشته می‌شود)\nانصراف = اطلاعات این دستگاه جای ابر را بگیرد')) { adopt(remote, row.updated_at); }
        else { m.lastSynced = row.updated_at; return syncNow(true); }
      } else if (m.dirty && !justLoggedIn && m.lastSynced !== row.updated_at) {
        cloud.conflict = true; setCloud('err', 'داده‌ای از دستگاه دیگر در ابر هست که با این دستگاه فرق دارد. یکی را انتخاب کنید.'); cloud.remote = { st: remote, at: row.updated_at };
      } else if (isEmpty(remote) && !isEmpty(state)) { m.lastSynced = row.updated_at; return syncNow(true); }
      else adopt(remote, row.updated_at);
    }).catch(function (e) {
      cloud.busy = false; setCloud('err', (e && e.auth) ? 'دوباره وارد شوید.' : 'اتصال برقرار نشد: ' + ((e && e.text) || ''));
    });
  }
  function adopt(st, at) {
    state = st; saveLocal(); var m = S.meta(); m.lastSynced = at; m.dirty = false; S.saveMeta(); cloud.conflict = false;
    tab = state.items.length ? 'res' : 'qs'; setCloud('ok', 'اطلاعات از ابر بارگذاری شد.'); render();
  }
  function viewAcc() {
    var h = '';
    if (!S || !S.configured()) return '<div class="card"><p class="mute">اتصال به سرور تنظیم نشده است.</p></div>';
    var u = S.user();
    if (!u) {
      h += '<div class="card"><h2>ورود یا ثبت‌نام</h2><p class="mute">بدون حساب هم می‌توانید از برنامه استفاده کنید (اطلاعات فقط روی همین گوشی می‌ماند). با حساب، اطلاعات شما در ابر هم ذخیره می‌شود و با عوض‌کردن گوشی از دست نمی‌رود.</p>' +
        '<div class="row"><input id="acc-email" type="email" dir="ltr" placeholder="ایمیل" autocomplete="username" style="flex:1 1 200px"></div>' +
        '<div class="row"><input id="acc-pass" type="password" dir="ltr" placeholder="رمز عبور (حداقل ۸ کاراکتر)" autocomplete="current-password" style="flex:1 1 200px"></div>' +
        '<div class="row"><button class="btn pri" data-act="acc-in">ورود</button><button class="btn" data-act="acc-up">ثبت‌نام</button></div>' +
        (cloud.msg ? '<div class="note">' + esc(cloud.msg) + '</div>' : '') + '</div>';
    } else {
      var m = S.meta();
      h += '<div class="card"><h2>حساب شما</h2><p dir="ltr" style="text-align:right">' + esc(u.email || '') + '</p>' +
        '<p>' + (cloud.conflict ? '<span class="badge bad">تداخل داده</span>' : cloud.busy ? 'در حال همگام‌سازی…' : m.dirty ? 'تغییرات هنوز در ابر ذخیره نشده‌اند.' : '<span class="badge ok">همگام با ابر</span>') + '</p>' +
        (cloud.msg ? '<p class="mute">' + esc(cloud.msg) + '</p>' : '') +
        (cloud.conflict ? '<div class="row"><button class="btn" data-act="acc-usecloud">استفاده از نسخهٔ ابر</button><button class="btn" data-act="acc-usethis" style="color:var(--bad)">جایگزین‌کردن ابر با این دستگاه</button></div>' : '') +
        '<div class="row"><button class="btn" data-act="acc-sync">همگام‌سازی الان</button><button class="btn" data-act="acc-out">خروج</button></div></div>' +
        '<div class="card"><h2>مشخصات کسب‌وکار</h2>' +
        '<div class="row"><label style="flex:1">شهر<br><input id="acc-city" value="' + esc(m.city || '') + '" placeholder="مثلاً مشهد" style="width:100%"></label></div>' +
        '<label class="row"><input type="checkbox" id="acc-share"' + (m.share ? ' checked' : '') + '> <span>اجازه می‌دهم در آینده قیمت مواد من به‌صورت ناشناس برای مقایسهٔ قیمت بین مغازه‌ها استفاده شود <span class="mute">(در این نسخه هنوز هیچ دادهٔ شما با کسی به اشتراک گذاشته نمی‌شود)</span></span></label>' +
        '<button class="btn" data-act="acc-prof">ذخیرهٔ مشخصات</button></div>' +
        '<div class="card"><h2>حذف اطلاعات ابری</h2><p class="mute">اطلاعات شما در ابر پاک می‌شود؛ نسخهٔ روی این گوشی می‌ماند. برای حذف کامل خود حساب، به ما پیام دهید.</p><button class="btn" data-act="acc-del" style="color:var(--bad)">حذف اطلاعات من از ابر</button></div>';
    }
    h += '<div class="card"><h2>بررسی اتصال به سرور</h2><div class="row"><button class="btn" data-act="acc-check">بررسی اتصال</button></div><p class="mute" id="chk">' + (cloud.checked || '') + '</p></div>';
    return h;
  }
  function accAct(act) {
    var v = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    if (act === 'acc-in' || act === 'acc-up') {
      var em = v('acc-email'), pw = (document.getElementById('acc-pass') || {}).value || '';
      if (!/^\S+@\S+\.\S+$/.test(em)) { setCloud('err', 'ایمیل را درست وارد کنید.'); return; }
      if (pw.length < 8) { setCloud('err', 'رمز عبور حداقل ۸ کاراکتر باشد.'); return; }
      setCloud('', 'در حال ارتباط با سرور…');
      (act === 'acc-in' ? S.signIn(em, pw).then(function () { return true; }) : S.signUp(em, pw).then(function (r) { if (r.needConfirm) { setCloud('', 'ایمیل تأیید برای شما ارسال شد؛ لینک آن را باز کنید و بعد وارد شوید.'); return false; } return true; }))
        .then(function (ok) { if (!ok) return; cloud.msg = ''; cloud.conflict = false; paintStat(); render(); return reconcile(true); })
        .catch(function (e) { setCloud('err', (e && e.text) || 'اتصال به سرور برقرار نشد. اینترنت را بررسی کنید.'); });
    } else if (act === 'acc-out') {
      if (S.meta().dirty && !confirm('تغییرات اخیر هنوز در ابر ذخیره نشده‌اند. با خروج، اطلاعات این دستگاه پاک می‌شود و آن تغییرات از دست می‌روند. ادامه؟')) return;
      if (!confirm('با خروج، اطلاعات از روی این گوشی پاک می‌شود (در ابر می‌ماند). خروج؟')) return;
      S.signOut(); state = JSON.parse(JSON.stringify(DEFAULT)); saveLocal(); cloud = { kind: '', msg: '', conflict: false, busy: false, timer: null, checked: cloud.checked, remote: null }; tab = 'qs'; paintStat(); render();
    } else if (act === 'acc-sync') { cloud.conflict = cloud.conflict; reconcile(false); }
    else if (act === 'acc-usecloud') { S.pull().then(function (row) { if (row) adopt(merge(row.state || {}), row.updated_at); }).catch(function (e) { setCloud('err', (e && e.text) || 'اتصال برقرار نشد'); }); }
    else if (act === 'acc-usethis') { if (confirm('اطلاعات ابر با اطلاعات این دستگاه جایگزین شود؟')) syncNow(true); }
    else if (act === 'acc-prof') { var m = S.meta(); m.city = v('acc-city'); m.share = !!(document.getElementById('acc-share') || {}).checked; S.saveMeta(); S.markDirty(); syncNow(false); }
    else if (act === 'acc-del') { if (!confirm('اطلاعات شما از ابر حذف شود؟')) return; S.deleteCloud().then(function () { setCloud('ok', 'اطلاعات ابری حذف شد.'); }).catch(function (e) { setCloud('err', (e && e.text) || 'اتصال برقرار نشد'); }); }
    else if (act === 'acc-check') {
      cloud.checked = 'در حال بررسی…'; render();
      S.check().then(function (r) { cloud.checked = r.emailOff ? '⚠ سرور در دسترس است اما ورود با ایمیل در Supabase خاموش است. در Supabase: Authentication ← Sign In / Providers ← Email را روشن کنید و Save بزنید.' : '✓ سرور در دسترس است. ' + (r.signupDisabled ? 'ثبت‌نام بسته است. ' : '') + (r.emailOff ? '' : r.autoconfirm ? 'ثبت‌نام بدون تأیید ایمیل فعال است.' : 'ثبت‌نام نیاز به تأیید ایمیل دارد؛ در Supabase گزینهٔ Confirm email را خاموش و Save کنید.'); render(); })
        .catch(function (e) { cloud.checked = '✗ ' + ((e && e.text) || 'سرور در دسترس نیست (فیلترشکن لازم است یا اینترنت قطع است).'); render(); });
    }
  }

  var VIEWS = { acc: viewAcc, qs: viewQs, chg: viewChg, ing: viewIng, menu: viewMenu, sub: viewSub, res: viewRes, set: viewSet };
  var rendering = false;
  function render() {
    if (rendering) { setTimeout(render, 0); return; }   // a blur fired by replacing the page must not start a second render
    rendering = true;
    var v = document.getElementById('view');
    try { var ae = document.activeElement; if (ae && v.contains(ae) && ae.blur) ae.blur(); } catch (e) {}
    try { v.innerHTML = VIEWS[tab](); } finally { rendering = false; }
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.className = b.getAttribute('data-tab') === tab ? 'on' : ''; });
  }

  // ---------- events ----------
  function closest(el, sel) { while (el && el.nodeType === 1) { if (el.matches(sel)) return el; el = el.parentNode; } return null; }
  function find(arr, id) { return arr.filter(function (x) { return x.id === id; })[0]; }

  document.getElementById('tabs').addEventListener('click', function (e) {
    var b = closest(e.target, 'button'); if (!b) return; tab = b.getAttribute('data-tab'); render();
  });

  document.getElementById('view').addEventListener('change', function (e) {
    var t = e.target, f = t.getAttribute('data-f'); if (!f) return;
    var rowEl = closest(t, '[data-id]'), id = rowEl && rowEl.getAttribute('data-id');
    var lineEl = closest(t, '[data-line]'), li = lineEl ? Number(lineEl.getAttribute('data-line')) : -1;
    var n = Number(t.value);
    if (f === 'qs-dish') { qs.dishes[t.getAttribute('data-k')] = t.checked; render(); return; }
    if (f === 'qs-price') { qs.prices[t.getAttribute('data-k')] = t.value; return; }
    if (f === 'qs-sell') { qs.sell[t.getAttribute('data-k')] = t.value; return; }
    if (f === 'up-price') { upd[t.getAttribute('data-k')] = t.value; return; }
    if (f === 'ing-name') find(state.ingredients, id).name = t.value;
    else if (f === 'ing-unit') { find(state.ingredients, id).unit = t.value; }
    else if (f === 'ing-price') { var g = find(state.ingredients, id); if (n !== g.price) { g.prevPrice = g.price; g.price = n; g.history = (g.history || []).concat([{ t: Date.now(), p: n }]); } }
    else if (f === 'ing-trim') find(state.ingredients, id).trimmable = t.checked;
    else if (f === 'it-name') find(state.items, id).name = t.value;
    else if (f === 'it-price') find(state.items, id).price = n;
    else if (f === 'it-sales') find(state.items, id).sales = n;
    else if (f === 'ln-ing') find(state.items, id).lines[li].ingId = t.value;
    else if (f === 'ln-amt') find(state.items, id).lines[li].amount = n;
    else if (f === 'sb-from') find(state.subs, id).fromId = t.value;
    else if (f === 'sb-to') find(state.subs, id).toId = t.value;
    else if (f === 'sb-ratio') find(state.subs, id).ratio = n;
    else if (f === 'sb-share') find(state.subs, id).maxShare = n;
    else if (f.indexOf('st-') === 0) state.settings[f.slice(3)] = n;
    else if (f === 'import') { doImport(t.files[0]); return; }
    save(); render();
  });

  document.getElementById('view').addEventListener('click', function (e) {
    var b = closest(e.target, '[data-act]'); if (!b) return;
    var act = b.getAttribute('data-act');
    var rowEl = closest(b, '[data-id]'), id = rowEl && rowEl.getAttribute('data-id');
    var lineEl = closest(b, '[data-line]'), li = lineEl ? Number(lineEl.getAttribute('data-line')) : -1;
    if (act.indexOf('acc-') === 0) { accAct(act); return; }
    if (act === 'ing-add') state.ingredients.push({ id: uid(), name: '', unit: 'kg', price: 0, trimmable: true });
    else if (act === 'ing-del') { if (!confirm('حذف شود؟')) return; state.ingredients = state.ingredients.filter(function (x) { return x.id !== id; }); state.items.forEach(function (it) { it.lines = it.lines.filter(function (l) { return l.ingId !== id; }); }); state.subs = state.subs.filter(function (s) { return s.fromId !== id && s.toId !== id; }); }
    else if (act === 'it-add') state.items.push({ id: uid(), name: '', price: 0, sales: 0, lines: [] });
    else if (act === 'it-del') { if (!confirm('حذف شود؟')) return; state.items = state.items.filter(function (x) { return x.id !== id; }); }
    else if (act === 'ln-add') { var it = find(state.items, id); if (!state.ingredients.length) return; it.lines.push({ ingId: state.ingredients[0].id, amount: 0 }); }
    else if (act === 'ln-del') find(state.items, id).lines.splice(li, 1);
    else if (act === 'sb-add') { if (state.ingredients.length < 2) { alert('حداقل دو ماده لازم است'); return; } state.subs.push({ id: uid(), fromId: state.ingredients[0].id, toId: state.ingredients[1].id, ratio: 1, maxShare: 50 }); }
    else if (act === 'sb-del') state.subs = state.subs.filter(function (x) { return x.id !== id; });
    else if (act === 'demo') { if (state.items.length && !confirm('داده‌های فعلی با نمونه عوض شود؟')) return; demo(); tab = 'res'; }
    else if (act === 'reset') { if (!confirm('همهٔ داده‌ها پاک شود؟' + (S && S.user() ? ' (اگر وارد حساب هستید، نسخهٔ ابری هم پاک می‌شود.)' : ''))) return; state = JSON.parse(JSON.stringify(DEFAULT)); }
    else if (act === 'export') { doExport(); return; }
    else if (act === 'qs-go') { if (!qsApply()) return; tab = 'res'; }
    else if (act === 'up-go') {
      var any = false;
      state.ingredients.forEach(function (g) { var v = upd[g.id]; if (v === '' || v == null) return; var p = Number(v); if (!(p >= 0) || p === g.price) return; g.prevPrice = g.price; g.price = p; g.history = (g.history || []).concat([{ t: Date.now(), p: p }]); any = true; });
      upd = {}; if (any) state.meta.priceUpdates++; else { alert('قیمت جدیدی وارد نشده است'); return; }
    }
    else if (act === 'share') { save(); render(); var bx = document.getElementById('sharebox'); bx.innerHTML = '<textarea id="sharetxt" rows="8" style="width:100%;margin-top:8px"></textarea><button class="btn" data-act="copy">کپی</button>'; document.getElementById('sharetxt').value = shareText(); return; }
    else if (act === 'copy') { var ta = document.getElementById('sharetxt'); ta.select(); try { document.execCommand('copy'); } catch (e) {} if (navigator.clipboard) { try { navigator.clipboard.writeText(ta.value); } catch (e) {} } return; }
    save(); render();
  });

  function doExport() {
    var blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'menu-repricer-backup.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
  function doImport(file) {
    if (!file) return; var r = new FileReader();
    r.onload = function () { try { state = merge(JSON.parse(r.result)); save(); render(); } catch (e) { alert('فایل معتبر نیست'); } };
    r.readAsText(file);
  }

  function demo() {
    // Illustrative numbers only (tomans); replace with your own prices.
    var I = function (id, name, unit, price, prev, trim) { return { id: id, name: name, unit: unit, price: price, prevPrice: prev, trimmable: trim !== false }; };
    state = merge({
      ingredients: [
        I('mozz', 'پنیر پیتزا (موزارلا)', 'kg', 650000, 500000),
        I('proc', 'پنیر پروسسی', 'kg', 380000, 340000),
        I('dough', 'خمیر', 'kg', 60000, 55000),
        I('sauce', 'سس گوجه', 'kg', 120000, 110000),
        I('chick', 'سینه مرغ', 'kg', 480000, 380000, false),
        I('bread', 'نان ساندویچی', 'piece', 12000, 10000),
        I('oil', 'روغن سرخ‌کردنی', 'l', 250000, 58000 * 1.2)
      ],
      items: [
        { id: 'pz', name: 'پیتزا مخصوص', price: 450000, sales: 300, lines: [{ ingId: 'mozz', amount: 140 }, { ingId: 'dough', amount: 250 }, { ingId: 'sauce', amount: 60 }, { ingId: 'chick', amount: 60 }] },
        { id: 'sw', name: 'ساندویچ مرغ', price: 260000, sales: 500, lines: [{ ingId: 'bread', amount: 1 }, { ingId: 'chick', amount: 110 }, { ingId: 'sauce', amount: 25 }, { ingId: 'oil', amount: 30 }] }
      ],
      subs: [{ id: 's1', fromId: 'mozz', toId: 'proc', ratio: 1, maxShare: 40 }],
      settings: { targetFC: 30, minPortion: 85, roundTo: 5000, elasticity: 1.2, qualityDrop: 3 }
    });
  }

  window.addEventListener('online', function () { if (S && S.user() && S.meta().dirty) syncNow(false); });
  paintStat();
  render();
  if (S && S.user() && navigator.onLine !== false) reconcile(false);
})();
