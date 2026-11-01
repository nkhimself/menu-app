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


  // ---------- small UI helpers ----------
  var TITLES = { qs: 'شروع سریع', res: 'نتیجه و پیشنهاد', chg: 'ثبت قیمت جدید', ing: 'مواد اولیه', menu: 'منوی غذاها', sub: 'جایگزین‌ها', set: 'تنظیمات', acc: 'حساب' };
  function ICON(n) { return '<svg class="ico" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
  function lead(t, sub) { return '<div class="lead"><h2>' + t + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>'; }
  // number input; hint = show the formatted amount under it (for toman prices)
  function numField(f, val, extra, hint) {
    var v = (val == null) ? '' : val;
    return '<div class="fld"><input type="number" min="0" inputmode="decimal" data-f="' + f + '"' + (extra || '') + ' value="' + v + '">' +
      (hint ? '<span class="hint">' + (Number(val) > 0 ? fmt(Number(val)) : '') + '</span>' : '') + '</div>';
  }
  function empty(title, text, actions) {
    var plate = '<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="64" r="40" fill="var(--surface2)"/><circle cx="60" cy="64" r="27" fill="none" stroke="var(--line)" stroke-width="3"/><path d="M18 22v20a5 5 0 0 0 10 0V22M23 22v58M98 22c-8 6-10 18-8 30h8V22zM98 52v28" stroke="var(--mute)" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="60" cy="64" r="9" fill="var(--saffron)"/></svg>';
    return '<div class="sec empty">' + plate + '<h3>' + title + '</h3><p>' + text + '</p>' +
      (actions || []).map(function (a) { return '<button class="btn block' + (a[2] ? ' pri' : '') + '" data-act="' + a[0] + '">' + a[1] + '</button>'; }).join('') + '</div>';
  }
  function unitOpts(sel) {
    return [['kg', 'کیلوگرم'], ['l', 'لیتر'], ['piece', 'عدد']].map(function (u) { return '<option value="' + u[0] + '"' + (u[0] === sel ? ' selected' : '') + '>' + u[1] + '</option>'; }).join('');
  }

  // ---------- views ----------
  function viewIng() {
    var h = lead('قیمت امروز مواد', 'هر وقت قیمتی عوض شد، همین‌جا عدد را اصلاح کنید؛ بقیه خودکار حساب می‌شود.');
    if (!state.ingredients.length) return h + empty('هنوز ماده‌ای ندارید', 'با «شروع سریع» در دو دقیقه آماده شوید، یا مواد را یکی‌یکی وارد کنید.', [['go-qs', 'شروع سریع', true], ['ing-add', 'افزودن ماده'], ['demo', 'نمونهٔ آماده را ببینم']]);
    state.ingredients.forEach(function (g) {
      var ch = '';
      if (g.prevPrice != null && g.prevPrice !== g.price && g.prevPrice > 0) { var p = (g.price / g.prevPrice - 1) * 100; ch = '<span class="chg ' + (p > 0 ? 'up' : 'down') + '">' + (p > 0 ? '+' : '') + pct(p) + '</span> <span class="mute sm">قبلاً ' + fmt(g.prevPrice) + '</span>'; }
      h += '<div class="item" data-id="' + g.id + '">' +
        '<div class="rowx"><div class="grow"><input data-f="ing-name" value="' + esc(g.name) + '" placeholder="نام ماده" aria-label="نام ماده"></div><button class="x" data-act="ing-del" aria-label="حذف ماده">' + ICON('trash') + '</button></div>' +
        '<div class="grid2" style="margin-top:8px"><div><span class="lbl">واحد خرید</span><select data-f="ing-unit" aria-label="واحد">' + unitOpts(g.unit) + '</select></div>' +
        '<div><span class="lbl">' + UNIT[g.unit] + '</span>' + numField('ing-price', g.price, ' aria-label="قیمت"', true) + '</div></div>' +
        '<div class="rowx" style="margin-top:4px;align-items:center;justify-content:space-between"><label class="switch"><input type="checkbox" data-f="ing-trim"' + (g.trimmable !== false ? ' checked' : '') + '> مقدارش قابل کم‌کردن باشد</label><span>' + ch + '</span></div></div>';
    });
    h += '<button class="btn pri block" data-act="ing-add">' + ICON('plus') + 'ماده جدید</button>';
    return h;
  }

  function viewMenu() {
    var h = lead('غذاهای شما', 'برای هر غذا بنویسید چه موادی و چقدر در آن می‌رود. مقدارها را به گرم، میلی‌لیتر یا عدد بنویسید.');
    if (!state.ingredients.length) return h + empty('اول مواد را وارد کنید', 'غذاها از روی مواد اولیه ساخته می‌شوند.', [['go-qs', 'شروع سریع', true], ['go-ing', 'رفتن به مواد اولیه']]);
    var map = L.buildMap(state), tg = state.settings.targetFC;
    state.items.forEach(function (it) {
      var cost = L.itemCost(it, map), fc = it.price > 0 ? cost / it.price * 100 : 0;
      h += '<div class="item" data-id="' + it.id + '">' +
        '<div class="rowx"><div class="grow"><input data-f="it-name" value="' + esc(it.name) + '" placeholder="نام غذا، مثلاً پیتزا مخصوص" aria-label="نام غذا"></div><button class="x" data-act="it-del" aria-label="حذف غذا">' + ICON('trash') + '</button></div>' +
        '<div class="grid2" style="margin-top:8px"><div><span class="lbl">قیمت فروش</span>' + numField('it-price', it.price, ' aria-label="قیمت فروش"', true) + '</div>' +
        '<div><span class="lbl">فروش ماهانه (اختیاری)</span>' + numField('it-sales', it.sales || '', ' aria-label="فروش ماهانه"') + '</div></div>';
      if (it.price > 0 && it.lines.length) h += '<div class="gnote" style="margin:4px 2px 8px"><span>هزینهٔ مواد: <b>' + fmt(cost) + '</b></span><span class="pill ' + (fc > tg ? 'bad' : 'ok') + '">' + pct(fc) + '</span></div>';
      (it.lines || []).forEach(function (l, idx) {
        var g = find(state.ingredients, l.ingId);
        h += '<div class="line" data-line="' + idx + '"><select data-f="ln-ing" aria-label="ماده">' + ingOptions(l.ingId) + '</select>' +
          numField('ln-amt', l.amount, ' aria-label="مقدار"') + '<span class="u">' + (g ? AMT[g.unit] : '') + '</span>' +
          '<button class="x" data-act="ln-del" aria-label="حذف ماده از غذا">' + ICON('close') + '</button></div>';
      });
      h += '<button class="btn sm" data-act="ln-add">' + ICON('plus') + 'ماده در این غذا</button></div>';
    });
    h += '<button class="btn pri block" data-act="it-add">' + ICON('plus') + 'غذای جدید</button>';
    return h;
  }

  function viewSub() {
    var h = lead('جایگزین‌های مجاز', 'مثلاً «به‌جای بخشی از پنیر پیتزا، پنیر پروسسی بگذارم». برنامه فقط از جایگزین‌هایی استفاده می‌کند که شما تأیید کرده‌اید.');
    if (!state.subs.length) h += '<div class="note">هنوز جایگزینی تعریف نشده است. بدون آن، پیشنهادها فقط بالا بردن قیمت یا کم‌کردن مقدار مواد است.</div>';
    state.subs.forEach(function (s) {
      h += '<div class="item" data-id="' + s.id + '"><div class="rowx"><div class="grow stack">' +
        '<div><span class="lbl">به‌جای</span><select data-f="sb-from">' + ingOptions(s.fromId) + '</select></div>' +
        '<div><span class="lbl">این را بگذار</span><select data-f="sb-to">' + ingOptions(s.toId) + '</select></div></div>' +
        '<button class="x" data-act="sb-del" aria-label="حذف جایگزین">' + ICON('trash') + '</button></div>' +
        '<div class="grid2" style="margin-top:10px"><div><span class="lbl">نسبت مقدار</span>' + numField('sb-ratio', s.ratio, ' step="0.1"') + '</div>' +
        '<div><span class="lbl">حداکثر سهم (٪)</span>' + numField('sb-share', s.maxShare, ' max="100"') + '</div></div></div>';
    });
    h += '<button class="btn pri block" data-act="sb-add">' + ICON('plus') + 'جایگزین جدید</button>';
    return h;
  }

  function viewRes() {
    var map = L.buildMap(state), s = state.settings, tgt = s.targetFC / 100;
    if (!state.items.length) return lead('اینجا پیشنهاد قیمت می‌بینید', 'اول غذاها و قیمت موادشان را وارد کنید.') + empty('هنوز غذایی ندارید', 'در دو دقیقه چند غذای پرفروش را بسازید تا ببینید کدام سود کمتری دارد.', [['go-qs', 'شروع سریع', true], ['demo', 'نمونهٔ آماده را ببینم']]);
    var rows = state.items.map(function (it) { return { it: it, r: L.scenarios(it, map, s, state.subs) }; });
    rows.sort(function (a, b) { return ((b.r.over ? 1 : 0) - (a.r.over ? 1 : 0)) || ((isFinite(b.r.fc) ? b.r.fc : 0) - (isFinite(a.r.fc) ? a.r.fc : 0)); });
    var nOver = rows.filter(function (x) { return x.r.over; }).length;
    var h = lead(nOver ? nOver + ' غذا از هدف هزینه بالاتر رفته' : 'همهٔ غذاها در محدودهٔ هدف‌اند', 'هدف شما: هزینهٔ مواد ' + s.targetFC + '٪ قیمت فروش');
    var names = { nothing: 'تغییر نمی‌دهم', raise: 'قیمت را بالا می‌برم', keep: 'قیمت را نگه می‌دارم و مواد را اصلاح می‌کنم' };
    rows.forEach(function (x) {
      var it = x.it, r = x.r, fc = isFinite(r.fc) ? r.fc : 0;
      var scale = Math.max(tgt * 1.7, fc * 1.05, 0.01), w = Math.min(fc / scale, 1) * 100, tp = tgt / scale * 100;
      var unit = r.hasSales ? 'سود ماهانه' : 'سود هر واحد', ex = r.explain;
      h += '<article class="dish' + (r.over ? ' over' : '') + '">' +
        '<div class="leader"><span class="nm">' + esc(it.name || '(بدون نام)') + '</span><span class="dots"></span><span class="pr">' + fmt(it.price) + '</span></div>' +
        '<div class="gauge' + (r.over ? ' over' : '') + '" role="img" aria-label="هزینهٔ مواد ' + pct(fc * 100) + ' از قیمت فروش"><i style="width:' + w.toFixed(1) + '%"></i><u style="right:' + tp.toFixed(1) + '%"></u></div>' +
        '<div class="gnote"><span>هزینهٔ مواد <b>' + pct(fc * 100) + '</b> (' + fmt(r.cost) + ')</span><span>هدف ' + s.targetFC + '٪</span></div>';
      if (!r.over) {
        h += '<div class="okline">' + ICON('check') + 'در محدودهٔ هدف است؛ تغییری لازم نیست.</div>';
      } else {
        var b = r.scenarios[r.best], head = r.best === 'raise' ? 'قیمت را به ' + fmt(b.price) + ' برسانید' : r.best === 'keep' ? 'قیمت را نگه دارید و مواد را اصلاح کنید' : 'تغییر ندهید؛ با افت فروش احتمالی، سود بهتری ندارد';
        h += '<div class="ticket"><b>' + head + '</b><span>' + unit + ': ' + fmt(b.profit) + (r.best !== 'nothing' ? ' (بدون تغییر: ' + fmt(r.scenarios.nothing.profit) + ')' : '') + '</span></div>';
        if (ex.length && ex[0].delta > 0) h += '<p class="cause">بیشترین علت: ' + esc(ex[0].name) + '، ' + pct(ex[0].pct) + ' گران‌تر شده (+' + fmt(ex[0].delta) + ' برای هر واحد)</p>';
        h += '<details><summary>همهٔ گزینه‌ها و جزئیات</summary>';
        ['nothing', 'raise', 'keep'].forEach(function (k) {
          var o = r.scenarios[k];
          h += '<div class="opt' + (r.best === k ? ' best' : '') + '"><div class="t">' + names[k] + (r.best === k ? ' ✓' : '') + '</div>' +
            '<div><span class="k">قیمت</span><span class="v">' + fmt(o.price) + '</span></div><div><span class="k">هزینه</span><span class="v">' + fmt(o.cost) + '</span></div><div><span class="k">' + unit + '</span><span class="v">' + fmt(o.profit) + '</span></div></div>';
        });
        if (r.plan.actions.length) {
          h += '<p style="margin:12px 0 2px"><b>اگر قیمت را نگه دارید:</b></p><ul class="plan">';
          r.plan.actions.forEach(function (a) {
            if (a.type === 'swap') h += '<li>' + Math.round(a.amountFrom) + ' از «' + esc(a.fromName) + '» (' + pct(a.percent) + ' آن) را با ' + Math.round(a.amountTo) + ' از «' + esc(a.toName) + '» عوض کنید؛ صرفه‌جویی ' + fmt(a.saving) + ' برای هر واحد</li>';
            else h += '<li>«' + esc(a.name) + '» را ' + pct(a.percent) + ' کم کنید (از ' + Math.round(a.amountFrom) + ' به ' + Math.round(a.amountTo) + ')؛ صرفه‌جویی ' + fmt(a.saving) + ' برای هر واحد</li>';
          });
          h += '</ul>';
          if (r.plan.needsPriceRise) h += '<div class="note warn">این کم‌کردن‌ها کافی نیست؛ برای رسیدن به هدف، قیمت باید حداقل ' + fmt(r.plan.priceNeeded) + ' شود.</div>';
        } else if (r.plan.needsPriceRise) h += '<div class="note warn">جایگزین یا کم‌کردن مجازی تعریف نشده است؛ فقط افزایش قیمت باقی می‌ماند.</div>';
        h += '</details>';
      }
      h += '</article>';
    });
    h += '<div class="note">پیشنهادها تقریبی‌اند. افت فروش با ضریب حساسیت ' + s.elasticity + ' فرض شده و باید با فروش واقعی خودتان اصلاح شود. تغییر مواد را قبل از اجرا خودتان تأیید کنید.</div>';
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
    var need = qsNeeded(), picked = T.dishes.some(function (d) { return qs.dishes[d.id]; });
    var h = lead('در دو دقیقه آماده شوید', 'غذاهایتان را انتخاب کنید، قیمت‌ها را بنویسید و نتیجه را ببینید. مقدار مواد هر غذا نمونهٔ تقریبی است و بعداً در «منوی غذاها» اصلاح می‌شود.');
    h += '<div class="steps"><i class="on"></i><i class="' + (picked ? 'on' : '') + '"></i><i></i></div>';
    h += '<div class="sec"><h3>چه غذاهایی می‌فروشید؟</h3><div class="tile-grid" style="margin-top:10px">';
    T.dishes.forEach(function (d) {
      h += '<label class="tile"><input type="checkbox" data-f="qs-dish" data-k="' + d.id + '"' + (qs.dishes[d.id] ? ' checked' : '') + '><span class="ck">' + ICON('check') + '</span>' + esc(d.name) + '</label>';
    });
    h += '</div></div>';
    if (need.length) {
      h += '<div class="sec"><h3>قیمت مواد</h3><p class="mute">آخرین قیمت خرید شما، به تومان</p>';
      need.forEach(function (k) {
        var c = T.catalog[k], ex = state.ingredients.filter(function (g) { return g.name === c.name; })[0];
        var v = qs.prices[k] != null ? qs.prices[k] : (ex ? ex.price : '');
        h += '<div class="setrow"><div class="tx"><b>' + esc(c.name) + '</b><span class="mute sm">' + UNIT[c.unit] + '</span></div>' + numField('qs-price', v, ' data-k="' + k + '" aria-label="' + esc(c.name) + '"', true) + '</div>';
      });
      h += '</div><div class="sec"><h3>قیمت فروش هر غذا</h3><p class="mute">به تومان</p>';
      T.dishes.forEach(function (d) {
        if (!qs.dishes[d.id]) return;
        var ex = state.items.filter(function (it) { return it.name === d.name; })[0];
        var v = qs.sell[d.id] != null ? qs.sell[d.id] : (ex ? ex.price : '');
        h += '<div class="setrow"><div class="tx"><b>' + esc(d.name) + '</b></div>' + numField('qs-sell', v, ' data-k="' + d.id + '" aria-label="' + esc(d.name) + '"', true) + '</div>';
      });
      h += '</div><button class="btn pri block" data-act="qs-go">محاسبه و نمایش نتیجه</button>';
    } else h += '<p class="mute" style="text-align:center">حداقل یک غذا را انتخاب کنید.</p>';
    if (state.meta.setupSeconds != null) h += '<p class="mute sm" style="text-align:center;margin-top:12px">آخرین راه‌اندازی: ' + Math.round(state.meta.setupSeconds) + ' ثانیه</p>';
    h += '<div class="sec" style="margin-top:16px"><p class="mute" style="margin:0 0 10px">غذایتان در فهرست نیست؟ از «منوی غذاها» خودتان اضافه کنید.</p><button class="btn block" data-act="demo">نمونهٔ آماده را ببینم</button></div>';
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
    var h = lead('قیمت‌ها عوض شد؟', 'فقط قیمت موادی را که عوض شده بنویسید و یک بار «ثبت» را بزنید. بقیه را خالی بگذارید.');
    if (!state.ingredients.length) return h + empty('هنوز ماده‌ای ندارید', 'اول مواد را وارد کنید.', [['go-qs', 'شروع سریع', true]]);
    h += '<div class="sec">';
    state.ingredients.forEach(function (g) {
      h += '<div class="setrow"><div class="tx"><b>' + esc(g.name) + '</b><span class="mute sm">الان ' + fmt(g.price) + '</span></div>' + numField('up-price', upd[g.id] != null ? upd[g.id] : '', ' data-k="' + g.id + '" placeholder="قیمت جدید" aria-label="قیمت جدید ' + esc(g.name) + '"', true) + '</div>';
    });
    h += '<button class="btn pri block" style="margin-top:12px" data-act="up-go">ثبت قیمت‌های جدید</button></div>';
    var c = L.changes(state);
    if (!c.ingredients.length) return h + '<div class="note">هنوز تغییر قیمتی ثبت نشده است. بعد از ثبت قیمت جدید، اینجا می‌بینید چه چیزی گران شد و کدام غذاها را اذیت کرد.</div>';
    h += '<div class="sec"><h3>چه چیزی عوض شد</h3>';
    c.ingredients.forEach(function (g) {
      h += '<div class="listrow"><div class="tx"><b>' + esc(g.name) + '</b><span class="mute sm" style="display:block">از ' + fmt(g.prev) + ' به ' + fmt(g.now) + '</span></div><span class="chg ' + (g.pct > 0 ? 'up' : 'down') + '">' + (g.pct > 0 ? '+' : '') + pct(g.pct) + '</span></div>';
    });
    h += '</div><div class="sec"><h3>اثر روی غذاها</h3>';
    var any = false;
    c.items.forEach(function (x) {
      if (Math.abs(x.delta) < 1e-9) return; any = true;
      h += '<div class="listrow"><div class="tx"><b>' + esc(x.name) + '</b>' + (x.crossed ? ' <span class="pill bad">از هدف گذشت</span>' : '') +
        '<span class="mute sm" style="display:block">هزینه از ' + fmt(x.costPrev) + ' به ' + fmt(x.costNow) + ' · سهم مواد از ' + pct(x.fcPrev * 100) + ' به ' + pct(x.fcNow * 100) + '</span>' +
        (x.cause ? '<span class="cause" style="display:block">بیشترین علت: ' + esc(x.cause) + '</span>' : '') + '</div></div>';
    });
    if (!any) h += '<p class="mute">قیمت غذاها تغییری نکرد.</p>';
    h += '<p class="mute" style="margin-top:10px">برای دیدن پیشنهاد، به «نتیجه و پیشنهاد» بروید.</p></div>';
    h += '<div class="sec"><button class="btn block" data-act="share">متن خلاصه برای کارکنان یا شریک</button><div id="sharebox"></div></div>';
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
    function f(key, label, hint) { return '<div class="setrow"><div class="tx"><b>' + label + '</b><span class="mute sm">' + hint + '</span></div><div class="fld"><input type="number" step="any" inputmode="decimal" data-f="st-' + key + '" value="' + s[key] + '"></div></div>'; }
    return lead('تنظیمات محاسبه', 'این عددها پیشنهادها را شکل می‌دهند؛ برای کسب‌وکار خودتان تنظیم کنید.') +
      '<div class="sec">' +
      f('targetFC', 'هدف هزینهٔ مواد (٪ قیمت فروش)', 'معمولاً بین ۲۸ تا ۳۵') +
      f('minPortion', 'حداقل مقدار مجاز (٪ مقدار فعلی)', 'مثلاً ۸۵ یعنی تا ۱۵٪ کم‌کردن مجاز است') +
      f('roundTo', 'رند کردن قیمت به (تومان)', 'مثلاً ۱۰۰۰ یا ۵۰۰۰') +
      f('elasticity', 'حساسیت مشتری به گرانی', '۱٫۲ یعنی ۱۰٪ گرانی ≈ ۱۲٪ کاهش فروش') +
      f('qualityDrop', 'افت فروش بر اثر کم‌کردن مواد (٪)', 'اگر کیفیت کمی پایین بیاید') + '</div>' +
      '<div class="sec stack"><h3>اطلاعات</h3>' +
      '<button class="btn block" data-act="export">دریافت پشتیبان (فایل)</button>' +
      '<label class="btn block">بازیابی از فایل<input type="file" accept=".json" data-f="import" hidden></label>' +
      '<button class="btn block" data-act="demo">نمونهٔ پیتزا و ساندویچ</button>' +
      '<button class="btn block danger" data-act="reset">پاک‌کردن همه</button>' +
      '<p class="mute sm">اگر وارد حساب نشده‌اید، اطلاعات فقط روی همین دستگاه می‌ماند؛ گاهی پشتیبان بگیرید.</p></div>' +
      '<div class="sec"><h3>آمار استفاده</h3><p class="mute" style="margin:0">فقط روی همین دستگاه. زمان راه‌اندازی: ' + (state.meta.setupSeconds == null ? '—' : Math.round(state.meta.setupSeconds) + ' ثانیه') + '، دفعات شروع سریع: ' + state.meta.setups + '، دفعات ثبت قیمت جدید: ' + state.meta.priceUpdates + '</p></div>';
  }

  // ---------- account + cloud ----------
  var cloud = { kind: '', msg: '', conflict: false, busy: false, timer: null, checked: null, remote: null };
  var S = window.Sync;
  function when(ts) { try { return new Date(ts).toLocaleString('fa-IR'); } catch (e) { return ts; } }
  function setCloud(kind, msg) { cloud.kind = kind; cloud.msg = msg; paintStat(); if (tab === 'acc') render(); }
  function paintStat() {
    var el = document.getElementById('syncstat'); if (!el) return;
    var who = document.getElementById('who'); if (who) who.textContent = (S && S.user()) ? (S.user().email || '') : 'بدون حساب';
    if (!S || !S.user()) { el.textContent = ''; el.className = 'sync'; return; }
    var t = cloud.conflict ? '⚠ تداخل داده' : cloud.busy ? '… همگام‌سازی' : cloud.kind === 'err' ? '⚠ بدون اتصال' : (S.meta().dirty ? '● ذخیره‌نشده در ابر' : '✓ ذخیره در ابر');
    el.textContent = t; el.className = 'sync' + (cloud.conflict || cloud.kind === 'err' ? ' bad' : '');
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
    if (!S || !S.configured()) return lead('حساب', '') + '<div class="note">اتصال به سرور تنظیم نشده است.</div>';
    var u = S.user();
    if (!u) {
      h += lead('اطلاعاتتان گم نشود', 'بدون حساب هم می‌توانید کار کنید، اما اطلاعات فقط روی همین گوشی می‌ماند. با حساب، اطلاعات در ابر ذخیره می‌شود و با عوض‌کردن گوشی از بین نمی‌رود.');
      h += '<div class="sec stack"><div><label class="lbl" for="acc-email">ایمیل</label><input id="acc-email" type="email" dir="ltr" autocomplete="username" placeholder="name@example.com"></div>' +
        '<div><label class="lbl" for="acc-pass">رمز عبور (حداقل ۸ کاراکتر)</label><input id="acc-pass" type="password" dir="ltr" autocomplete="current-password"></div>' +
        '<div class="grid2"><button class="btn pri" data-act="acc-in">ورود</button><button class="btn" data-act="acc-up">ثبت‌نام</button></div>' +
        (cloud.msg ? '<div class="note">' + esc(cloud.msg) + '</div>' : '') + '</div>';
    } else {
      var m = S.meta();
      h += lead('حساب شما', '') + '<div class="sec stack"><p dir="ltr" style="margin:0;text-align:right;font-weight:700">' + esc(u.email || '') + '</p>' +
        '<p style="margin:0">' + (cloud.conflict ? '<span class="pill bad">تداخل داده</span>' : cloud.busy ? 'در حال همگام‌سازی…' : m.dirty ? 'تغییرات هنوز در ابر ذخیره نشده‌اند.' : '<span class="pill ok">همگام با ابر</span>') + '</p>' +
        (cloud.msg ? '<p class="mute" style="margin:0">' + esc(cloud.msg) + '</p>' : '') +
        (cloud.conflict ? '<div class="grid2"><button class="btn" data-act="acc-usecloud">استفاده از نسخهٔ ابر</button><button class="btn danger" data-act="acc-usethis">جایگزین‌کردن ابر با این دستگاه</button></div>' : '') +
        '<div class="grid2"><button class="btn" data-act="acc-sync">همگام‌سازی الان</button><button class="btn" data-act="acc-out">خروج</button></div></div>' +
        '<div class="sec stack"><h3>مشخصات کسب‌وکار</h3>' +
        '<div><label class="lbl" for="acc-city">شهر</label><input id="acc-city" value="' + esc(m.city || '') + '" placeholder="مثلاً مشهد"></div>' +
        '<label class="switch" style="align-items:flex-start"><input type="checkbox" id="acc-share"' + (m.share ? ' checked' : '') + '> <span>اجازه می‌دهم در آینده قیمت مواد من ناشناس برای مقایسهٔ قیمت بین مغازه‌ها استفاده شود. در این نسخه هنوز هیچ دادهٔ شما با کسی به اشتراک گذاشته نمی‌شود.</span></label>' +
        '<button class="btn" data-act="acc-prof">ذخیرهٔ مشخصات</button></div>' +
        '<div class="sec stack"><h3>حذف اطلاعات ابری</h3><p class="mute" style="margin:0">اطلاعات شما در ابر پاک می‌شود؛ نسخهٔ روی این گوشی می‌ماند. برای حذف کامل خود حساب، به ما پیام دهید.</p><button class="btn danger" data-act="acc-del">حذف اطلاعات من از ابر</button></div>';
    }
    h += '<div class="sec stack"><h3>بررسی اتصال به سرور</h3><button class="btn" data-act="acc-check">بررسی اتصال</button><p class="mute" id="chk" style="margin:0">' + (cloud.checked || '') + '</p></div>';
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
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { var on = b.getAttribute('data-tab') === tab; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    var ti = document.getElementById('title'); if (ti) ti.textContent = TITLES[tab] || 'قیمت‌گذار منو';
    var fb = document.getElementById('fab'); if (fb) fb.classList.toggle('show', tab === 'res' && state.items.length > 0);
  }

  // ---------- events ----------
  function closest(el, sel) { while (el && el.nodeType === 1) { if (el.matches(sel)) return el; el = el.parentNode; } return null; }
  function find(arr, id) { return arr.filter(function (x) { return x.id === id; })[0]; }

  function drawer(open) {
    document.body.classList.toggle('open', open);
    var mb = document.getElementById('menuBtn'); mb.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { var on = document.querySelector('#tabs button.on') || document.querySelector('#tabs button'); if (on) setTimeout(function () { on.focus(); }, 50); }
    else mb.focus();
  }
  document.getElementById('menuBtn').addEventListener('click', function () { drawer(!document.body.classList.contains('open')); });
  document.getElementById('scrim').addEventListener('click', function () { drawer(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('open')) drawer(false); });
  document.getElementById('fab').addEventListener('click', function () { tab = 'chg'; render(); window.scrollTo(0, 0); });
  document.getElementById('tabs').addEventListener('click', function (e) {
    var b = closest(e.target, 'button'); if (!b) return; tab = b.getAttribute('data-tab'); render(); document.body.classList.remove('open'); document.getElementById('menuBtn').setAttribute('aria-expanded', 'false'); window.scrollTo(0, 0);
  });
  // show the formatted amount under price fields while typing
  document.getElementById('view').addEventListener('input', function (e) {
    var t = e.target; if (t.type !== 'number' || !t.parentNode) return;
    var h = t.parentNode.querySelector('.hint'); if (h) h.textContent = Number(t.value) > 0 ? fmt(Number(t.value)) : '';
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
    if (act.indexOf('go-') === 0) { tab = act.slice(3); render(); window.scrollTo(0, 0); return; }
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

// offline support (registered here so the page needs no inline script)
if ('serviceWorker' in navigator) { window.addEventListener('load', function () { try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {} }); }
