(function () {
  'use strict';
  var KEY = 'repricer.v1';   // same storage key as the old version, so old data is kept
  var NAME = 'ترازینا';    // working name: change it here and in index.html / manifest.json
  var L = window.Logic, T = window.Templates, S = window.Sync, CARD = window.Card;
  var state = load();
  var tab = state.profile.done ? 'prods' : 'setup';
  var cur = null;                       // product open in the detail screen
  var upd = {};                         // typed new prices on "register new prices"
  var q = { ing: '', pk: '', prod: '' };
  var scaleK = 1;
  var wz = null;                        // setup wizard state
  var qc = { lines: [], other: 0, n: 1 };
  var focusSel = null;
  var cardOpt = { theme: 'tarazina', pick: null, wholesale: false, photos: true, cal: false };
  var urls = [];

  // ---------- light / dark theme (device setting: auto, light or dark) ----------
  var THEME_KEY = 'tarazina.theme';
  function themePref() { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function isDarkNow() { var p = themePref(); if (p === 'dark') return true; if (p === 'light') return false; try { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) { return false; } }
  function applyTheme() {
    var p = themePref(), r = document.documentElement;
    if (p === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', p);
    var dk = isDarkNow(); if (dk) r.setAttribute('data-dark', '1'); else r.removeAttribute('data-dark');
    Array.prototype.forEach.call(document.querySelectorAll('meta[name="theme-color"]'), function (m) { m.setAttribute('content', dk ? '#101819' : '#0E6B6F'); });
  }
  function setTheme(p) { try { localStorage.setItem(THEME_KEY, p); } catch (e) {} applyTheme(); }
  applyTheme();
  try { var mq = window.matchMedia('(prefers-color-scheme: dark)'); var onMq = function () { if (themePref() === 'auto') applyTheme(); }; if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq); } catch (e) {}

  // ---------- phone back button: go to the previous page instead of leaving the app ----------
  var navSig = '', navPop = false, navFirst = true;
  function navState() { return { tab: tab, cur: cur, step: (wz && tab === 'setup') ? wz.step : 0 }; }
  function navTrack() {
    var sig = tab + '|' + (cur || '') + '|' + ((wz && tab === 'setup') ? wz.step : 0);
    if (sig !== navSig) {
      try { if (navFirst || navPop) { if (navFirst) history.replaceState(navState(), ''); } else history.pushState(navState(), ''); } catch (e) {}
      navSig = sig;
    }
    navFirst = false; navPop = false;
  }
  var POLICY_V = '1.0', VER = '0.10.0';
  var gf = { mode: 'up', first: '', last: '', phone: '', city: '', pass: '', agree: false, msg: '' };   // sign-up form

  // ---------- storage ----------
  function load() {
    try { var s = localStorage.getItem(KEY); if (s) return L.normalize(JSON.parse(s)); } catch (e) {}
    return L.blank();
  }
  function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function save() { saveLocal(); if (S && S.user()) { S.markDirty(); scheduleSync(); } notifSoon(); }
  function now() { return Date.now(); }
  function touch(o) { o.u = now(); return o; }
  function touchSettings() { state.su = now(); }
  function gone(id) { state.del[id] = now(); }
  function uid() { return 'i' + Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 4); }

  // ---------- small helpers ----------
  function fmt(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }
  function pct(n) { return (Math.round(n * 10) / 10) + '%'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function find(arr, id) { return arr.filter(function (x) { return x.id === id; })[0]; }
  function closest(el, sel) { while (el && el.nodeType === 1) { if (el.matches(sel)) return el; el = el.parentNode; } return null; }
  function ICON(n) { return '<svg class="ico" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
  function lead(t, sub) { return '<div class="lead"><h2>' + t + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>'; }
  function curType() { return T.types.filter(function (t) { return t.id === state.profile.type; })[0] || null; }
  function W() { var t = curType(); return { one: (t && t.one) || 'محصول', many: (t && t.many) || 'محصولات' }; }
  function full() { return state.settings.mode === 'full'; }
  function C() { return L.ctx(state); }
  var UNIT = { kg: 'هر کیلوگرم', l: 'هر لیتر', piece: 'هر عدد' };
  var AMT = { kg: 'گرم', l: 'میلی‌لیتر', piece: 'عدد' };
  var UNAME = { kg: 'کیلوگرم', l: 'لیتر', piece: 'عدد' };

  // optional fields are shown when switched on in the settings, or when the data already uses them
  function showSw(k) {
    if (state.settings.sw[k]) return true;
    if (k === 'loss') return state.ingredients.some(function (g) { return L.num(g.loss) > 0; });
    if (k === 'batch') return state.items.some(function (i) { return i.yield > 1; });
    if (k === 'sizes') return state.items.some(function (i) { return (i.sizes || []).length; });
    if (k === 'weight') return state.items.some(function (i) { return i.mode === 'kg'; });
    return false;
  }

  function numField(f, val, extra, hint) {
    var v = (val == null) ? '' : val;
    return '<div class="fld"><input type="number" min="0" step="any" inputmode="decimal" data-f="' + f + '"' + (extra || '') + ' value="' + v + '">' +
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
  function ingOptions(sel) {
    return state.ingredients.map(function (i) { return '<option value="' + i.id + '"' + (i.id === sel ? ' selected' : '') + '>' + esc(i.name || '(بدون نام)') + '</option>'; }).join('');
  }
  function packOptions(sel) {
    return state.packs.map(function (i) { return '<option value="' + i.id + '"' + (i.id === sel ? ' selected' : '') + '>' + esc(i.name || '(بدون نام)') + '</option>'; }).join('');
  }
  function wasteOptions(sel) {
    return state.wastes.map(function (i) { return '<option value="' + i.id + '"' + (i.id === sel ? ' selected' : '') + '>' + esc(i.name || '(بدون نام)') + '</option>'; }).join('');
  }
  function unitWord(it) { return it.mode === 'kg' ? 'هر کیلوگرم' : 'هر عدد'; }

  // set an ingredient price and keep its history ("rose 12% in 30 days")
  function setPrice(g, p) {
    p = L.num(p);
    if (p === g.price) return false;
    var t = now();
    if (g.price > 0) { g.prevPrice = g.price; if (!(g.history || []).length) g.history = [{ t: g.u || t - 864e5, p: g.price }]; }
    g.price = p; g.history = (g.history || []).concat([{ t: t, p: p }]).slice(-40);
    touch(g); state.meta.lastPriceUpdate = t; return true;
  }
  function applyPack(g) {   // recompute the price per kg / l / piece from the pack price
    if (L.num(g.packQty) > 0) setPrice(g, L.packUnitPrice(g.packPrice, g.packQty));
  }

  // ---------- titles ----------
  function titleOf() {
    var w = W();
    var t = { prods: w.many, prod: w.one, ings: 'مواد اولیه', packs: 'بسته‌بندی', quick: 'قیمت سریع', setup: 'راه‌اندازی', chg: 'ثبت قیمت جدید', res: 'پیشنهاد قیمت', cards: 'کارت و فهرست قیمت', sub: 'جایگزین‌ها', set: 'تنظیمات', acc: 'حساب', help: 'راهنما', waste: 'ضایعات قابل فروش', shop: 'لیست خرید', sales: 'ثبت فروش', debts: 'بدهی و طلب', labels: 'برچسب و ارزش غذایی', label: 'ساخت برچسب', policy: 'سیاست‌ها و شرایط', gate: gf.mode === 'in' ? 'ورود' : (gateMode() === 'prof' ? 'تکمیل مشخصات' : 'ساخت حساب') };
    return t[tab] || NAME;
  }

  // ======================================================= products list
  function reminderBanner() {
    var d = L.num(state.settings.remindDays), last = state.meta.lastPriceUpdate;
    if (!state.ingredients.length || !last || d <= 0) return '';
    var days = Math.floor((now() - last) / 864e5);
    if (days < d) return '';
    return '<div class="banner">' + ICON('bell') + '<span>قیمت مواد ' + days + ' روز است که به‌روز نشده. قیمت‌ها را بررسی کنید.</span><button class="btn sm pri" data-act="go-chg">ثبت قیمت</button></div>';
  }
  function prodCards() {
    var c = C(), tg = L.num(state.settings.targetFC), term = q.prod.trim();
    var rows = state.items.filter(function (it) { return !term || (it.name || '').indexOf(term) >= 0; });
    var h = '';
    rows.forEach(function (it) {
      var cost = L.unitCost(it, c), P = L.num(it.price), fc = P > 0 ? cost / P * 100 : 0, over = P > 0 && fc > L.itemTarget(it, c) + 1e-9;
      var sug = L.suggest(it, c, cost);
      h += '<button class="pcard' + (over ? ' over' : '') + '" data-act="open" data-id="' + it.id + '"><div class="top"><span class="nm">' + esc(it.name || '(بدون نام)') + '</span><span class="pr">' + (P > 0 ? fmt(P) : '—') + '</span></div>' +
        '<div class="meta"><span>هزینه <b>' + fmt(cost) + '</b></span>' + (P > 0 ? '<span class="chip ' + (over ? 'up' : 'down') + '">' + pct(fc) + '</span>' : '') +
        (it.mode === 'kg' ? '<span class="chip">وزنی</span>' : '') + (cost > 0 ? '<span class="chip sun">پیشنهاد ' + fmt(sug) + '</span>' : '') + '</div></button>';
    });
    if (!rows.length && term) h = '<p class="mute" style="text-align:center">موردی پیدا نشد.</p>';
    return h;
  }
  var DEMO_IDS = { pz: 1, sw: 1, mozz: 1, proc: 1, dough: 1, sauce: 1, chick: 1, bread: 1, oil: 1, bx: 1 };   // ids used by the built-in demo (also marks demo data made by older versions)
  function isSample(x) { return x.sample === false ? false : !!(x.sample || DEMO_IDS[x.id]); }
  function hasSample() { return [].concat(state.items, state.ingredients, state.packs).some(isSample); }
  function deleteSamples() {
    state.items.filter(isSample).forEach(function (x) { gone(x.id); });
    state.items = state.items.filter(function (x) { return !isSample(x); });
    var usedI = {}, usedP = {};
    state.items.forEach(function (x) { (x.lines || []).forEach(function (l) { usedI[l.ingId] = 1; }); (x.pk || []).forEach(function (l) { usedP[l.packId] = 1; }); });
    state.ingredients.filter(function (x) { return isSample(x) && !usedI[x.id]; }).forEach(function (x) { delIng(x.id); });
    state.packs.filter(function (x) { return isSample(x) && !usedP[x.id]; }).forEach(function (x) { delPack(x.id); });
    [].concat(state.items, state.ingredients, state.packs).forEach(function (x) { if (isSample(x)) { x.sample = false; touch(x); } });
  }
  function viewProds() {
    var w = W(), c = C();
    var h = lead(w.many, 'روی هر مورد بزنید تا مواد، قیمت پیشنهادی و جزئیات را ببینید.');
    h += reminderBanner() + debtBanner();
    if (hasSample()) h += '<div class="banner">' + ICON('trash') + '<span>نمونه‌های آماده در برنامه هست.</span><button class="btn sm danger" data-act="sample-del">حذف نمونه‌ها</button></div>';
    if (!state.items.length) {
      return h + empty('هنوز ' + w.one + 'ی ندارید', 'با دکمهٔ + یکی بسازید، یا با راه‌اندازی، مواد و نمونه‌ها را آماده کنید.', [['new-item', 'ساخت ' + w.one + ' جدید', true], ['go-setup', 'راه‌اندازی بر اساس نوع کسب‌وکار'], ['demo', 'نمونهٔ آماده را ببینم']]);
    }
    var nOver = state.items.filter(function (it) { return L.num(it.price) > 0 && L.unitCost(it, c) / it.price * 100 > L.itemTarget(it, c) + 1e-9; }).length;
    h += '<div class="note" style="margin-top:0">' + (nOver ? '<b>' + nOver + '</b> مورد از هدف هزینه بالاتر است. ' + '<a href="#" data-act="go-res">پیشنهادها</a>' : 'همه در محدودهٔ هدف‌اند.') + '</div>';
    if (state.items.length > 6) h += '<input class="search" data-f="q-prod" type="search" placeholder="جستجو" value="' + esc(q.prod) + '" aria-label="جستجو">';
    h += '<div id="list">' + prodCards() + '</div>';
    return h;
  }

  // ======================================================= product detail
  function donut(p) {
    var parts = [{ k: 'مواد', v: p.ing, c: 'var(--brand)' }, { k: 'بسته‌بندی', v: p.pack, c: 'var(--saffron)' }, { k: 'دستمزد', v: p.lab, c: '#5B84C4' }, { k: 'سربار', v: p.ovh, c: '#B07BC2' }].filter(function (x) { return x.v > 1e-9; });
    var tot = parts.reduce(function (a, x) { return a + x.v; }, 0);
    if (tot <= 0) return '';
    var off = 25, svg = '<svg viewBox="0 0 36 36" role="img" aria-label="سهم هر بخش از هزینه"><circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--surface2)" stroke-width="5"/>', lg = '';
    parts.forEach(function (x) {
      var pc = x.v / tot * 100;
      svg += '<circle cx="18" cy="18" r="15.9155" fill="none" stroke="' + x.c + '" stroke-width="5" stroke-dasharray="' + pc.toFixed(2) + ' ' + (100 - pc).toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) + '"/>';
      off -= pc;
      lg += '<div><i style="background:' + x.c + '"></i>' + x.k + '<span>' + Math.round(pc) + '% · ' + fmt(x.v) + '</span></div>';
    });
    return '<div class="donutbox">' + svg + '</svg><div class="legend">' + lg + '</div></div>';
  }

  function scaleHTML(it) {
    var c = C(), k = scaleK, h = '';
    h += '<div class="gnote"><span>ضریب: <b>×' + k + '</b></span><span>تعداد: <b>' + (it.mode === 'kg' ? '' : fmt(it.yield * k)) + '</b></span></div>';
    (it.lines || []).forEach(function (l) {
      var g = c.ing[l.ingId]; if (!g) return;
      h += '<div class="listrow" style="padding:8px 0"><div class="tx">' + esc(g.name) + '</div><b style="direction:ltr">' + (Math.round(L.num(l.amount) * k * 10) / 10) + ' ' + AMT[g.unit] + '</b></div>';
    });
    h += '<div class="gnote" style="margin-top:6px"><span>هزینهٔ مواد این دسته</span><b>' + fmt(L.batchIng(it, c) * k) + '</b></div>';
    return h;
  }

  function viewProd() {
    var it = find(state.items, cur), w = W();
    if (!it) { tab = 'prods'; return viewProds(); }
    var c = C(), r = L.scenarios(it, c, state.subs), p = L.parts(it, c), cost = r.cost, P = L.num(it.price);
    var h = '<button class="back" data-act="go-prods">' + ICON('back') + w.many + '</button>';
    // result first: the answer is the largest thing on the screen
    h += '<div class="hero' + (r.over ? ' over' : '') + '"><div class="k">قیمت پیشنهادی ' + unitWord(it) + ' (هدف هزینه ' + pct(r.target) + ')</div>' +
      '<div class="big">' + fmt(r.suggested) + '<small>تومان</small></div><div class="row">' +
      '<div>هزینه<b>' + fmt(cost) + '</b></div>' +
      '<div>سود در قیمت فعلی<b>' + (P > 0 ? fmt(P - cost) : '—') + '</b></div>' +
      '<div>سهم هزینه<b>' + (P > 0 ? pct(r.fc * 100) : '—') + '</b></div></div></div>';

    h += '<div class="sec stack"><div><label class="lbl">نام</label><input data-f="it-name" data-id="' + it.id + '" value="' + esc(it.name) + '" placeholder="نام ' + w.one + '"></div>';
    if (showSw('weight')) {
      h += '<div><span class="lbl">روش فروش</span><div class="seg"><button data-act="it-mode-piece" class="' + (it.mode === 'piece' ? 'on' : '') + '">عددی</button><button data-act="it-mode-kg" class="' + (it.mode === 'kg' ? 'on' : '') + '">وزنی (کیلویی)</button></div></div>';
    }
    h += '<div class="grid2"><div><span class="lbl">قیمت فروش ' + unitWord(it) + '</span>' + numField('it-price', it.price, ' aria-label="قیمت فروش"', true) + '</div>' +
      '<div><span class="lbl">فروش ماهانه (اختیاری)</span>' + numField('it-sales', it.sales || '', ' aria-label="فروش ماهانه"') + '</div></div>';
    if (it.mode === 'kg') h += '<div><span class="lbl">کاهش وزن بعد از پخت (%)</span>' + numField('it-cook', it.cookLoss || '', ' max="90"') + '<p class="hintline">وزن مواد را قبل و بعد از پخت بسنجید. قیمت بر اساس وزن نهایی حساب می‌شود.</p></div>';
    else if (showSw('batch')) h += '<div><span class="lbl">این دستور چند عدد می‌شود؟</span>' + numField('it-yield', it.yield > 1 ? it.yield : '', ' placeholder="1"') + '<p class="hintline">مقدار مواد پایین برای کل این دستور است. هزینهٔ هر عدد از تقسیم حساب می‌شود. اگر مقدار مواد را برای یک عدد نوشته‌اید، همان 1 را بگذارید یا خالی بگذارید.</p></div>';
    h += '</div>';

    // ingredients
    h += '<div class="sec" data-grp="lines"><h3>مواد' + (it.mode === 'kg' || it.yield > 1 ? ' (کل دستور)' : '') + '</h3>';
    if (!state.ingredients.length) h += '<p class="mute">اول از بخش «مواد اولیه» ماده‌ها را وارد کنید.</p><button class="btn block" data-act="go-ings">رفتن به مواد اولیه</button>';
    else {
      (it.lines || []).forEach(function (l, idx) {
        var g = c.ing[l.ingId];
        h += '<div class="line" data-line="' + idx + '"><select data-f="ln-ing" aria-label="ماده">' + ingOptions(l.ingId) + '</select>' + numField('ln-amt', l.amount, ' aria-label="مقدار"') +
          '<span class="u">' + (g ? AMT[g.unit] : '') + (g ? '<br><span class="mini">' + fmt(L.lineCost(g, l.amount)) + '</span>' : '') + '</span>' +
          '<button class="x" data-act="ln-del" aria-label="حذف ماده از این ' + w.one + '">' + ICON('close') + '</button></div>';
      });
      h += '<button class="btn sm" data-act="ln-add">' + ICON('plus') + 'ماده</button>';
    }
    h += '</div>';

    // packaging
    h += '<div class="sec pk" data-grp="pk"><h3>بسته‌بندی (برای هر فروش)</h3>';
    if (!state.packs.length) h += '<p class="mute">ظرف، جعبه یا کیسه‌ای ثبت نکرده‌اید.</p><button class="btn block" data-act="go-packs">رفتن به بسته‌بندی</button>';
    else {
      (it.pk || []).forEach(function (l, idx) {
        h += '<div class="line" data-line="' + idx + '"><select data-f="pk-sel" aria-label="بسته‌بندی">' + packOptions(l.packId) + '</select>' + numField('pk-qty', l.qty, ' aria-label="تعداد"') +
          '<button class="x" data-act="pk-del" aria-label="حذف">' + ICON('close') + '</button></div>';
      });
      h += '<button class="btn sm" data-act="pk-add">' + ICON('plus') + 'بسته‌بندی</button>';
    }
    h += '</div>';

    // sellable waste
    h += '<div class="sec" data-grp="wl"><h3>ضایعات قابل فروش (کل دستور)</h3>';
    if (!state.wastes.length) h += '<p class="mute">اگر از کار چیزی می‌ماند که می‌فروشید (استخوان، پوست، روغن...)، اول در منو بخش «ضایعات قابل فروش» آن را ثبت کنید.</p><button class="btn block" data-act="go-waste">رفتن به ضایعات</button>';
    else {
      (it.waste || []).forEach(function (l, idx) {
        var wz1 = c.ws[l.wasteId];
        h += '<div class="line" data-line="' + idx + '"><select data-f="wl-sel" aria-label="ضایعات">' + wasteOptions(l.wasteId) + '</select>' + numField('wl-amt', l.amount, ' aria-label="مقدار"') +
          '<span class="u">' + (wz1 ? (wz1.unit === 'piece' ? 'عدد' : 'گرم') : '') + (wz1 ? '<br><span class="mini">' + fmt(L.wasteCredit({ waste: [l] }, c)) + '</span>' : '') + '</span>' +
          '<button class="x" data-act="wl-del" aria-label="حذف">' + ICON('close') + '</button></div>';
      });
      h += '<button class="btn sm" data-act="wl-add">' + ICON('plus') + 'ضایعات</button>';
      if (p.wst > 0) h += '<p class="hintline">فروش ضایعات از هزینهٔ هر واحد <b>' + fmt(p.wst) + '</b> تومان کم کرده است.</p>';
    }
    h += '</div>';

    // full mode: labour, wholesale, own target
    if (full()) {
      h += '<div class="sec stack"><h3>دستمزد و فروش عمده</h3>' +
        '<div><span class="lbl">زمان کار برای کل این دستور (دقیقه)</span>' + numField('it-min', it.minutes || '') + '<p class="hintline">دستمزد ساعتی و درصد سربار را در تنظیمات می‌نویسید' + (L.num(state.settings.wage) <= 0 ? ' (الان صفر است)' : '') + '.</p></div>' +
        '<div class="grid2"><div><span class="lbl">قیمت عمده (اختیاری)</span>' + numField('it-whole', it.wholesale || '', '', true) + '</div>' +
        '<div><span class="lbl">هدف هزینه برای این مورد (%)</span>' + numField('it-tgt', it.tgt || '', ' placeholder="' + state.settings.targetFC + '"') + '</div></div>';
      if (L.num(it.wholesale) > 0) { var wh = L.wholesale(it, c); h += '<div class="gnote"><span>در قیمت عمده: سهم هزینه <b>' + pct(wh.fc * 100) + '</b></span><span>سود هر واحد <b>' + fmt(wh.profit) + '</b></span></div>'; }
      h += '</div>';
    } else {
      h += '<div class="note">برای حساب دستمزد، سربار و قیمت عمده، «حالت کامل» را در تنظیمات روشن کنید.</div>';
    }

    // sizes
    if (showSw('sizes')) {
      h += '<div class="sec sizes" data-grp="sz"><h3>اندازه‌ها (کوچک، بزرگ...)</h3><p class="hintline">ضریب یعنی چند برابر مقدار پایه. مثلاً بزرگ = 1.5</p>';
      var rows = L.sizeRows(it, c);
      (it.sizes || []).forEach(function (z, idx) {
        var rr = rows[idx];
        h += '<div class="line" data-line="' + idx + '"><input data-f="sz-name" value="' + esc(z.name) + '" placeholder="نام" aria-label="نام اندازه">' + numField('sz-factor', z.factor, ' step="0.05" aria-label="ضریب"') + numField('sz-price', z.price, ' aria-label="قیمت"') +
          '<button class="x" data-act="sz-del" aria-label="حذف">' + ICON('close') + '</button></div>' +
          '<div class="gnote" style="margin:-4px 2px 8px"><span>هزینه <b>' + fmt(rr.cost) + '</b> · سهم <b>' + pct(rr.fc * 100) + '</b></span><span>پیشنهاد <b>' + fmt(rr.suggested) + '</b></span></div>';
      });
      h += '<button class="btn sm" data-act="sz-add">' + ICON('plus') + 'اندازه</button></div>';
    }

    // cost share
    var dn = donut(p);
    if (dn) h += '<div class="sec"><h3>هزینه از چه چیزی است؟</h3>' + dn + '</div>';

    h += photoSection(it) + nutSection(it);

    // scaling
    if ((it.lines || []).length) {
      h += '<div class="sec"><h3>مقیاس دسته</h3><p class="hintline">برای وقتی که بیشتر یا کمتر از یک دستور می‌پزید. چیزی ذخیره نمی‌شود.</p>' +
        '<input class="rng" type="range" min="0.5" max="10" step="0.5" value="' + scaleK + '" data-f="scale" aria-label="ضریب دسته"><div id="scalebox">' + scaleHTML(it) + '</div></div>';
    }

    // suggestions
    if (r.over) {
      var b = r.scenarios[r.best], names = { nothing: 'تغییر نمی‌دهم', raise: 'قیمت را بالا می‌برم', keep: 'قیمت را نگه می‌دارم و مواد را اصلاح می‌کنم' };
      var unit = r.hasSales ? 'سود ماهانه' : 'سود هر واحد';
      h += '<div class="sec"><h3>چه کنم؟</h3><div class="ticket"><b>' + (r.best === 'raise' ? 'قیمت را به ' + fmt(b.price) + ' برسانید' : r.best === 'keep' ? 'قیمت را نگه دارید و مواد را اصلاح کنید' : 'تغییر ندهید؛ با افت فروش احتمالی، سود بهتری ندارد') + '</b><span>' + unit + ': ' + fmt(b.profit) + (r.best !== 'nothing' ? ' (بدون تغییر: ' + fmt(r.scenarios.nothing.profit) + ')' : '') + '</span></div>';
      if (r.explain.length && r.explain[0].delta > 0) h += '<p class="cause">بیشترین علت: ' + esc(r.explain[0].name) + '، ' + pct(r.explain[0].pct) + ' گران‌تر شده</p>';
      h += '<details><summary>همهٔ گزینه‌ها</summary>';
      ['nothing', 'raise', 'keep'].forEach(function (k) {
        var o = r.scenarios[k];
        h += '<div class="opt' + (r.best === k ? ' best' : '') + '"><div class="t">' + names[k] + (r.best === k ? ' ✓' : '') + '</div><div><span class="k">قیمت</span><span class="v">' + fmt(o.price) + '</span></div><div><span class="k">هزینه</span><span class="v">' + fmt(o.cost) + '</span></div><div><span class="k">' + unit + '</span><span class="v">' + fmt(o.profit) + '</span></div></div>';
      });
      if (r.plan.actions.length) {
        h += '<p style="margin:12px 0 2px"><b>اگر قیمت را نگه دارید:</b></p><ul class="plan">';
        r.plan.actions.forEach(function (a) {
          if (a.type === 'swap') h += '<li>' + Math.round(a.amountFrom) + ' از «' + esc(a.fromName) + '» (' + pct(a.percent) + ' آن) را با ' + Math.round(a.amountTo) + ' از «' + esc(a.toName) + '» عوض کنید؛ صرفه‌جویی ' + fmt(a.saving) + '</li>';
          else h += '<li>«' + esc(a.name) + '» را ' + pct(a.percent) + ' کم کنید (از ' + Math.round(a.amountFrom) + ' به ' + Math.round(a.amountTo) + ')؛ صرفه‌جویی ' + fmt(a.saving) + '</li>';
        });
        h += '</ul>';
        if (r.plan.needsPriceRise) h += '<div class="note warn">این کم‌کردن‌ها کافی نیست؛ قیمت باید حداقل ' + fmt(r.plan.priceNeeded) + ' شود.</div>';
      } else if (r.plan.needsPriceRise) h += '<div class="note warn">جایگزین یا کم‌کردن مجازی تعریف نشده؛ فقط افزایش قیمت باقی می‌ماند.</div>';
      h += '</details></div>';
    }

    h += '<div class="sec stack"><button class="btn block" data-act="card-one">' + ICON('share') + 'کارت قیمت برای اینستاگرام و ...</button>' +
      '<div class="grid2"><button class="btn" data-act="it-dup">' + ICON('copy') + 'کپی</button><button class="btn danger" data-act="it-del">' + ICON('trash') + 'حذف</button></div></div>';
    return h;
  }

  // ======================================================= ingredients
  function buySelect(g) {
    var list = T.packs[g.unit] || [], sel = 'base';
    if (L.num(g.packQty) > 0) { sel = 'custom'; list.forEach(function (p, i) { if (Math.abs(p[1] - g.packQty) < 1e-9) sel = 'p' + i; }); }
    var o = '<option value="base"' + (sel === 'base' ? ' selected' : '') + '>' + UNIT[g.unit] + '</option>';
    list.forEach(function (p, i) { o += '<option value="p' + i + '"' + (sel === 'p' + i ? ' selected' : '') + '>' + p[0] + '</option>'; });
    o += '<option value="custom"' + (sel === 'custom' ? ' selected' : '') + '>بسته با اندازهٔ دلخواه</option>';
    return o;
  }
  function ingRow(g) {
    var ch = '';
    if (g.prevPrice != null && g.prevPrice !== g.price && g.prevPrice > 0) { var pp = (g.price / g.prevPrice - 1) * 100; ch += '<span class="chg ' + (pp > 0 ? 'up' : 'down') + '">' + (pp > 0 ? '+' : '') + pct(pp) + '</span> '; }
    var rs = L.rise(g); if (rs && Math.abs(rs.pct) >= 1) ch += '<span class="chip ' + (rs.pct > 0 ? 'up' : 'down') + '">' + (rs.pct > 0 ? '+' : '') + pct(rs.pct) + ' در ' + rs.days + ' روز</span>';
    var packMode = L.num(g.packQty) > 0;
    var h = '<div class="item" data-id="' + g.id + '">' +
      '<div class="rowx"><div class="grow"><input data-f="ing-name" value="' + esc(g.name) + '" placeholder="نام ماده" aria-label="نام ماده"></div><button class="x" data-act="ing-del" aria-label="حذف ماده">' + ICON('trash') + '</button></div>' +
      '<div class="grid2" style="margin-top:8px"><div><span class="lbl">قیمت بر اساس</span><select data-f="ing-unit" aria-label="واحد">' + unitOpts(g.unit) + '</select></div>' +
      '<div><span class="lbl">روش خرید</span><select data-f="ing-buy" aria-label="روش خرید">' + buySelect(g) + '</select></div></div>';
    if (packMode) {
      h += '<div class="grid2" style="margin-top:8px"><div><span class="lbl">در هر بسته چند ' + UNAME[g.unit] + '</span>' + numField('ing-pqty', g.packQty, ' aria-label="اندازهٔ بسته"') + '</div>' +
        '<div><span class="lbl">قیمت یک بسته</span>' + numField('ing-ppack', g.packPrice || '', ' aria-label="قیمت بسته"', true) + '</div></div>' +
        '<div class="gnote" style="margin-top:2px"><span>' + UNIT[g.unit] + ': <b>' + fmt(g.price) + '</b> تومان</span></div>';
    } else {
      h += '<div style="margin-top:8px"><span class="lbl">قیمت ' + UNIT[g.unit] + '</span>' + numField('ing-price', g.price, ' aria-label="قیمت"', true) + '</div>';
    }
    if (showSw('loss')) h += '<div style="margin-top:4px"><span class="lbl">ضایعات (%) مثل پوست، استخوان، پرت</span>' + numField('ing-loss', g.loss || '', ' max="90" placeholder="0"') + '</div>';
    h += '<div class="rowx" style="margin-top:4px;align-items:center;justify-content:space-between"><label class="switch"><input type="checkbox" data-f="ing-trim"' + (g.trimmable !== false ? ' checked' : '') + '> مقدارش قابل کم‌کردن باشد</label><span>' + ch + '</span></div>' + ingNutHtml(g) + '</div>';
    return h;
  }
  function ingList() {
    var term = q.ing.trim(), rows = state.ingredients.filter(function (g) { return !term || (g.name || '').indexOf(term) >= 0; });
    if (!rows.length && term) return '<p class="mute" style="text-align:center">موردی پیدا نشد.</p>';
    return rows.map(ingRow).join('');
  }
  function viewIngs() {
    var h = lead('قیمت امروز مواد', 'هر وقت قیمتی عوض شد، همین‌جا عدد را اصلاح کنید؛ بقیه خودکار حساب می‌شود.');
    h += reminderBanner() + debtBanner();
    if (!state.ingredients.length) return h + empty('هنوز ماده‌ای ندارید', 'با راه‌اندازی، فهرست آمادهٔ نوع کسب‌وکارتان را بگیرید، یا مواد را یکی‌یکی وارد کنید.', [['go-setup', 'راه‌اندازی بر اساس نوع کسب‌وکار', true], ['ing-add', 'افزودن ماده']]);
    if (state.ingredients.length > 6) h += '<input class="search" data-f="q-ing" type="search" placeholder="جستجوی ماده" value="' + esc(q.ing) + '" aria-label="جستجو">';
    h += '<div id="list">' + ingList() + '</div>';
    h += '<button class="btn pri block" data-act="ing-add">' + ICON('plus') + 'ماده جدید</button>';
    return h;
  }

  // ======================================================= packaging
  function packRow(p) {
    return '<div class="item" data-id="' + p.id + '"><div class="rowx"><div class="grow"><input data-f="pk-name" value="' + esc(p.name) + '" placeholder="مثلاً جعبهٔ کیک" aria-label="نام"></div><button class="x" data-act="pkg-del" aria-label="حذف">' + ICON('trash') + '</button></div>' +
      '<div style="margin-top:8px"><span class="lbl">قیمت هر عدد</span>' + numField('pk-price', p.price, ' aria-label="قیمت"', true) + '</div></div>';
  }
  function packList() {
    var term = q.pk.trim(), rows = state.packs.filter(function (g) { return !term || (g.name || '').indexOf(term) >= 0; });
    if (!rows.length && term) return '<p class="mute" style="text-align:center">موردی پیدا نشد.</p>';
    return rows.map(packRow).join('');
  }
  function viewPacks() {
    var h = lead('بسته‌بندی', 'جعبه، لیوان، کیسه، روبان و هر چیزی که همراه فروش می‌رود. بعد در هر محصول مشخص می‌کنید چندتا می‌رود.');
    if (!state.packs.length) return h + empty('هنوز بسته‌بندی‌ای ندارید', 'مثلاً جعبه، درب لیوان یا کیسه. هزینهٔ آن‌ها هم در قیمت حساب می‌شود.', [['pkg-add', 'افزودن بسته‌بندی', true]]);
    if (state.packs.length > 6) h += '<input class="search" data-f="q-pk" type="search" placeholder="جستجو" value="' + esc(q.pk) + '" aria-label="جستجو">';
    h += '<div id="list">' + packList() + '</div><button class="btn pri block" data-act="pkg-add">' + ICON('plus') + 'بسته‌بندی جدید</button>';
    return h;
  }

  // ======================================================= quick price (nothing saved)
  function qcTemp() {
    var c = C(), it = { lines: qc.lines.filter(function (l) { return l.ingId; }), pk: [], yield: Math.max(1, L.num(qc.n) || 1), mode: 'piece', price: 0, minutes: 0 };
    var cost = L.unitCost(it, { ing: c.ing, pk: c.pk, s: { mode: 'simple', targetFC: c.s.targetFC } }) + L.num(qc.other) / it.yield;
    var t = L.num(state.settings.targetFC) / 100;
    return { it: it, cost: cost, sug: t > 0 ? L.roundUp(cost / t, state.settings.roundTo) : 0, target: L.num(state.settings.targetFC) };
  }
  function viewQuick() {
    var h = lead('قیمت سریع', 'وقتی مشتری جلوی شماست: مواد را بزنید و قیمت پیشنهادی را ببینید. چیزی ذخیره نمی‌شود.');
    if (!state.ingredients.length) return h + empty('اول مواد را وارد کنید', 'قیمت سریع از قیمت مواد شما حساب می‌شود.', [['go-setup', 'راه‌اندازی', true], ['go-ings', 'رفتن به مواد اولیه']]);
    var r = qcTemp(), c = C();
    h += '<div class="hero"><div class="k">قیمت پیشنهادی هر عدد (هدف هزینه ' + pct(r.target) + ')</div><div class="big">' + fmt(r.sug) + '<small>تومان</small></div><div class="row"><div>هزینهٔ هر عدد<b>' + fmt(r.cost) + '</b></div></div></div>';
    h += '<div class="sec" data-grp="qc"><h3>مواد</h3>';
    qc.lines.forEach(function (l, idx) {
      var g = c.ing[l.ingId];
      h += '<div class="line" data-line="' + idx + '"><select data-f="qc-ing" aria-label="ماده">' + ingOptions(l.ingId) + '</select>' + numField('qc-amt', l.amount, ' aria-label="مقدار"') + '<span class="u">' + (g ? AMT[g.unit] : '') + '</span><button class="x" data-act="qc-del" aria-label="حذف">' + ICON('close') + '</button></div>';
    });
    h += '<button class="btn sm" data-act="qc-add">' + ICON('plus') + 'ماده</button></div>';
    h += '<div class="sec stack"><div class="grid2"><div><span class="lbl">از این مقدار چند عدد می‌شود؟</span>' + numField('qc-n', qc.n, ' placeholder="1"') + '</div>' +
      '<div><span class="lbl">هزینهٔ دیگر (بسته‌بندی، دستمزد...)</span>' + numField('qc-other', qc.other || '', '', true) + '</div></div>' +
      '<div class="grid2"><button class="btn" data-act="qc-clear">پاک‌کردن</button><button class="btn pri" data-act="qc-save">ذخیره به‌عنوان ' + W().one + '</button></div></div>';
    return h;
  }

  // ======================================================= setup wizard
  function wzStart() { wz = { step: 1, type: state.profile.type || '', cname: state.profile.customName || '', csw: {}, ing: {}, price: {}, pk: {}, pkp: {}, dish: {}, sell: {}, t0: now() }; }
  function wzPick(id) {
    var t = T.types.filter(function (x) { return x.id === id; })[0]; if (!t) return;
    wz.type = id; wz.ing = {}; wz.pk = {}; wz.dish = {};
    if (id === 'other') { wz.csw = { loss: false, batch: false, sizes: false, weight: false }; }
  }
  function viewSetup() {
    if (!wz) wzStart();
    var t = T.types.filter(function (x) { return x.id === wz.type; })[0];
    var steps = '<div class="steps"><i class="on"></i><i class="' + (wz.step >= 2 ? 'on' : '') + '"></i><i class="' + (wz.step >= 3 ? 'on' : '') + '"></i></div>';
    var h = '';
    if (wz.step === 1) {
      h += lead('کسب‌وکار شما چیست؟', 'نزدیک‌ترین مورد را انتخاب کنید. نام‌ها، واحدها و فهرست مواد آماده بر اساس آن می‌آید و همه‌چیز بعداً قابل تغییر است.') + steps;
      ['food', 'other', 'custom'].forEach(function (g) {
        var ts = T.types.filter(function (x) { return x.g === g; });
        if (g === 'other') h += '<div class="sub-h">غیر خوراکی (همان حساب مواد و محصول)</div>';
        else if (g === 'food') h += '<div class="sub-h">خوراکی</div>';
        else h += '<div class="sub-h">چیز دیگر</div>';
        h += '<div class="typegrid">' + ts.map(function (x) { return '<label class="tile"><input type="radio" name="wztype" data-f="wz-type" data-k="' + x.id + '"' + (wz.type === x.id ? ' checked' : '') + '><span class="ck">' + ICON('check') + '</span>' + esc(x.n) + '</label>'; }).join('') + '</div>';
      });
      if (wz.type === 'other') {
        h += '<div class="sec stack" style="margin-top:14px"><div><label class="lbl">اسم کسب‌وکار یا محصول</label><input data-f="wz-cname" value="' + esc(wz.cname) + '" placeholder="مثلاً عروسک‌سازی"></div><p class="mute" style="margin:0">کدام بخش‌ها را می‌خواهید؟</p>' +
          [['loss', 'ضایعات مواد'], ['batch', 'یک دستور چند عدد می‌شود'], ['sizes', 'اندازه‌ها (کوچک و بزرگ)'], ['weight', 'فروش وزنی']].map(function (a) { return '<label class="switch"><input type="checkbox" data-f="wz-csw" data-k="' + a[0] + '"' + (wz.csw[a[0]] ? ' checked' : '') + '> ' + a[1] + '</label>'; }).join('') + '</div>';
      }
      h += '<button class="btn pri block" style="margin-top:14px" data-act="wz-next"' + (wz.type ? '' : ' disabled') + '>ادامه</button>';
      if (state.profile.done) h += '<button class="btn block" style="margin-top:10px" data-act="go-prods">انصراف</button>';
      return h;
    }
    if (wz.step === 2) {
      h += lead('مواد و بسته‌بندی', 'این‌ها فقط پیشنهاد است و بعداً هر وقت خواستید می‌توانید تغییرشان دهید. برای شروع چند مورد را انتخاب کنید، یا بدون انتخاب روی «ادامه» بزنید.') + steps;
      h += '<button class="btn sm" style="margin:0 0 12px" data-act="wz-all">انتخاب همهٔ مواد</button> <button class="btn sm" style="margin:0 0 12px" data-act="wz-none">برداشتن همه</button>';
      if (t.hint) h += '<div class="note">' + esc(t.hint) + '</div>';
      h += '<div class="sec"><h3>مواد اولیه</h3>';
      t.ing.forEach(function (k) {
        var d = T.ing[k], on = !!wz.ing[k];
        h += '<div class="setrow"><label class="tx switch" style="color:var(--ink)"><input type="checkbox" data-f="wz-ing" data-k="' + k + '"' + (on ? ' checked' : '') + '> <span><b>' + esc(d.n) + '</b><span class="mute sm" style="display:block">' + UNIT[d.u] + (d.p ? ' · معمولاً ' + d.p[0] : '') + '</span></span></label>' + numField('wz-price', wz.price[k] == null ? '' : wz.price[k], ' data-k="' + k + '" aria-label="قیمت ' + esc(d.n) + '"', true) + '</div>';
      });
      h += '</div>';
      if (t.pk.length) {
        h += '<div class="sec"><h3>بسته‌بندی (اختیاری)</h3>';
        t.pk.forEach(function (n) {
          h += '<div class="setrow"><label class="tx switch" style="color:var(--ink)"><input type="checkbox" data-f="wz-pk" data-k="' + esc(n) + '"' + (wz.pk[n] ? ' checked' : '') + '> <b>' + esc(n) + '</b></label>' + numField('wz-pkp', wz.pkp[n] == null ? '' : wz.pkp[n], ' data-k="' + esc(n) + '" aria-label="قیمت ' + esc(n) + '"', true) + '</div>';
        });
        h += '</div>';
      }
      var hasDish = !!(t.dishes && T.dishes[t.dishes]);
      h += '<div class="grid2"><button class="btn" data-act="wz-back">برگشت</button><button class="btn pri" data-act="' + (hasDish ? 'wz-next' : 'wz-finish') + '">' + (hasDish ? 'ادامه' : 'ساخت و شروع') + '</button></div>';
      return h;
    }
    // step 3: starter products
    var list = T.dishes[t.dishes] || [];
    h += lead('چند نمونه آماده کنیم؟', 'مقدار مواد هر مورد فقط یک نمونهٔ تقریبی است و بعداً در خود ' + esc(t.one) + ' اصلاح می‌شود. قیمت فروش خودتان را بنویسید.') + steps;
    h += '<div class="sec"><div class="tile-grid">' + list.map(function (d) { return '<label class="tile"><input type="checkbox" data-f="wz-dish" data-k="' + d.id + '"' + (wz.dish[d.id] ? ' checked' : '') + '><span class="ck">' + ICON('check') + '</span>' + esc(d.name) + '</label>'; }).join('') + '</div></div>';
    var picked = list.filter(function (d) { return wz.dish[d.id]; });
    if (picked.length) {
      h += '<div class="sec"><h3>قیمت فروش (تومان)</h3>';
      picked.forEach(function (d) { h += '<div class="setrow"><div class="tx"><b>' + esc(d.name) + '</b></div>' + numField('wz-sell', wz.sell[d.id] == null ? '' : wz.sell[d.id], ' data-k="' + d.id + '" aria-label="' + esc(d.name) + '"', true) + '</div>'; });
      h += '</div>';
    }
    h += '<div class="grid2"><button class="btn" data-act="wz-back">برگشت</button><button class="btn pri" data-act="wz-finish">ساخت و شروع</button></div>';
    return h;
  }
  function wzFinish() {
    var t = T.types.filter(function (x) { return x.id === wz.type; })[0]; if (!t) return false;
    var idByKey = {}, ts = now(), made = {};
    state.profile.type = t.id; state.profile.done = true;
    state.profile.customName = t.id === 'other' ? (wz.cname || '').trim() : '';
    var swv = { loss: false, batch: false, sizes: false, weight: false };
    var src = t.id === 'other' ? wz.csw : t.sw;
    for (var k in swv) swv[k] = !!(src && src[k]);
    state.settings.sw = swv; touchSettings();
    t.ing.forEach(function (key) {
      if (!wz.ing[key]) return;
      var d = T.ing[key], p = L.num(wz.price[key]), g = state.ingredients.filter(function (x) { return x.name === d.n; })[0];
      if (!g) { g = { id: uid(), name: d.n, unit: d.u, price: 0, trimmable: true, u: ts }; state.ingredients.push(g); made[g.id] = 1; }
      if (p > 0) setPrice(g, p);
      idByKey[key] = g.id;
    });
    t.pk.forEach(function (n) {
      if (!wz.pk[n]) return;
      var g = state.packs.filter(function (x) { return x.name === n; })[0];
      if (!g) { g = { id: uid(), name: n, price: 0, u: ts }; state.packs.push(g); }
      var p = L.num(wz.pkp[n]); if (p > 0 && p !== g.price) { g.price = p; touch(g); }
    });
    var list = T.dishes[t.dishes] || [];
    list.forEach(function (d) {
      if (!wz.dish[d.id]) return;
      var lines = d.lines.map(function (l) {
        var def = T.ing[l[0]], g = idByKey[l[0]] ? find(state.ingredients, idByKey[l[0]]) : state.ingredients.filter(function (x) { return x.name === def.n; })[0];
        if (!g) { g = { id: uid(), name: def.n, unit: def.u, price: 0, trimmable: true, u: ts }; state.ingredients.push(g); made[g.id] = 1; }
        return { ingId: g.id, amount: l[1] };
      });
      var it = state.items.filter(function (x) { return x.name === d.name; })[0], price = L.num(wz.sell[d.id]);
      if (!it) { it = { id: uid(), name: d.name, price: price, sales: 0, yield: 1, mode: 'piece', lines: lines, pk: [], u: ts }; state.items.push(it); it.sample = true; lines.forEach(function (l) { if (made[l.ingId]) find(state.ingredients, l.ingId).sample = true; }); }
      else if (price > 0) { it.price = price; touch(it); }
    });
    if (state.meta.setupSeconds == null && wz.t0) state.meta.setupSeconds = (now() - wz.t0) / 1000;
    state.meta.setups++;
    wz = null; return true;
  }

  // ======================================================= price change (kept from the old version)
  function viewChg() {
    var h = lead('قیمت‌ها عوض شد؟', 'فقط قیمت موادی را که عوض شده بنویسید و یک بار «ثبت» را بزنید. بقیه را خالی بگذارید.');
    if (!state.ingredients.length) return h + empty('هنوز ماده‌ای ندارید', 'اول مواد را وارد کنید.', [['go-setup', 'راه‌اندازی', true], ['go-ings', 'رفتن به مواد اولیه']]);
    h += reminderBanner() + debtBanner();
    h += '<div class="sec">';
    state.ingredients.forEach(function (g) {
      h += '<div class="setrow"><div class="tx"><b>' + esc(g.name) + '</b><span class="mute sm">الان ' + fmt(g.price) + ' ' + UNIT[g.unit] + '</span></div>' + numField('up-price', upd[g.id] != null ? upd[g.id] : '', ' data-k="' + g.id + '" placeholder="قیمت جدید" aria-label="قیمت جدید ' + esc(g.name) + '"', true) + '</div>';
    });
    h += '<p class="hintline">اگر ماده را بسته‌ای می‌خرید، اینجا قیمت ' + 'هر کیلو/لیتر/عدد را بنویسید، یا در «مواد اولیه» قیمت بسته را عوض کنید.</p>';
    h += '<button class="btn pri block" style="margin-top:12px" data-act="up-go">ثبت قیمت‌های جدید</button></div>';
    var c = L.changes(state);
    if (!c.ingredients.length) return h + '<div class="note">هنوز تغییر قیمتی ثبت نشده است. بعد از ثبت قیمت جدید، اینجا می‌بینید چه چیزی گران شد و کدام محصول‌ها را اذیت کرد.</div>';
    h += '<div class="sec"><h3>چه چیزی عوض شد</h3>';
    c.ingredients.forEach(function (g) {
      h += '<div class="listrow"><div class="tx"><b>' + esc(g.name) + '</b><span class="mute sm" style="display:block">از ' + fmt(g.prev) + ' به ' + fmt(g.now) + '</span></div><span class="chg ' + (g.pct > 0 ? 'up' : 'down') + '">' + (g.pct > 0 ? '+' : '') + pct(g.pct) + '</span></div>';
    });
    h += '</div><div class="sec"><h3>اثر روی ' + W().many + '</h3>';
    var any = false;
    c.items.forEach(function (x) {
      if (Math.abs(x.delta) < 1e-9) return; any = true;
      h += '<div class="listrow"><div class="tx"><b>' + esc(x.name) + '</b>' + (x.crossed ? ' <span class="pill bad">از هدف گذشت</span>' : '') +
        '<span class="mute sm" style="display:block">هزینه از ' + fmt(x.costPrev) + ' به ' + fmt(x.costNow) + ' · سهم هزینه از ' + pct(x.fcPrev * 100) + ' به ' + pct(x.fcNow * 100) + '</span>' +
        (x.cause ? '<span class="cause" style="display:block">بیشترین علت: ' + esc(x.cause) + '</span>' : '') + '</div></div>';
    });
    if (!any) h += '<p class="mute">قیمت هیچ موردی تغییری نکرد.</p>';
    h += '<p class="mute" style="margin-top:10px">برای دیدن پیشنهاد، به «پیشنهاد قیمت» بروید.</p></div>';
    h += '<div class="sec"><button class="btn block" data-act="share">متن خلاصه برای کارکنان یا شریک</button><div id="sharebox"></div></div>';
    return h;
  }
  function shareText() {
    var c = L.changes(state), cx = C(), out = [];
    out.push('خلاصهٔ تغییر قیمت مواد:');
    c.ingredients.forEach(function (g) { out.push('• ' + g.name + ': ' + fmt(g.prev) + ' ← ' + fmt(g.now) + ' (' + (g.pct > 0 ? '+' : '') + pct(g.pct) + ')'); });
    var over = c.items.filter(function (x) { return x.over; });
    if (over.length) {
      out.push('', 'مواردی که سهم هزینه از هدف بالاتر است:');
      over.forEach(function (x) {
        var it = find(state.items, x.id), r = L.scenarios(it, cx, state.subs);
        out.push('• ' + x.name + ': ' + pct(x.fcNow * 100) + '، حداقل قیمت برای رسیدن به هدف: ' + fmt(r.scenarios.raise.price));
      });
    } else out.push('', 'همه در محدودهٔ هدف هستند.');
    return out.join('\n');
  }

  // ======================================================= all products: suggestions
  function viewRes() {
    var c = C(), s = state.settings, w = W();
    if (!state.items.length) return lead('اینجا پیشنهاد قیمت می‌بینید', 'اول ' + w.many + ' و قیمت موادشان را وارد کنید.') + empty('هنوز ' + w.one + 'ی ندارید', 'چند مورد پرفروش را بسازید تا ببینید کدام سود کمتری دارد.', [['go-setup', 'راه‌اندازی', true], ['demo', 'نمونهٔ آماده را ببینم']]);
    var rows = state.items.map(function (it) { return { it: it, r: L.scenarios(it, c, state.subs) }; });
    rows.sort(function (a, b) { return ((b.r.over ? 1 : 0) - (a.r.over ? 1 : 0)) || ((isFinite(b.r.fc) ? b.r.fc : 0) - (isFinite(a.r.fc) ? a.r.fc : 0)); });
    var nOver = rows.filter(function (x) { return x.r.over; }).length;
    var h = lead(nOver ? nOver + ' مورد از هدف هزینه بالاتر رفته' : 'همه در محدودهٔ هدف‌اند', 'هدف شما: هزینه ' + s.targetFC + '% قیمت فروش');
    rows.forEach(function (x) {
      var it = x.it, r = x.r, fc = isFinite(r.fc) ? r.fc : 0, tgt = r.target / 100;
      var scale = Math.max(tgt * 1.7, fc * 1.05, 0.01), wd = Math.min(fc / scale, 1) * 100, tp = tgt / scale * 100;
      var b = r.scenarios[r.best], unit = r.hasSales ? 'سود ماهانه' : 'سود هر واحد';
      h += '<article class="dish' + (r.over ? ' over' : '') + '">' +
        '<div class="leader"><span class="nm">' + esc(it.name || '(بدون نام)') + '</span><span class="dots"></span><span class="pr">' + fmt(it.price) + '</span></div>' +
        '<div class="gauge' + (r.over ? ' over' : '') + '" role="img" aria-label="سهم هزینه ' + pct(fc * 100) + '"><i style="width:' + wd.toFixed(1) + '%"></i><u style="right:' + tp.toFixed(1) + '%"></u></div>' +
        '<div class="gnote"><span>هزینه <b>' + pct(fc * 100) + '</b> (' + fmt(r.cost) + ')</span><span>هدف ' + pct(r.target) + '</span></div>';
      if (!r.over) h += '<div class="okline">' + ICON('check') + 'در محدودهٔ هدف است؛ تغییری لازم نیست.</div>';
      else {
        var head = r.best === 'raise' ? 'قیمت را به ' + fmt(b.price) + ' برسانید' : r.best === 'keep' ? 'قیمت را نگه دارید و مواد را اصلاح کنید' : 'تغییر ندهید؛ با افت فروش احتمالی، سود بهتری ندارد';
        h += '<div class="ticket"><b>' + head + '</b><span>' + unit + ': ' + fmt(b.profit) + (r.best !== 'nothing' ? ' (بدون تغییر: ' + fmt(r.scenarios.nothing.profit) + ')' : '') + '</span></div>';
        if (r.explain.length && r.explain[0].delta > 0) h += '<p class="cause">بیشترین علت: ' + esc(r.explain[0].name) + '، ' + pct(r.explain[0].pct) + ' گران‌تر شده</p>';
      }
      h += '<button class="btn sm" style="margin-top:8px" data-act="open" data-id="' + it.id + '">جزئیات و گزینه‌ها</button></article>';
    });
    h += '<div class="note">پیشنهادها تقریبی‌اند. افت فروش با ضریب حساسیت ' + s.elasticity + ' فرض شده و باید با فروش واقعی خودتان اصلاح شود. تغییر مواد را قبل از اجرا خودتان تأیید کنید.</div>';
    return h;
  }

  // ======================================================= substitutions (kept)
  function viewSub() {
    var h = lead('جایگزین‌های مجاز', 'مثلاً «به‌جای بخشی از پنیر پیتزا، پنیر پروسسی بگذارم». برنامه فقط از جایگزین‌هایی استفاده می‌کند که شما تأیید کرده‌اید.');
    if (!state.subs.length) h += '<div class="note">هنوز جایگزینی تعریف نشده است. بدون آن، پیشنهادها فقط بالا بردن قیمت یا کم‌کردن مقدار مواد است.</div>';
    state.subs.forEach(function (s) {
      h += '<div class="item" data-id="' + s.id + '"><div class="rowx"><div class="grow stack">' +
        '<div><span class="lbl">به‌جای</span><select data-f="sb-from">' + ingOptions(s.fromId) + '</select></div>' +
        '<div><span class="lbl">این را بگذار</span><select data-f="sb-to">' + ingOptions(s.toId) + '</select></div></div>' +
        '<button class="x" data-act="sb-del" aria-label="حذف جایگزین">' + ICON('trash') + '</button></div>' +
        '<div class="grid2" style="margin-top:10px"><div><span class="lbl">نسبت مقدار</span>' + numField('sb-ratio', s.ratio, ' step="0.1"') + '</div>' +
        '<div><span class="lbl">حداکثر سهم (%)</span>' + numField('sb-share', s.maxShare, ' max="100"') + '</div></div></div>';
    });
    h += '<button class="btn pri block" data-act="sb-add">' + ICON('plus') + 'جایگزین جدید</button>';
    return h;
  }

  // ======================================================= price cards
  function viewCards() {
    var s = state.settings, w = W();
    var h = lead('کارت و فهرست قیمت', 'یک تصویر آماده برای اینستاگرام، بله یا ایتا بسازید و با یک لمس بفرستید. هزینه و سود شما در آن نمی‌آید.');
    if (!state.items.length) return h + empty('هنوز ' + w.one + 'ی ندارید', 'اول چند مورد با قیمت فروش بسازید.', [['go-prods', 'رفتن به ' + w.many, true]]);
    if (!cardOpt.pick) { cardOpt.pick = {}; state.items.forEach(function (it) { cardOpt.pick[it.id] = L.num(it.price) > 0; }); }
    h += '<div class="sec stack"><div><label class="lbl" for="shopname">نام مغازه یا برند</label><input id="shopname" data-f="shop" value="' + esc(s.shopName) + '" placeholder="مثلاً شیرینی ..."></div>' +
      '<div><label class="lbl" for="shopcontact">تماس یا آیدی (پایین کارت)</label><input id="shopcontact" data-f="contact" value="' + esc(s.contact) + '" placeholder="مثلاً @mybakery  |  0915..." dir="ltr" style="text-align:right"></div>' +
      '<div><span class="lbl">رنگ</span><div class="themes">' + Object.keys(CARD.themes).map(function (k) { return '<button data-act="theme" data-k="' + k + '" class="' + (cardOpt.theme === k ? 'on' : '') + '">' + CARD.themes[k].name + '</button>'; }).join('') + '</div></div>';
    if (full()) h += '<label class="switch"><input type="checkbox" data-f="card-whole"' + (cardOpt.wholesale ? ' checked' : '') + '> به‌جای قیمت فروش، قیمت عمده را بگذار</label>';
    h += '<label class="switch"><input type="checkbox" data-f="card-photos"' + (cardOpt.photos ? ' checked' : '') + '> عکس محصول روی کارت بیاید (اگر عکس دارد)</label><label class="switch"><input type="checkbox" data-f="card-cal"' + (cardOpt.cal ? ' checked' : '') + '> کالری هر محصول زیر نامش بیاید (اگر ارزش غذایی مواد نوشته شده)</label>';
    h += '</div><div class="sec"><h3>کدام موارد در فهرست باشند؟</h3>';
    state.items.forEach(function (it) {
      var p = cardOpt.wholesale ? L.num(it.wholesale) : L.num(it.price);
      h += '<div class="setrow"><label class="tx switch" style="color:var(--ink)"><input type="checkbox" data-f="card-pick" data-k="' + it.id + '"' + (cardOpt.pick[it.id] && p > 0 ? ' checked' : '') + (p > 0 ? '' : ' disabled') + '> <b>' + esc(it.name || '(بدون نام)') + '</b></label><span style="direction:ltr;font-weight:700">' + (p > 0 ? fmt(p) : 'بدون قیمت') + '</span></div>';
    });
    h += '<button class="btn pri block" style="margin-top:12px" data-act="card-list">ساخت تصویر فهرست قیمت</button></div>';
    return h;
  }
  function cardRows(ids) {
    return ids.map(function (id) { var it = find(state.items, id); if (!it) return null; var p = cardOpt.wholesale && ids.length > 1 ? L.num(it.wholesale) : L.num(it.price); return p > 0 ? { id: it.id, name: it.name, price: p, unit: it.mode === 'kg' ? 'هر کیلوگرم' : '', cal: cardOpt.cal ? calTxt(it) : '' } : null; }).filter(Boolean);
  }
  function makeCard(kind, rows, sub) {
    if (!rows.length) { alert('قیمتی برای نمایش نیست.'); return; }
    var s = state.settings;
    loadImgs(rows).then(function () { return CARD.make({ kind: kind, shop: s.shopName || NAME, contact: s.contact, theme: cardOpt.theme, sub: sub, rows: rows }); }).then(function (cv) {
      return Promise.all(cv.map(CARD.toBlob));
    }).then(function (blobs) {
      closeSheet(); window._cardName = 'price-card'; urls = blobs.map(function (b) { return URL.createObjectURL(b); });
      var html = '<div class="sheet" role="dialog" aria-label="پیش‌نمایش"><h3>پیش‌نمایش</h3>' + urls.map(function (u) { return '<img class="cardprev" src="' + u + '" alt="پیش‌نمایش کارت">'; }).join('') +
        '<button class="btn pri block" data-sheet="card-send">' + ICON('share') + 'ارسال یا ذخیره</button><button class="btn block" data-sheet="close" style="margin-top:10px">بستن</button></div>';
      openSheet(html); window._cardBlobs = blobs;
    }).catch(function () { alert('ساخت تصویر ممکن نشد.'); });
  }

  // ======================================================= settings
  function viewSet() {
    var s = state.settings;
    function f(key, label, hint) { return '<div class="setrow"><div class="tx"><b>' + label + '</b><span class="mute sm">' + hint + '</span></div><div class="fld"><input type="number" step="any" inputmode="decimal" data-f="st-' + key + '" value="' + s[key] + '"></div></div>'; }
    var t = curType();
    var h = lead('تنظیمات', 'این عددها پیشنهادها را شکل می‌دهند؛ برای کسب‌وکار خودتان تنظیم کنید.');
    h += '<div class="sec stack"><h3>حالت</h3><div class="seg"><button data-act="mode-simple" class="' + (s.mode !== 'full' ? 'on' : '') + '">ساده</button><button data-act="mode-full" class="' + (s.mode === 'full' ? 'on' : '') + '">کامل</button></div>' +
      '<p class="mute" style="margin:0">' + (s.mode === 'full' ? 'کامل: دستمزد، سربار و قیمت عمده هم در حساب می‌آید.' : 'ساده: فقط مواد و بسته‌بندی. برای شروع همین کافی است.') + '</p></div>';
    h += '<div class="sec">' +
      f('targetFC', 'هدف هزینه (% قیمت فروش)', 'معمولاً بین 28 تا 35 برای غذا؛ برای کارهای دستی کمتر هم می‌شود') +
      (s.mode === 'full' ? f('wage', 'دستمزد هر ساعت (تومان)', 'برای حساب زمان کار') + f('overheadPct', 'سربار (% هزینهٔ مواد و دستمزد)', 'گاز، برق، اجاره...') : '') +
      f('minPortion', 'حداقل مقدار مجاز (% مقدار فعلی)', 'مثلاً 85 یعنی تا 15% کم‌کردن مجاز است') +
      f('roundTo', 'رند کردن قیمت به (تومان)', 'مثلاً 1000 یا 5000') +
      f('elasticity', 'حساسیت مشتری به گرانی', '1.2 یعنی 10% گرانی ≈ 12% کاهش فروش') +
      f('qualityDrop', 'افت فروش بر اثر کم‌کردن مواد (%)', 'اگر کیفیت کمی پایین بیاید') +
      f('remindDays', 'یادآوری به‌روزرسانی قیمت (هر چند روز)', '0 یعنی بدون یادآوری') + '</div>';
    var nOv = state.items.filter(function (i) { return L.num(i.tgt) > 0; }).length;
    h += '<div class="sec stack"><h3>همه یکی</h3><p class="mute" style="margin:0">اگر برای بعضی مورد‌ها هدف جداگانه گذاشته‌اید (' + nOv + ' مورد)، با این دکمه همه از هدف بالا استفاده می‌کنند.</p><button class="btn block" data-act="apply-target"' + (nOv ? '' : ' disabled') + '>هدف بالا برای همه</button></div>';
    h += '<div class="sec stack"><h3>بخش‌های اضافه</h3>' + [['loss', 'ضایعات مواد'], ['batch', 'یک دستور چند عدد می‌شود'], ['sizes', 'اندازه‌ها (کوچک و بزرگ)'], ['weight', 'فروش وزنی (کیلویی)']].map(function (a) { return '<label class="switch"><input type="checkbox" data-f="st-sw" data-k="' + a[0] + '"' + (s.sw[a[0]] ? ' checked' : '') + '> ' + a[1] + '</label>'; }).join('') + '</div>';
    h += '<div class="sec stack"><h3>نوع کسب‌وکار</h3><p style="margin:0"><b>' + esc(t ? (t.id === 'other' && state.profile.customName ? state.profile.customName : t.n) : 'انتخاب نشده') + '</b></p><button class="btn block" data-act="go-setup">تغییر نوع و افزودن مواد آماده</button></div>';
    h += '<div class="sec stack"><h3>ظاهر برنامه</h3><div class="seg">' + [['auto', 'خودکار'], ['light', 'روشن'], ['dark', 'تیره']].map(function (m) { return '<button data-act="theme-' + m[0] + '" class="' + (themePref() === m[0] ? 'on' : '') + '">' + m[1] + '</button>'; }).join('') + '</div><p class="mute" style="margin:0">«خودکار» از تنظیم گوشی پیروی می‌کند. با دکمهٔ ماه و خورشید بالای منو هم می‌توانید عوض کنید.</p></div>';
    h += notifSettingHtml();
    h += '<div class="sec stack"><h3>اطلاعات</h3>' +
      '<button class="btn block" data-act="export">دریافت پشتیبان (فایل)</button>' +
      '<label class="btn block">بازیابی از فایل<input type="file" accept=".json" data-f="import" hidden></label>' +
      '<div class="grid2"><button class="btn" data-act="csv-items">Excel ' + esc(W().many) + '</button><button class="btn" data-act="csv-ings">Excel مواد</button></div>' +
      '<button class="btn block" data-act="demo">نمونهٔ پیتزا و ساندویچ</button>' +
      '<button class="btn block danger" data-act="reset">پاک‌کردن همه</button>' +
      '<p class="mute sm">اگر وارد حساب نشده‌اید، اطلاعات فقط روی همین دستگاه می‌ماند؛ گاهی پشتیبان بگیرید.</p></div>';
    h += '<div class="sec"><h3>آمار استفاده</h3><p class="mute" style="margin:0">فقط روی همین دستگاه. زمان راه‌اندازی: ' + (state.meta.setupSeconds == null ? '—' : Math.round(state.meta.setupSeconds) + ' ثانیه') + '، دفعات راه‌اندازی: ' + state.meta.setups + '، دفعات ثبت قیمت جدید: ' + state.meta.priceUpdates + '</p></div>';
    return h;
  }

  // ======================================================= help
  function viewHelp() {
    var steps = [
      ['1. نوع کسب‌وکار', 'از منو «نوع کسب‌وکار و راه‌اندازی» را بزنید و نزدیک‌ترین مورد را انتخاب کنید. فهرست مواد آماده می‌شود.'],
      ['2. قیمت مواد', 'در «مواد اولیه» آخرین قیمت خرید را بنویسید. اگر کیسه یا حلب می‌خرید، «روش خرید» را عوض کنید و قیمت یک بسته را بنویسید.'],
      ['3. بسته‌بندی', 'جعبه، لیوان یا کیسه را در «بسته‌بندی» وارد کنید.'],
      ['4. ساخت محصول', 'دکمهٔ + را بزنید و محصول را بسازید: مواد و مقدار هر کدام را بنویسید. قیمت پیشنهادی بالای صفحه می‌آید.'],
      ['5. قیمت سریع', 'وقتی مشتری جلوی شماست، «قیمت سریع» را بزنید؛ چیزی ذخیره نمی‌شود.'],
      ['6. قیمت عوض شد', 'از منو «ثبت قیمت جدید مواد» را بزنید. برنامه نشان می‌دهد کدام محصول‌ها گران‌تر شد.'],
      ['7. کارت قیمت', 'از منو «کارت و فهرست قیمت» برای ساخت تصویر آمادهٔ اینستاگرام و بله.'],
      ['8. بدهی و طلب', 'از منو «بدهی و طلب» اسم شخص، مبلغ و تاریخ موعد را بنویسید. وقتی موعد نزدیک شود، بالای صفحهٔ اصلی یادآوری می‌آید. برنامه پیامک خودکار نمی‌فرستد؛ فقط وقتی برنامه را باز کنید یادآوری می‌کند.'],
      ['9. برچسب و ارزش غذایی', 'از منو «برچسب و ارزش غذایی» مواد و گرم هر کدام را بنویسید و ارزش غذایی هر ماده را از روی بسته یا فهرست آماده پر کنید. برنامه جدول ارزش غذایی را حساب می‌کند. این مقدار محاسبه‌ای است، نه آزمایشگاهی؛ قبل از چاپ، با قوانین برچسب‌گذاری و اداره‌ای که برای مجوز دارید تطبیق دهید.'],
      ['10. لیست خرید', 'هر چیزی که می‌خواهید بخرید را بنویسید. اگر اسمش یکی از مواد شما باشد، قیمتش خودکار می‌آید. از «برنامهٔ تولید» هم می‌توانید مواد لازم برای ساختن تعداد مشخصی محصول را بگیرید.'],
      ['11. ثبت فروش', 'هنگام فروش روی + بزنید یا آخر روز تعداد فروش را یک‌جا بنویسید. سود و فروش روز و هفته را می‌بینید.'],
      ['12. عکس و کالری', 'در صفحهٔ هر محصول می‌توانید عکس بگذارید تا روی کارت بیاید. ارزش غذایی هر ماده را در «مواد اولیه» بنویسید تا کالری و پروتئین محصول حساب شود.']
    ];
    return lead('راهنما', 'کوتاه و قدم‌به‌قدم') + '<div class="sec">' + steps.map(function (a) { return '<p style="margin:0 0 12px"><b>' + a[0] + '</b><br><span class="mute">' + a[1] + '</span></p>'; }).join('') + '</div>' +
      '<div class="sec"><h3>حالت ساده و کامل</h3><p class="mute" style="margin:0">در حالت ساده فقط مواد و بسته‌بندی حساب می‌شود. در حالت کامل (از تنظیمات) دستمزد، سربار و قیمت عمده هم اضافه می‌شود.</p></div>' +
      '<div class="sec"><h3>آفلاین</h3><p class="mute" style="margin:0">برنامه بدون اینترنت هم کار می‌کند. اگر وارد حساب شده باشید، تغییرات با برگشتن اینترنت خودکار در ابر ذخیره می‌شود.</p></div>';
  }

  // ======================================================= account + cloud (per-item merge, no more "choose one")
  var cloud = { kind: '', msg: '', busy: false, timer: null, checked: null };
  function when(ts) { try { return new Date(ts).toLocaleString('fa-IR'); } catch (e) { return ts; } }
  function setCloud(kind, msg) { cloud.kind = kind; cloud.msg = msg; paintStat(); if (tab === 'acc') render(); }
  function paintStat() {
    var el = document.getElementById('syncstat'); if (!el) return;
    var who = document.getElementById('who'); if (who) { var pf = (S && S.user() && S.meta().prof) || null; who.textContent = (S && S.user()) ? (pf && pf.first ? pf.first + ' ' + (pf.last || '') : (S.user().email || '')) : 'بدون حساب'; }
    if (!S || !S.user()) { el.textContent = ''; el.className = 'sync'; return; }
    var offline = cloud.kind === 'err';
    var t = cloud.busy ? '… همگام‌سازی' : offline ? '⚠ بدون اتصال' : (S.meta().dirty ? '● روی گوشی ذخیره شد' : '✓ ذخیره در ابر');
    el.textContent = t; el.className = 'sync' + (offline ? ' bad' : '');
  }
  function profile() { var m = S.meta(); return { city: m.city || '', share: true }; }
  function scheduleSync() { clearTimeout(cloud.timer); paintStat(); cloud.timer = setTimeout(function () { syncNow(0); }, 1500); }
  // push; when another device saved in between, merge item by item and try again
  function syncNow(tries, force) {
    if (!S || !S.user() || cloud.busy) return Promise.resolve();
    cloud.busy = true; paintStat();
    return S.push(state, profile(), force).then(function (r) {
      if (r.conflict) {
        if ((tries || 0) >= 3) { cloud.busy = false; setCloud('err', 'همگام‌سازی کامل نشد؛ بعداً دوباره تلاش می‌شود.'); return; }
        return S.pull().then(function (row) {
          if (row) { state = L.mergeStates(state, row.state || {}); saveLocal(); var m = S.meta(); m.lastSynced = row.updated_at; S.saveMeta(); }
          cloud.busy = false; render(); return syncNow((tries || 0) + 1);
        });
      }
      cloud.busy = false; setCloud('ok', 'آخرین ذخیره در ابر: ' + when(Date.now()));
    }).catch(function (e) {
      cloud.busy = false;
      if (e && e.auth) setCloud('err', 'نشست شما تمام شده؛ دوباره وارد شوید.');
      else setCloud('err', 'اتصال برقرار نشد؛ تغییرات روی دستگاه ذخیره است و بعداً ارسال می‌شود. ' + ((e && e.text) || ''));
    });
  }
  // after login or on start: merge this device with the cloud, item by item
  function reconcile(justLoggedIn) {
    if (!S || !S.user()) return Promise.resolve();
    ensureProfile();
    cloud.busy = true; paintStat();
    return S.pull().then(function (row) {
      cloud.busy = false;
      var m = S.meta();
      if (!row) { m.lastSynced = null; return syncNow(0); }
      m.city = row.city || m.city || '';
      if (!justLoggedIn && m.lastSynced === row.updated_at) { return m.dirty ? syncNow(0) : setCloud('ok', 'همه‌چیز همگام است.'); }
      var remote = L.normalize(row.state || {}), merged = L.mergeStates(state, remote);
      state = merged; saveLocal(); m.lastSynced = row.updated_at;
      if (!state.profile.done && (state.items.length || state.ingredients.length)) state.profile.done = true;
      var needPush = !L.sameData(merged, remote);
      m.dirty = needPush; S.saveMeta();
      if (justLoggedIn || needPush) { if (tab === 'setup' && state.profile.done) tab = 'prods'; render(); }
      if (needPush) return syncNow(0);
      setCloud('ok', justLoggedIn ? 'اطلاعات ابر بارگذاری شد.' : 'همه‌چیز همگام است.');
    }).catch(function (e) {
      cloud.busy = false; setCloud('err', (e && e.auth) ? 'دوباره وارد شوید.' : 'اتصال برقرار نشد: ' + ((e && e.text) || ''));
    });
  }
  function adopt(st, at) {
    state = L.normalize(st); saveLocal(); var m = S.meta(); m.lastSynced = at; m.dirty = false; S.saveMeta();
    tab = state.profile.done ? 'prods' : 'setup'; setCloud('ok', 'اطلاعات از ابر بارگذاری شد.'); render();
  }
  function viewAcc() {
    var h = '';
    if (!S || !S.configured()) return lead('حساب', '') + '<div class="note">اتصال به سرور تنظیم نشده است.</div>';
    var u = S.user();
    if (!u) {
      h += lead('اطلاعاتتان گم نشود', 'بدون حساب هم می‌توانید کار کنید، اما اطلاعات فقط روی همین گوشی می‌ماند. با حساب، اطلاعات در ابر ذخیره می‌شود و با عوض‌کردن گوشی از بین نمی‌رود.');
      h += '<div class="sec stack"><div><label class="lbl" for="acc-email">ایمیل</label><input id="acc-email" type="email" dir="ltr" autocomplete="username" placeholder="name@example.com"></div>' +
        '<div><label class="lbl" for="acc-pass">رمز عبور (حداقل 8 کاراکتر)</label><input id="acc-pass" type="password" dir="ltr" autocomplete="current-password"></div>' +
        '<div class="grid2"><button class="btn pri" data-act="acc-in">ورود</button><button class="btn" data-act="acc-up">ثبت‌نام</button></div>' +
        (cloud.msg ? '<div class="note">' + esc(cloud.msg) + '</div>' : '') + '</div>';
    } else {
      var m = S.meta();
      h += lead('حساب شما', '') + '<div class="sec stack"><p dir="ltr" style="margin:0;text-align:right;font-weight:700">' + esc(u.email || '') + '</p>' +
        '<p style="margin:0">' + (cloud.busy ? 'در حال همگام‌سازی…' : m.dirty ? 'تغییرات هنوز در ابر ذخیره نشده‌اند.' : '<span class="pill ok">همگام با ابر</span>') + '</p>' +
        (cloud.msg ? '<p class="mute" style="margin:0">' + esc(cloud.msg) + '</p>' : '') +
        '<p class="mute sm" style="margin:0">اگر روی دو گوشی کار کنید، تغییرات هر مورد جدا ترکیب می‌شود و آخرین تغییر همان مورد می‌ماند.</p>' +
        '<div class="grid2"><button class="btn" data-act="acc-sync">همگام‌سازی الان</button><button class="btn" data-act="acc-out">خروج</button></div></div>' +
        '<div class="sec stack"><h3>مشخصات شما</h3>' + (m.profileErr ? '<div class="note warn">مشخصات روی سرور ذخیره نشد: ' + esc(m.profileErr) + '</div>' : '') +
        '<div class="grid2"><div><label class="lbl" for="acc-first">نام</label><input id="acc-first" value="' + esc((m.prof || {}).first || '') + '"></div><div><label class="lbl" for="acc-last">نام خانوادگی</label><input id="acc-last" value="' + esc((m.prof || {}).last || '') + '"></div></div>' +
        '<div><label class="lbl">شمارهٔ موبایل</label><input value="' + esc((m.prof || {}).phone || '') + '" dir="ltr" disabled></div>' +
        '<div><label class="lbl" for="acc-city">شهر</label><input id="acc-city" value="' + esc(m.city || '') + '" list="gf-cities"></div>' +
        '<button class="btn" data-act="acc-prof">ذخیرهٔ مشخصات</button>' +
        '<button class="btn block" data-act="go-policy">سیاست‌ها و شرایط استفاده</button></div>' +
        '<div class="sec"><details><summary>اگر همگام‌سازی درست کار نکرد</summary><div class="stack"><button class="btn block" data-act="acc-usecloud">فقط نسخهٔ ابر را بگیر (اطلاعات این گوشی کنار گذاشته می‌شود)</button><button class="btn block danger" data-act="acc-usethis">اطلاعات ابر را با این گوشی عوض کن</button></div></details></div>' +
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
      if (pw.length < 8) { setCloud('err', 'رمز عبور حداقل 8 کاراکتر باشد.'); return; }
      setCloud('', 'در حال ارتباط با سرور…');
      (act === 'acc-in' ? S.signIn(em, pw).then(function () { return true; }) : S.signUp(em, pw).then(function (r) { if (r.needConfirm) { setCloud('', 'ایمیل تأیید برای شما ارسال شد؛ لینک آن را باز کنید و بعد وارد شوید.'); return false; } return true; }))
        .then(function (ok) { if (!ok) return; cloud.msg = ''; paintStat(); render(); return reconcile(true); })
        .catch(function (e) { setCloud('err', (e && e.text) || 'اتصال به سرور برقرار نشد. اینترنت را بررسی کنید.'); });
    } else if (act === 'acc-out') {
      if (S.meta().dirty && !confirm('تغییرات اخیر هنوز در ابر ذخیره نشده‌اند. با خروج، اطلاعات این دستگاه پاک می‌شود و آن تغییرات از دست می‌روند. ادامه؟')) return;
      if (!confirm('با خروج، اطلاعات از روی این گوشی پاک می‌شود (در ابر می‌ماند). خروج؟')) return;
      S.signOut(); state = L.blank(); saveLocal(); wz = null; cloud = { kind: '', msg: '', busy: false, timer: null, checked: cloud.checked }; tab = 'setup'; gf = { mode: 'in', first: '', last: '', phone: '', city: '', pass: '', agree: false, msg: '' }; paintStat(); render();
    } else if (act === 'acc-sync') { reconcile(false); }
    else if (act === 'acc-usecloud') { S.pull().then(function (row) { if (row) adopt(row.state || {}, row.updated_at); }).catch(function (e) { setCloud('err', (e && e.text) || 'اتصال برقرار نشد'); }); }
    else if (act === 'acc-usethis') { if (confirm('اطلاعات ابر با اطلاعات این دستگاه جایگزین شود؟')) syncNow(0, true); }
    else if (act === 'acc-prof') { var m = S.meta(), pr = m.prof || {}; m.city = v('acc-city'); m.prof = { first: v('acc-first') || pr.first, last: v('acc-last') || pr.last, phone: pr.phone, city: m.city, v: pr.v || POLICY_V, at: pr.at || new Date().toISOString() }; S.saveMeta(); S.markDirty(); S.saveProfile({ user_id: S.user().id, first_name: m.prof.first, last_name: m.prof.last, phone: m.prof.phone, city: m.city, policy_version: m.prof.v, accepted_at: m.prof.at, app_version: VER }).then(function () { m.profileErr = ''; S.saveMeta(); render(); }).catch(function (e) { m.profileErr = (e && e.text) || 'خطا'; S.saveMeta(); render(); }); syncNow(0); setCloud('ok', 'مشخصات ذخیره شد.'); }
    else if (act === 'acc-del') { if (!confirm('اطلاعات شما از ابر حذف شود؟')) return; S.deleteCloud().then(function () { setCloud('ok', 'اطلاعات ابری حذف شد.'); }).catch(function (e) { setCloud('err', (e && e.text) || 'اتصال برقرار نشد'); }); }
    else if (act === 'acc-check') {
      cloud.checked = 'در حال بررسی…'; render();
      S.check().then(function (r) { cloud.checked = r.emailOff ? '⚠ سرور در دسترس است اما ورود با ایمیل در Supabase خاموش است. در Supabase: Authentication ← Sign In / Providers ← Email را روشن کنید و Save بزنید.' : '✓ سرور در دسترس است. ' + (r.signupDisabled ? 'ثبت‌نام بسته است. ' : '') + (r.autoconfirm ? 'ثبت‌نام بدون تأیید ایمیل فعال است.' : 'ثبت‌نام نیاز به تأیید ایمیل دارد؛ در Supabase گزینهٔ Confirm email را خاموش و Save کنید.'); render(); })
        .catch(function (e) { cloud.checked = '✗ ' + ((e && e.text) || 'سرور در دسترس نیست (فیلترشکن لازم است یا اینترنت قطع است).'); render(); });
    }
  }

  // ======================================================= sellable waste
  function viewWaste() {
    var w = W();
    var h = lead('ضایعات قابل فروش', 'هر چیزی که از کار می‌ماند و می‌فروشید، مثل استخوان یا روغن مصرف‌شده. اینجا اسم و قیمت فروشش را بنویسید؛ مقدارش را داخل هر ' + w.one + ' می‌نویسید و از هزینه کم می‌شود.');
    if (!state.wastes.length) return h + empty('هنوز ضایعاتی ثبت نکرده‌اید', 'مثلاً «استخوان» یا «روغن مصرف‌شده».', [['ws-add', 'افزودن ضایعات', true]]);
    state.wastes.forEach(function (x) {
      var n = state.items.filter(function (it) { return (it.waste || []).some(function (l) { return l.wasteId === x.id; }); }).length;
      h += '<div class="item" data-id="' + x.id + '"><div class="rowx"><div class="grow"><input data-f="ws-name" value="' + esc(x.name) + '" placeholder="مثلاً استخوان" aria-label="نام ضایعات"></div><button class="x" data-act="ws-del" aria-label="حذف">' + ICON('trash') + '</button></div>' +
        '<div class="grid2" style="margin-top:8px"><div><span class="lbl">اندازه‌گیری با</span><select data-f="ws-unit" aria-label="واحد"><option value="kg"' + (x.unit === 'kg' ? ' selected' : '') + '>کیلوگرم</option><option value="piece"' + (x.unit === 'piece' ? ' selected' : '') + '>عدد</option></select></div>' +
        '<div><span class="lbl">قیمت فروش هر ' + (x.unit === 'piece' ? 'عدد' : 'کیلوگرم') + '</span>' + numField('ws-price', x.price, ' aria-label="قیمت فروش"', true) + '</div></div>' +
        '<p class="mute sm" style="margin:8px 0 0">' + (n ? 'در ' + n + ' ' + esc(w.one) + ' استفاده شده.' : 'هنوز در هیچ ' + esc(w.one) + ' استفاده نشده؛ مقدارش را داخل خود ' + esc(w.one) + ' بنویسید.') + '</p></div>';
    });
    return h + '<button class="btn pri block" data-act="ws-add">' + ICON('plus') + 'ضایعات جدید</button>';
  }


  // ======================================================= debts and receivables (reminder only)
  var JM = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  function g2j(gy, gm, gd) {
    var gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334], jy = (gy <= 1600) ? 0 : 979;
    gy -= (gy <= 1600) ? 621 : 1600;
    var gy2 = (gm > 2) ? (gy + 1) : gy;
    var days = (365 * gy) + ~~((gy2 + 3) / 4) - ~~((gy2 + 99) / 100) + ~~((gy2 + 399) / 400) - 80 + gd + gdm[gm - 1];
    jy += 33 * ~~(days / 12053); days %= 12053;
    jy += 4 * ~~(days / 1461); days %= 1461;
    if (days > 365) { jy += ~~((days - 1) / 365); days = (days - 1) % 365; }
    var jm = (days < 186) ? 1 + ~~(days / 31) : 7 + ~~((days - 186) / 30), jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
    return [jy, jm, jd];
  }
  function j2g(jy, jm, jd) {
    var gy = (jy <= 979) ? 621 : 1600; jy -= (jy <= 979) ? 0 : 979;
    var days = (365 * jy) + (~~(jy / 33)) * 8 + ~~(((jy % 33) + 3) / 4) + 78 + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
    gy += 400 * ~~(days / 146097); days %= 146097;
    if (days > 36524) { gy += 100 * ~~(--days / 36524); days %= 36524; if (days >= 365) days++; }
    gy += 4 * ~~(days / 1461); days %= 1461;
    if (days > 365) { gy += ~~((days - 1) / 365); days = (days - 1) % 365; }
    var gd = days + 1, sal = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], gm;
    for (gm = 0; gm < 13; gm++) { var v = sal[gm]; if (gd <= v) break; gd -= v; }
    return [gy, gm, gd];
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isoOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function isoParts(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? [+m[1], +m[2], +m[3]] : null; }
  function daysTo(iso) {
    var a = isoParts(iso), b = isoParts(isoOf(new Date())); if (!a) return null;
    return Math.round((Date.UTC(a[0], a[1] - 1, a[2]) - Date.UTC(b[0], b[1] - 1, b[2])) / 864e5);
  }
  function plusDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return isoOf(d); }
  function jShow(iso) { var p = isoParts(iso); if (!p) return ''; var j = g2j(p[0], p[1], p[2]); return j[0] + '/' + pad2(j[1]) + '/' + pad2(j[2]); }
  function dRem(d) { return Math.max(0, L.num(d.amount) - L.num(d.paid)); }
  function dDone(d) { return L.num(d.amount) > 0 && dRem(d) === 0; }
  var dbf = 'open';
  function copyText(tx, ta) {
    try { if (ta) ta.select(); document.execCommand('copy'); } catch (e) {}
    if (navigator.clipboard) { try { navigator.clipboard.writeText(tx); } catch (e) {} }
  }
  function newDebt() { var d = { id: uid(), name: '', dir: 'owed', amount: 0, paid: 0, due: '', phone: '', note: '', u: now() }; state.debts.push(d); tab = 'debts'; dbf = 'open'; focusSel = '#list .item:last-child [data-f="db-name"]'; }
  function debtBanner() {
    var n = 0, over = 0;
    (state.debts || []).forEach(function (d) { if (dDone(d) || !d.due || L.num(d.amount) <= 0) return; var k = daysTo(d.due); if (k != null && k <= 3) { n++; if (k < 0) over++; } });
    if (!n) return '';
    return '<div class="banner">' + ICON('bell') + '<span>' + n + ' مورد از بدهی و طلب‌های شما سررسید شده یا تا 3 روز دیگر موعد دارد' + (over ? ' (' + over + ' مورد گذشته)' : '') + '.</span><button class="btn sm pri" data-act="go-debts">دیدن</button></div>';
  }
  function debtMsg(d) {
    return 'سلام ' + (d.name || '') + ' عزیز، یادآوری دوستانه: مبلغ ' + fmt(dRem(d)) + ' تومان' + (d.note ? ' بابت ' + d.note : '') + ' هنوز مانده است' + (d.due ? ' (موعد: ' + jShow(d.due) + ')' : '') + '. هر وقت امکانش بود لطفاً واریز کنید. ممنون از لطفتان.';
  }
  function dueHtml(d) {
    var p = isoParts(d.due), h = '<span class="lbl">تاریخ موعد (شمسی)</span>';
    if (p) {
      var j = g2j(p[0], p[1], p[2]);
      h += '<div class="jd"><input type="number" inputmode="numeric" data-f="db-jy" value="' + j[0] + '" aria-label="سال"><select data-f="db-jm" aria-label="ماه">' + JM.map(function (m, i) { return '<option value="' + (i + 1) + '"' + (i + 1 === j[1] ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select><input type="number" inputmode="numeric" min="1" max="31" data-f="db-jd" value="' + j[2] + '" aria-label="روز"></div>';
      h += '<div style="margin-top:8px"><button class="btn sm" data-act="db-due-clear">بدون موعد</button></div>';
    } else {
      h += '<div class="acts" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="db-due-7">7 روز دیگر</button><button class="btn sm" data-act="db-due-30">30 روز دیگر</button><button class="btn sm" data-act="db-due-0">امروز</button></div>';
    }
    return h;
  }
  function debtCard(d) {
    var owed = d.dir !== 'owe', rem = dRem(d), done = dDone(d), k = daysTo(d.due), chip = '';
    if (done) chip = '<span class="chip ok">تسویه شد</span>';
    else if (k != null) chip = k < 0 ? '<span class="chip up">' + (-k) + ' روز گذشته</span>' : (k === 0 ? '<span class="chip sun">موعد امروز</span>' : '<span class="chip' + (k <= 3 ? ' sun' : '') + '">' + k + ' روز مانده</span>');
    var h = '<div class="item debt' + (done ? ' done' : '') + '" data-id="' + d.id + '"><div class="rowx"><div class="grow"><input data-f="db-name" value="' + esc(d.name) + '" placeholder="نام شخص" aria-label="نام شخص"></div><button class="x" data-act="db-del" aria-label="حذف">' + ICON('trash') + '</button></div>' +
      '<div class="seg" style="margin-top:8px"><button data-act="db-dir-owed" class="' + (owed ? 'on' : '') + '">از او طلب دارم</button><button data-act="db-dir-owe" class="' + (!owed ? 'on' : '') + '">به او بدهکارم</button></div>' +
      '<div class="grid2" style="margin-top:8px"><div><span class="lbl">مبلغ کل (تومان)</span>' + numField('db-amount', d.amount, ' aria-label="مبلغ"', true) + '</div><div><span class="lbl">' + (owed ? 'تا حالا دریافت شده' : 'تا حالا پرداخت شده') + '</span>' + numField('db-paid', d.paid, ' aria-label="پرداخت‌شده"', true) + '</div></div>' +
      '<div style="margin-top:8px">' + dueHtml(d) + '</div>' +
      '<div class="grid2" style="margin-top:8px"><div><span class="lbl">شماره تماس (اختیاری)</span><input data-f="db-phone" inputmode="tel" dir="ltr" style="text-align:right" value="' + esc(d.phone) + '"></div><div><span class="lbl">بابت چه؟ (اختیاری)</span><input data-f="db-note" value="' + esc(d.note) + '"></div></div>' +
      '<div class="meta">' + chip + (done ? '' : '<span class="mute">مانده: <b style="color:var(--ink);direction:ltr;display:inline-block">' + fmt(rem) + '</b> تومان</span>') + '</div>';
    if (!done && L.num(d.amount) > 0) {
      h += '<div class="acts"><button class="btn sm pri" data-act="db-settle">' + ICON('check') + 'تسویه شد</button>' +
        (owed ? '<button class="btn sm" data-act="db-msg">' + ICON('share') + 'متن یادآوری</button>' : '') +
        (d.phone ? '<a class="btn sm" href="tel:' + esc(String(d.phone).replace(/[^\d+]/g, '')) + '">تماس</a>' : '') + '</div>';
    }
    return h + '</div>';
  }
  function viewDebts() {
    var h = lead('بدهی و طلب', 'اسم کسانی که به شما بدهکارند یا شما به آن‌ها بدهکارید، با مبلغ و موعد. فقط یادآوری است؛ پولی جابه‌جا نمی‌شود.');
    if (!state.debts.length) return h + empty('هنوز موردی ثبت نکرده‌اید', 'مثلاً «آقای رضایی ۲ میلیون بابت سفارش کیک» یا «فروشندهٔ آرد».', [['db-add', 'افزودن بدهی یا طلب', true]]);
    var sumOwed = 0, sumOwe = 0;
    state.debts.forEach(function (d) { if (d.dir === 'owe') sumOwe += dRem(d); else sumOwed += dRem(d); });
    h += '<div class="sums"><div class="g"><small>طلب من از مردم</small><b>' + fmt(sumOwed) + '</b></div><div class="r"><small>بدهی من به مردم</small><b>' + fmt(sumOwe) + '</b></div></div>';
    h += '<div class="seg" style="margin-bottom:12px">' + [['open', 'باز'], ['owed', 'طلب'], ['owe', 'بدهی'], ['done', 'تسویه‌شده']].map(function (x) { return '<button data-act="db-f-' + x[0] + '" class="' + (dbf === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>';
    var list = state.debts.filter(function (d) {
      if (dbf === 'done') return dDone(d);
      if (dDone(d)) return false;
      return dbf === 'open' || (dbf === 'owed' ? d.dir !== 'owe' : d.dir === 'owe');
    }).sort(function (a, b) { var x = a.due || '9999', y = b.due || '9999'; return x < y ? -1 : x > y ? 1 : 0; });
    h += '<div id="list">' + (list.length ? list.map(debtCard).join('') : '<p class="mute" style="text-align:center">موردی در این بخش نیست.</p>') + '</div>';
    return h + '<button class="btn pri block" data-act="db-add">' + ICON('plus') + 'بدهی یا طلب جدید</button>';
  }

  // ======================================================= food labels with nutrition table
  var ALG = [['gluten', 'گلوتن (گندم، جو، چاودار)'], ['milk', 'شیر و لبنیات'], ['egg', 'تخم‌مرغ'], ['peanut', 'بادام‌زمینی'], ['nuts', 'آجیل درختی (گردو، بادام، پسته، فندق)'], ['sesame', 'کنجد'], ['soy', 'سویا'], ['fish', 'ماهی'], ['shell', 'سخت‌پوستان']];
  var NUTF = [['k', 'انرژی (kcal)'], ['f', 'چربی (g)'], ['s', 'چربی اشباع (g)'], ['c', 'کربوهیدرات (g)'], ['su', 'قند (g)'], ['p', 'پروتئین (g)'], ['na', 'سدیم (mg)']];
  // rough typical values per 100 g from general food tables; NOT verified here. The pack of the real product is more accurate.
  var PRE = [['آرد گندم سفید', 364, 1, 0.2, 76, 0.3, 10, 2], ['شکر', 387, 0, 0, 100, 100, 0, 1], ['کره (بدون نمک)', 717, 81, 51, 0.1, 0.1, 0.9, 11], ['شیر کامل', 61, 3.3, 1.9, 4.8, 5.1, 3.2, 43],
    ['تخم‌مرغ (کامل)', 143, 9.5, 3.1, 0.7, 0.4, 12.6, 142], ['روغن مایع', 884, 100, 15, 0, 0, 0, 0], ['نمک', 0, 0, 0, 0, 0, 0, 38758], ['برنج (خام)', 365, 0.7, 0.2, 80, 0.1, 7.1, 5],
    ['عسل', 304, 0, 0, 82, 82, 0.3, 4], ['گردو', 654, 65, 6.1, 14, 2.6, 15, 2], ['بادام', 579, 50, 3.8, 22, 4.4, 21, 1], ['پسته', 560, 45, 5.5, 28, 7.7, 20, 1],
    ['ماست ساده', 61, 3.3, 2.1, 4.7, 4.7, 3.5, 46], ['پودر کاکائو', 228, 14, 8, 58, 1.8, 20, 21], ['خرما', 282, 0.4, 0, 75, 63, 2.5, 2], ['خامه (35٪ چربی)', 340, 36, 23, 2.8, 2.9, 2.1, 38],
    ['نشاسته ذرت', 381, 0.1, 0, 91, 0, 0.3, 9], ['سینه مرغ (خام)', 120, 2.6, 0.6, 0, 0, 22.5, 45]];
  function newLabel() { var b = { id: uid(), name: '', net: 0, serv: 0, fin: 0, lines: [], alg: {}, may: '', prod: state.settings.shopName || '', contact: state.settings.contact || '', shelf: '', store: '', u: now() }; state.labels.push(b); cur = b.id; tab = 'label'; focusSel = '[data-f="lb-name"]'; }
  function fn1(v) { return String(Math.round((Number(v) || 0) * 10) / 10); }
  function nutVal(key, v) { return key === 'k' || key === 'na' ? String(Math.round(v)) : fn1(v); }
  function viewLabels() {
    var h = lead('برچسب و ارزش غذایی', 'برای محصول بسته‌بندی‌شده: فهرست ترکیبات، آلرژن‌ها و جدول ارزش غذایی را بسازید و به‌صورت تصویر برای چاپ یا ارسال ذخیره کنید.');
    if (!state.labels.length) return h + empty('هنوز برچسبی نساخته‌اید', 'مواد و گرم هر کدام را بنویسید؛ جدول ارزش غذایی خودکار حساب می‌شود.', [['lb-add', 'ساخت برچسب جدید', true]]);
    state.labels.forEach(function (b) {
      var c = L.labelCalc(b);
      h += '<button class="pcard" data-act="lb-open" data-id="' + b.id + '"><div class="top"><span class="nm">' + esc(b.name || '(بدون نام)') + '</span><span class="pr">' + (c.per100 ? Math.round(c.per100.k) + ' kcal' : '—') + '</span></div><div class="meta"><span>' + b.lines.length + ' ماده</span>' + (b.net ? '<span>وزن خالص ' + b.net + ' گرم</span>' : '') + '</div></button>';
    });
    return h + '<button class="btn pri block" data-act="lb-add">' + ICON('plus') + 'برچسب جدید</button>';
  }
  function labelRows(b, c) {
    return NUTF.map(function (n, i) { return { label: n[1], sub: n[0] === 's' || n[0] === 'su', per100: nutVal(n[0], c.per100[n[0]]), perServ: c.serv ? nutVal(n[0], c.serv[n[0]]) : '' }; });
  }
  function viewLabel() {
    var b = find(state.labels, cur); if (!b) { tab = 'labels'; return viewLabels(); }
    var c = L.labelCalc(b), s = state.settings;
    var h = '<button class="back" data-act="go-labels">' + ICON('back') + 'برچسب‌ها</button>' + lead('ساخت برچسب', 'اطلاعات را پر کنید؛ جدول پایین صفحه خودکار حساب می‌شود.');
    h += '<div data-id="' + b.id + '"><div class="sec stack"><div><label class="lbl">نام محصول</label><input data-f="lb-name" value="' + esc(b.name) + '" placeholder="مثلاً کلوچهٔ گردویی"></div>' +
      '<div class="grid2"><div><span class="lbl">وزن خالص بسته (گرم)</span>' + numField('lb-net', b.net, ' aria-label="وزن خالص"') + '</div><div><span class="lbl">وزن هر وعده (گرم)</span>' + numField('lb-serv', b.serv, ' aria-label="وزن وعده"') + '</div></div>' +
      '<div><span class="lbl">وزن محصول پخته‌شده از این دستور (گرم)</span>' + numField('lb-fin', b.fin, ' aria-label="وزن نهایی"') + '<p class="mute sm" style="margin:2px 0 0">اگر در پخت وزن کم می‌شود، وزن نهایی را بنویسید. خالی باشد، جمع وزن مواد حساب می‌شود.</p></div></div>';
    h += '<div class="sec"><h3>مواد (به ترتیب مقدار)</h3><p class="mute sm" style="margin:0 0 6px">گرم هر ماده در این دستور، و ارزش غذایی آن در 100 گرم. می‌توانید مقدار را از روی بستهٔ ماده بنویسید یا از فهرست تقریبی انتخاب کنید.</p>';
    if (state.items.length) h += '<select data-f="lb-from" aria-label="گرفتن مواد از محصول"><option value="">گرفتن مواد از یکی از ' + esc(W().many) + '...</option>' + state.items.map(function (it) { return '<option value="' + it.id + '">' + esc(it.name || '(بدون نام)') + '</option>'; }).join('') + '</select>';
    b.lines.forEach(function (l, idx) {
      h += '<div class="item" data-line="' + idx + '" style="background:var(--surface2)"><div class="rowx"><div class="grow"><input data-f="lb-lname" value="' + esc(l.name) + '" placeholder="نام ماده" aria-label="نام ماده"></div><button class="x" data-act="lb-ldel" aria-label="حذف">' + ICON('trash') + '</button></div>' +
        '<div class="grid2" style="margin-top:8px"><div><span class="lbl">مقدار در دستور (گرم)</span>' + numField('lb-lg', l.g, ' aria-label="گرم"') + '</div><div><span class="lbl">پر کردن از فهرست تقریبی</span><select data-f="lb-pre" aria-label="فهرست"><option value="">انتخاب...</option>' + PRE.map(function (p, i) { return '<option value="' + i + '">' + p[0] + '</option>'; }).join('') + '</select></div></div>' +
        '<div class="nut">' + NUTF.map(function (n) { return '<div><span class="lbl">' + n[1] + '</span><input type="number" min="0" step="any" inputmode="decimal" data-f="lb-n" data-k="' + n[0] + '" value="' + (l[n[0]] || '') + '"></div>'; }).join('') + '</div></div>';
    });
    h += '<button class="btn block" data-act="lb-ladd" style="margin-top:8px">' + ICON('plus') + 'افزودن ماده</button></div>';
    h += '<div class="sec stack"><h3>آلرژن‌ها</h3><div class="algs">' + ALG.map(function (a) { return '<label class="switch"><input type="checkbox" data-f="lb-alg" data-k="' + a[0] + '"' + (b.alg[a[0]] ? ' checked' : '') + '> ' + a[1] + '</label>'; }).join('') + '</div>' +
      '<div><span class="lbl">ممکن است حاوی ردپای ... باشد (اختیاری)</span><input data-f="lb-may" value="' + esc(b.may) + '" placeholder="مثلاً بادام‌زمینی"></div></div>';
    h += '<div class="sec stack"><h3>تولیدکننده و نگهداری</h3><div><span class="lbl">نام تولیدکننده</span><input data-f="lb-prod" value="' + esc(b.prod) + '"></div><div><span class="lbl">نشانی یا تلفن</span><input data-f="lb-contact" value="' + esc(b.contact) + '"></div><div class="grid2"><div><span class="lbl">مدت نگهداری</span><input data-f="lb-shelf" value="' + esc(b.shelf) + '" placeholder="مثلاً 6 ماه"></div><div><span class="lbl">شرایط نگهداری</span><input data-f="lb-store" value="' + esc(b.store) + '" placeholder="جای خشک و خنک"></div></div></div>';
    h += '<div class="sec"><h3>جدول ارزش غذایی (محاسبه‌شده)</h3>';
    if (!c.per100) h += '<p class="mute">اول مواد و گرم هر کدام را بنویسید.</p>';
    else {
      h += '<table class="tbl"><tr><th></th><th>در 100 گرم</th>' + (c.serv ? '<th>در هر وعده (' + fn1(b.serv) + ' گرم)</th>' : '') + '</tr>' +
        NUTF.map(function (n) { return '<tr><td>' + n[1] + '</td><td>' + nutVal(n[0], c.per100[n[0]]) + '</td>' + (c.serv ? '<td>' + nutVal(n[0], c.serv[n[0]]) + '</td>' : '') + '</tr>'; }).join('') + '</table>';
      if (c.servings) h += '<p class="mute sm" style="margin:8px 0 0">حدود ' + fn1(c.servings) + ' وعده در هر بسته.</p>';
    }
    h += '</div><div class="warnbox"><b>توجه:</b> این اعداد با حساب از روی ارزش غذایی مواد به‌دست می‌آید، نه آزمایشگاه. اگر ارزش غذایی هر ماده را درست وارد نکنید، جدول هم درست نیست. فهرست تقریبی فقط شروع کار است. قبل از چاپ روی بسته، قالب و موارد اجباری برچسب را با قوانین و مرجعی که برای مجوز تولید دارید (مثلاً اداره غذا و دارو یا استاندارد) تطبیق دهید؛ این برنامه الزامات قانونی را تأیید نمی‌کند.</div>';
    h += '<div class="sec"><span class="lbl">رنگ</span><div class="themes">' + Object.keys(CARD.themes).map(function (k) { return '<button data-act="theme" data-k="' + k + '" class="' + (cardOpt.theme === k ? 'on' : '') + '">' + CARD.themes[k].name + '</button>'; }).join('') + '</div>' +
      '<button class="btn pri block" style="margin-top:12px" data-act="lb-make">ساخت تصویر برچسب</button><button class="btn danger block" style="margin-top:10px" data-act="lb-del">حذف این برچسب</button></div></div>';
    return h;
  }
  function makeLabel(b) {
    var c = L.labelCalc(b);
    if (!b.lines.length || !c.per100) { alert('اول مواد و گرم آن‌ها را بنویسید.'); return; }
    var sorted = b.lines.filter(function (l) { return l.name; }).sort(function (x, y) { return L.num(y.g) - L.num(x.g); });
    var o = { theme: cardOpt.theme, name: b.name, net: b.net > 0 ? fn1(b.net) : '', ingredients: sorted.map(function (l) { return l.name; }).join('، '),
      allergens: ALG.filter(function (a) { return b.alg[a[0]]; }).map(function (a) { return a[1].replace(/ \(.*\)/, ''); }), may: b.may, serv: !!c.serv, servG: fn1(b.serv), rows: labelRows(b, c),
      prod: b.prod, contact: b.contact, shelf: b.shelf, store: b.store };
    CARD.label(o).then(function (cv) { return Promise.all(cv.map(CARD.toBlob)); }).then(function (blobs) {
      closeSheet(); window._cardName = 'label'; urls = blobs.map(function (u) { return URL.createObjectURL(u); });
      openSheet('<div class="sheet" role="dialog" aria-label="پیش‌نمایش"><h3>پیش‌نمایش برچسب</h3>' + urls.map(function (u) { return '<img class="cardprev" src="' + u + '" alt="پیش‌نمایش برچسب">'; }).join('') +
        '<div class="warnbox" style="margin-top:0">اعداد محاسبه‌ای است. قبل از چاپ با قوانین برچسب‌گذاری تطبیق دهید.</div><button class="btn pri block" data-sheet="card-send">' + ICON('share') + 'ارسال یا ذخیره</button><button class="btn block" data-sheet="close" style="margin-top:10px">بستن</button></div>');
      window._cardBlobs = blobs;
    }).catch(function () { alert('ساخت تصویر ممکن نشد.'); });
  }


  // ======================================================= photos of menu items (kept on this phone only)
  var Photos = (function () {
    var db = null;
    function open() {
      return new Promise(function (res, rej) {
        if (db) return res(db);
        try {
          var r = indexedDB.open('tarazina-photos', 1);
          r.onupgradeneeded = function () { r.result.createObjectStore('p'); };
          r.onsuccess = function () { db = r.result; res(db); };
          r.onerror = function () { rej(r.error); };
        } catch (e) { rej(e); }
      });
    }
    function tx(mode, fn) {
      return open().then(function (d) {
        return new Promise(function (res, rej) {
          var t = d.transaction('p', mode), rq = fn(t.objectStore('p'));
          t.oncomplete = function () { res(rq && rq.result); }; t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error); };
        });
      });
    }
    return { put: function (id, b) { return tx('readwrite', function (s) { return s.put(b, id); }); }, get: function (id) { return tx('readonly', function (s) { return s.get(id); }); }, del: function (id) { return tx('readwrite', function (s) { return s.delete(id); }); } };
  })();
  function resizePhoto(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var k = Math.min(1, 900 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        cv.toBlob(function (b) { b ? res(b) : rej(new Error('blob')); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('img')); };
      img.src = url;
    });
  }
  var photoUrl = '';
  function photoSection(it) {
    return '<div class="sec"><h3>عکس ' + esc(W().one) + '</h3><div id="photobox"><p class="mute" style="margin:0 0 8px">بدون عکس. عکس روی کارت اینستاگرام هم می‌آید.</p></div>' +
      '<label class="btn block">' + ICON('card') + 'انتخاب یا گرفتن عکس<input type="file" accept="image/*" data-f="photo-in" hidden></label>' +
      '<button class="btn danger block" id="photodel" data-act="photo-del" style="margin-top:8px" hidden>حذف عکس</button>' +
      '<p class="mute sm" style="margin:8px 0 0">عکس‌ها فقط روی همین گوشی می‌مانند؛ در پشتیبان و ابر نیستند.</p></div>';
  }
  function paintPhoto() {
    if (tab !== 'prod' || !cur || !document.getElementById('photobox')) return;
    var id = cur;
    Photos.get(id).then(function (b) {
      var bx = document.getElementById('photobox'), del = document.getElementById('photodel'); if (!bx || cur !== id) return;
      if (!b) { if (del) del.hidden = true; return; }
      if (photoUrl) { try { URL.revokeObjectURL(photoUrl); } catch (e) {} }
      photoUrl = URL.createObjectURL(b); bx.innerHTML = '<img class="photoprev" alt="عکس محصول" src="' + photoUrl + '">'; if (del) del.hidden = false;
    }).catch(function () {});
  }
  function loadImgs(rows) {
    if (!cardOpt.photos) return Promise.resolve(rows);
    return Promise.all(rows.map(function (r) {
      return Photos.get(r.id).then(function (b) {
        if (!b) return;
        return new Promise(function (res) { var im = new Image(); im.onload = function () { r.img = im; res(); }; im.onerror = function () { res(); }; im.src = URL.createObjectURL(b); });
      }).catch(function () {});
    })).then(function () { return rows; });
  }

  // ======================================================= nutrition of ingredients and menu items
  function nutVal(key, v) { return key === 'k' || key === 'na' ? String(Math.round(v)) : fn1(v); }
  var openNut = {};
  function ingNutHtml(g) {
    var n = g.nut || {};
    return '<details' + (openNut[g.id] ? ' open' : '') + '><summary data-nut="1">ارزش غذایی (اختیاری)</summary>' +
      '<select data-f="ing-pre" aria-label="فهرست تقریبی"><option value="">پر کردن از فهرست تقریبی...</option>' + PRE.map(function (p, i) { return '<option value="' + i + '">' + p[0] + '</option>'; }).join('') + '</select>' +
      '<div class="nut">' + NUTF.map(function (f) { return '<div><span class="lbl">' + f[1] + '</span><input type="number" min="0" step="any" inputmode="decimal" data-f="ing-n" data-k="' + f[0] + '" value="' + (n[f[0]] || '') + '"></div>'; }).join('') + '</div>' +
      (g.unit === 'piece' ? '<div style="margin-top:8px"><span class="lbl">وزن هر عدد (گرم)</span>' + numField('ing-pg', g.pg || '', ' aria-label="وزن هر عدد"') + '</div>' : '') +
      '<p class="hintline">مقدار در 100 گرم (یا 100 میلی‌لیتر) ماده؛ از روی بستهٔ آن بنویسید. فهرست تقریبی دقیق نیست.</p></details>';
  }
  function nutSection(it) {
    var nu = L.itemNutrition(it, state), h = '<div class="sec"><h3>ارزش غذایی (اختیاری)</h3>';
    if (!nu.has) return h + '<p class="mute" style="margin:0">ارزش غذایی هر ماده را در «مواد اولیه» (بخش ارزش غذایی زیر هر ماده) بنویسید تا اینجا جدول کالری، پروتئین و چربی این محصول ساخته شود.</p></div>';
    var kg = nu.mode === 'kg';
    h += '<table class="tbl"><tr><th></th><th>' + (kg ? 'در هر کیلوگرم' : 'در هر عدد' + (nu.unitG > 0 ? ' (حدود ' + Math.round(nu.unitG) + ' گرم)' : '')) + '</th><th>در 100 گرم</th></tr>' +
      NUTF.map(function (f) { return '<tr><td>' + f[1] + '</td><td>' + nutVal(f[0], nu.perUnit[f[0]]) + '</td><td>' + nutVal(f[0], kg ? nu.perUnit[f[0]] / 10 : nu.per100[f[0]]) + '</td></tr>'; }).join('') + '</table>';
    if (nu.missing.length) h += '<div class="note warn">برای این مواد ارزش غذایی (یا وزن هر عدد) نوشته نشده و در جدول حساب نشده‌اند: ' + nu.missing.map(esc).join('، ') + '</div>';
    return h + '<p class="mute sm">محاسبه از روی ارزش غذایی مواد است، نه آزمایشگاه. برای مواد لیتری هر میلی‌لیتر یک گرم حساب شده و وزن، قبل از پخت است.</p><button class="btn block" data-act="lb-from-item">ساخت برچسب از این محصول</button></div>';
  }
  function lbLine(g, amount) {
    var n = g.nut || {}, gr = g.unit === 'piece' ? (L.num(g.pg) > 0 ? amount * L.num(g.pg) : 0) : amount;
    return { name: g.name, g: gr, k: L.num(n.k), f: L.num(n.f), s: L.num(n.s), c: L.num(n.c), su: L.num(n.su), p: L.num(n.p), na: L.num(n.na) };
  }
  function labelFromItem(it) {
    var nu = L.itemNutrition(it, state), b = { id: uid(), name: it.name, net: 0, serv: it.mode === 'piece' ? Math.round(nu.unitG) : 0, fin: 0, lines: [], alg: {}, may: '', prod: state.settings.shopName || '', contact: state.settings.contact || '', shelf: '', store: '', u: now() };
    (it.lines || []).forEach(function (l) { var g = find(state.ingredients, l.ingId); if (g) b.lines.push(lbLine(g, L.num(l.amount))); });
    state.labels.push(b); cur = b.id; tab = 'label';
  }
  function calTxt(it) {
    var nu = L.itemNutrition(it, state); if (!nu.has || !(nu.perUnit.k > 0)) return '';
    return nu.mode === 'kg' ? Math.round(nu.perUnit.k / 10) + ' کالری در 100 گرم' : Math.round(nu.perUnit.k) + ' کالری';
  }

  // ======================================================= shopping list
  var planQ = {};
  function viewShop() {
    var h = lead('لیست خرید', 'هر چیزی که می‌خواهید بخرید را بنویسید. اگر اسمش یکی از مواد اولیه‌تان باشد و قیمتش را نوشته باشید، همان قیمت حساب می‌شود؛ وگرنه می‌توانید بدون قیمت هم ادامه دهید.');
    h += '<datalist id="ingnames">' + state.ingredients.map(function (g) { return '<option value="' + esc(g.name) + '">'; }).join('') + '</datalist>';
    if (!state.shop.length) return h + empty('لیست خالی است', 'مثلاً «آرد» یا «جعبهٔ کیک». یا از برنامهٔ تولید بگیرید که برای ساختن تعداد مشخصی محصول چه چیزهایی لازم است.', [['sh-add', 'افزودن به لیست', true], ['sh-plan', 'ساخت از برنامهٔ تولید']]);
    var tt = L.shopTotals(state);
    h += '<div class="sums"><div><small>جمع تقریبی (خریده‌نشده‌ها)</small><b>' + fmt(tt.total) + '</b></div><div><small>بدون قیمت</small><b style="direction:rtl">' + tt.unknown + ' مورد</b></div></div>';
    state.shop.forEach(function (x) {
      var ing = x.ingId && find(state.ingredients, x.ingId), unit = ing ? ing.unit : (x.unit || ''), eff = L.shopPrice(x, state), line = eff > 0 && x.qty > 0 ? eff * x.qty : 0;
      h += '<div class="item' + (x.done ? ' bought' : '') + '" data-id="' + x.id + '"><div class="rowx"><label class="switch" style="margin-top:8px"><input type="checkbox" data-f="sh-done"' + (x.done ? ' checked' : '') + ' aria-label="خریده شد"></label><div class="grow"><input class="nm" data-f="sh-name" list="ingnames" value="' + esc(x.name) + '" placeholder="چه چیزی؟" aria-label="نام"></div><button class="x" data-act="sh-del" aria-label="حذف">' + ICON('trash') + '</button></div>' +
        '<div class="grid2" style="margin-top:8px"><div><span class="lbl">مقدار' + (unit ? ' (' + UNAME[unit] + ')' : '') + '</span>' + numField('sh-qty', x.qty || '', ' aria-label="مقدار"') + '</div>' +
        '<div><span class="lbl">قیمت هر ' + (unit ? UNAME[unit] : 'واحد') + ' (اختیاری)</span>' + numField('sh-price', x.price || '', ' aria-label="قیمت" placeholder="' + (ing && L.num(ing.price) > 0 ? fmt(ing.price) : '') + '"', true) + '</div></div>' +
        (ing ? '' : '<div style="margin-top:8px"><span class="lbl">واحد</span><select data-f="sh-unit" aria-label="واحد"><option value="">—</option>' + [['kg', 'کیلوگرم'], ['l', 'لیتر'], ['piece', 'عدد']].map(function (u) { return '<option value="' + u[0] + '"' + (x.unit === u[0] ? ' selected' : '') + '>' + u[1] + '</option>'; }).join('') + '</select></div>') +
        '<p class="mute sm" style="margin:8px 0 0">' + (line > 0 ? 'جمع: <b style="color:var(--ink)">' + fmt(line) + '</b> تومان' + (ing && !(x.price > 0) ? ' (با قیمت ماده)' : '') : 'بدون قیمت') + '</p></div>';
    });
    return h + '<button class="btn pri block" data-act="sh-add">' + ICON('plus') + 'افزودن به لیست</button><div class="grid2" style="margin-top:10px"><button class="btn" data-act="sh-plan">برنامهٔ تولید</button><button class="btn" data-act="sh-share">' + ICON('share') + 'متن لیست</button></div>' +
      '<button class="btn block" style="margin-top:10px" data-act="sh-clear">پاک کردن خریده‌شده‌ها</button>';
  }
  function shopText() {
    return 'لیست خرید\n' + state.shop.filter(function (x) { return !x.done && x.name; }).map(function (x) {
      var ing = x.ingId && find(state.ingredients, x.ingId), unit = ing ? ing.unit : x.unit;
      return '- ' + x.name + (x.qty ? ' — ' + (Math.round(x.qty * 1000) / 1000) + (unit ? ' ' + UNAME[unit] : '') : '');
    }).join('\n');
  }
  function planSheet() {
    if (!state.items.length) { alert('اول یک محصول بسازید.'); return; }
    planQ = {};
    openSheet('<div class="sheet" role="dialog" aria-label="برنامهٔ تولید"><h3>برنامهٔ تولید</h3><p class="mute" style="margin-top:0">از هر محصول چند عدد (یا چند کیلو) می‌خواهید بسازید؟ مواد لازم، با ضایعات، به لیست خرید اضافه می‌شود.</p>' +
      state.items.map(function (it) { return '<div class="sl-row"><div class="tx">' + esc(it.name || '(بدون نام)') + '<small>' + (it.mode === 'kg' ? 'کیلوگرم' : 'عدد') + '</small></div><input type="number" min="0" step="any" inputmode="decimal" style="width:100px" data-plan="' + it.id + '" aria-label="تعداد"></div>'; }).join('') +
      '<button class="btn pri block" style="margin-top:12px" data-sheet="plan-go">افزودن به لیست خرید</button><button class="btn block" data-sheet="close" style="margin-top:10px">بستن</button></div>');
  }
  function planGo() {
    var need = L.planNeeds(state, planQ);
    if (!need.length) { alert('تعداد هیچ محصولی نوشته نشده.'); return; }
    need.forEach(function (n) {
      var ex = state.shop.filter(function (x) { return x.ingId === n.ingId && !x.done; })[0], q = Math.round(n.qty * 1000) / 1000;
      if (ex) { ex.qty = Math.round((L.num(ex.qty) + q) * 1000) / 1000; touch(ex); }
      else state.shop.push({ id: uid(), name: n.name, ingId: n.ingId, unit: n.unit, qty: q, price: 0, done: false, u: now() });
    });
    closeSheet(); save(); render();
  }

  // ======================================================= daily sales log
  var salesDay = '';
  function viewSales() {
    var today = isoOf(new Date()); if (!salesDay) salesDay = today;
    var h = lead('ثبت فروش روزانه', 'هنگام فروش روی + بزنید، یا آخر روز تعداد فروش هر محصول را یک‌جا بنویسید. سود با قیمت فروش و هزینهٔ همان زمان حساب می‌شود.');
    if (!state.items.length) return h + empty('هنوز محصولی ندارید', 'اول محصول بسازید و قیمت فروشش را بنویسید.', [['go-prods', 'رفتن به ' + W().many, true]]);
    h += '<div class="daynav"><button class="btn sm" data-act="sl-prev">روز قبل</button><b>' + (salesDay === today ? 'امروز · ' : '') + jShow(salesDay) + '</b><button class="btn sm" data-act="sl-next"' + (salesDay >= today ? ' disabled' : '') + '>روز بعد</button></div>';
    if (salesDay !== today) h += '<button class="btn sm block" style="margin:-4px 0 12px" data-act="sl-today">برگشت به امروز</button>';
    var d = L.salesSummary(state, salesDay, salesDay);
    h += '<div class="sums"><div class="g"><small>فروش این روز</small><b>' + fmt(d.rev) + '</b></div><div class="' + (d.profit >= 0 ? 'g' : 'r') + '"><small>سود تقریبی</small><b>' + fmt(d.profit) + '</b></div></div>';
    h += '<div class="sec">';
    state.items.forEach(function (it) {
      var rec = find(state.sales, 'sl_' + salesDay + '_' + it.id), q = rec ? rec.qty : 0;
      h += '<div class="sl-row"><div class="tx">' + esc(it.name || '(بدون نام)') + '<small>' + (L.num(it.price) > 0 ? fmt(it.price) + ' تومان ' + unitWord(it) : 'قیمت فروش را در محصول بنویسید') + '</small></div>' +
        '<div class="cnt"><button data-act="sl-minus" data-k="' + it.id + '" aria-label="کم">−</button><input type="number" min="0" step="any" inputmode="decimal" data-f="sl-qty" data-k="' + it.id + '" value="' + (q || '') + '" placeholder="0" aria-label="تعداد فروش"><button class="p" data-act="sl-plus" data-k="' + it.id + '" aria-label="زیاد">+</button></div></div>';
    });
    h += '</div>';
    var days = [], i; for (i = 0; i < 7; i++) { var dd = new Date(); dd.setDate(dd.getDate() - i); days.push(isoOf(dd)); }
    var w7 = L.salesSummary(state, days[6], days[0]), m = new Date(); m.setDate(m.getDate() - 29); var m30 = L.salesSummary(state, isoOf(m), today);
    h += '<div class="sec"><h3>خلاصه</h3><table class="tbl"><tr><th></th><th>فروش</th><th>سود تقریبی</th></tr><tr><td>7 روز اخیر</td><td>' + fmt(w7.rev) + '</td><td>' + fmt(w7.profit) + '</td></tr><tr><td>30 روز اخیر</td><td>' + fmt(m30.rev) + '</td><td>' + fmt(m30.profit) + '</td></tr></table>' +
      '<table class="tbl" style="margin-top:12px">' + days.map(function (iso) { var s = L.salesSummary(state, iso, iso); return '<tr><td>' + jShow(iso) + '</td><td>' + fmt(s.rev) + '</td><td>' + fmt(s.profit) + '</td></tr>'; }).join('') + '</table>' +
      '<p class="mute sm" style="margin:8px 0 0">سود = فروش منهای هزینهٔ مواد و بسته‌بندی (و دستمزد در حالت کامل). اگر بعداً قیمت یا هزینه را عوض کنید و همان روز را دوباره ویرایش کنید، عدد آن روز با قیمت جدید حساب می‌شود.</p></div>';
    return h;
  }
  function setSale(itemId, qty) {
    var it = find(state.items, itemId); if (!it) return;
    var id = 'sl_' + salesDay + '_' + itemId, rec = find(state.sales, id); qty = Math.max(0, qty);
    if (qty === 0) { if (rec) { gone(id); state.sales = state.sales.filter(function (x) { return x.id !== id; }); } return; }
    if (!rec) { rec = { id: id, date: salesDay, itemId: itemId, name: it.name, qty: 0, price: 0, cost: 0, u: now() }; state.sales.push(rec); }
    rec.qty = qty; rec.name = it.name; rec.price = L.num(it.price); rec.cost = L.unitCost(it, C()); touch(rec);
  }

  // ======================================================= phone notifications for due debts (installed Android app only)
  var LNp;
  function getLN() {
    if (LNp !== undefined) return LNp;
    LNp = null;
    try { var Cp = window.Capacitor; if (Cp && Cp.isNativePlatform && Cp.isNativePlatform() && Cp.registerPlugin) LNp = Cp.registerPlugin('LocalNotifications'); } catch (e) { LNp = null; }
    return LNp;
  }
  function notifId(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 2000000000; }
  function syncNotifs() {
    var LN = getLN(); if (!LN) return Promise.resolve();
    return LN.getPending().then(function (p) {
      var ids = (p.notifications || []).map(function (n) { return { id: n.id }; });
      return ids.length ? LN.cancel({ notifications: ids }) : null;
    }).then(function () {
      if (!state.settings.debtNotify) return;
      var list = [];
      state.debts.forEach(function (d) {
        if (dDone(d) || !d.due || L.num(d.amount) <= 0) return;
        var p = isoParts(d.due), at = new Date(p[0], p[1] - 1, p[2], 9, 0, 0);
        if (at.getTime() <= Date.now()) return;
        list.push({ id: notifId(d.id), title: d.dir === 'owe' ? 'موعد پرداخت بدهی' : 'موعد دریافت طلب', body: (d.name || '') + ' · ' + fmt(dRem(d)) + ' تومان', schedule: { at: at } });
      });
      if (list.length) return LN.schedule({ notifications: list });
    }).catch(function () {});
  }
  var notifT = null;
  function notifSoon() { if (!getLN()) return; clearTimeout(notifT); notifT = setTimeout(syncNotifs, 800); }
  function setNotify(on) {
    var LN = getLN(); if (!LN) return;
    if (!on) { state.settings.debtNotify = false; touchSettings(); save(); render(); return; }
    LN.requestPermissions().then(function (r) {
      var ok = !!(r && r.display === 'granted'); state.settings.debtNotify = ok; state.settings.debtAsked = true; touchSettings(); save(); render();
      if (!ok) alert('اجازهٔ اعلان داده نشد. از تنظیمات گوشی برای این برنامه اعلان‌ها را روشن کنید.');
    }).catch(function () { state.settings.debtNotify = false; touchSettings(); save(); render(); alert('روشن کردن اعلان ممکن نشد.'); });
  }
  function askNotif() {
    if (!getLN() || state.settings.debtAsked) return;
    state.settings.debtAsked = true; touchSettings(); saveLocal();
    openSheet('<div class="sheet" role="dialog" aria-label="یادآوری روی گوشی"><h3>یادآوری روی گوشی؟</h3><p class="mute" style="margin-top:0">می‌خواهید صبح روز موعد هر بدهی یا طلب یک اعلان روی گوشی بیاید؟ بعداً از تنظیمات هم می‌توانید روشن یا خاموش کنید.</p><button class="btn pri block" data-sheet="notif-yes">بله، روشن شود</button><button class="btn block" style="margin-top:10px" data-sheet="notif-no">نه، فعلاً نه</button></div>');
  }
  function notifSettingHtml() {
    var h = '<div class="sec stack"><h3>یادآوری بدهی و طلب روی گوشی</h3>';
    if (!getLN()) return h + '<p class="mute" style="margin:0">این بخش فقط در برنامهٔ نصب‌شدهٔ اندروید کار می‌کند.</p></div>';
    return h + '<label class="switch" style="color:var(--ink)"><input type="checkbox" data-f="st-notify"' + (state.settings.debtNotify ? ' checked' : '') + '> صبح روز موعد (ساعت 9) یک اعلان بفرست</label><p class="mute sm" style="margin:0">اعلان ممکن است چند دقیقه دیرتر برسد. اگر نیامد، در تنظیمات گوشی اعلان‌های این برنامه را روشن کنید.</p></div>';
  }

  // ======================================================= sign-up gate and policies
  var CITIES = ['مشهد', 'تهران', 'اصفهان', 'شیراز', 'تبریز', 'کرج', 'قم', 'اهواز', 'کرمانشاه', 'ارومیه', 'رشت', 'زاهدان', 'کرمان', 'همدان', 'یزد', 'اردبیل', 'بندرعباس', 'اراک', 'زنجان', 'سنندج', 'قزوین', 'خرم‌آباد', 'گرگان', 'ساری', 'بجنورد', 'بیرجند', 'نیشابور', 'سبزوار', 'قوچان', 'بوشهر', 'ایلام', 'سمنان', 'شهرکرد', 'یاسوج', 'کاشان'];
  function gateMode() {
    if (!S || !S.configured()) return null;
    if (!S.user()) return gf.mode === 'in' ? 'in' : 'up';
    var m = S.meta(); return (m.prof && m.prof.first && m.prof.phone) ? null : 'prof';
  }
  function normPhone(x) {
    x = String(x || '').replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); }).replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }).replace(/[\s\-()]/g, '');
    var m = x.match(/^(?:\+98|0098|98|0)?(9\d{9})$/); return m ? '0' + m[1] : '';
  }
  function viewGate() {
    var gm = gateMode() || gf.mode, h = '';
    if (gm === 'in') {
      h += lead('ورود به ' + NAME, 'شمارهٔ موبایل و رمز عبوری که موقع ثبت‌نام ساخته‌اید.');
      h += '<div class="sec stack"><div><label class="lbl" for="gf-phone">شمارهٔ موبایل</label><input id="gf-phone" data-f="gf-phone" dir="ltr" inputmode="tel" autocomplete="username" placeholder="09123456789" value="' + esc(gf.phone) + '"></div>' +
        '<div><label class="lbl" for="gf-pass">رمز عبور</label><input id="gf-pass" data-f="gf-pass" type="password" dir="ltr" autocomplete="current-password" value="' + esc(gf.pass) + '"></div>' +
        (gf.msg ? '<div class="note warn">' + esc(gf.msg) + '</div>' : '') +
        '<button class="btn pri block" data-act="gf-in">ورود</button>' +
        '<button class="btn block" data-act="gf-mode-up">حساب ندارم؛ ثبت‌نام</button></div>';
      return h;
    }
    var prof = gm === 'prof';
    h += lead(prof ? 'مشخصات خود را کامل کنید' : 'ساخت حساب', prof ? 'برای ادامه، این مشخصات و پذیرفتن سیاست‌ها لازم است.' : 'برای استفاده از ' + NAME + ' حساب لازم است. بعداً برای تأیید شماره، پیامک هم می‌فرستیم.');
    h += '<div class="sec stack">' +
      '<div class="grid2"><div><label class="lbl" for="gf-first">نام</label><input id="gf-first" data-f="gf-first" autocomplete="given-name" value="' + esc(gf.first) + '"></div>' +
      '<div><label class="lbl" for="gf-last">نام خانوادگی</label><input id="gf-last" data-f="gf-last" autocomplete="family-name" value="' + esc(gf.last) + '"></div></div>' +
      '<div><label class="lbl" for="gf-phone">شمارهٔ موبایل</label><input id="gf-phone" data-f="gf-phone" dir="ltr" inputmode="tel" autocomplete="tel" placeholder="09123456789" value="' + esc(gf.phone) + '"></div>' +
      '<div><label class="lbl" for="gf-city">شهر</label><input id="gf-city" data-f="gf-city" list="gf-cities" autocomplete="address-level2" value="' + esc(gf.city) + '"><datalist id="gf-cities">' + CITIES.map(function (c) { return '<option value="' + c + '">'; }).join('') + '</datalist></div>' +
      (prof ? '' : '<div><label class="lbl" for="gf-pass">رمز عبور (حداقل 8 کاراکتر)</label><input id="gf-pass" data-f="gf-pass" type="password" dir="ltr" autocomplete="new-password" value="' + esc(gf.pass) + '"></div>') +
      '<label class="switch agree"><input type="checkbox" data-f="gf-agree"' + (gf.agree ? ' checked' : '') + '> <span>قوانین را می‌پذیرم. <a href="#" data-act="go-policy">خواندن سیاست‌ها</a></span></label>' +
      (gf.msg ? '<div class="note warn">' + esc(gf.msg) + '</div>' : '') +
      '<button class="btn pri block" id="gf-btn" data-act="' + (prof ? 'gf-prof' : 'gf-up') + '"' + (gf.agree ? '' : ' disabled') + '>' + (prof ? 'ذخیره و ادامه' : 'ساخت حساب') + '</button>' +
      (prof ? '' : '<button class="btn block" data-act="gf-mode-in">قبلاً ثبت‌نام کرده‌ام؛ ورود</button>') + '</div>';
    return h;
  }
  var POLICY = [
    ['۱. دربارهٔ این برنامه', ['«' + NAME + '» ابزاری برای حساب‌کردن هزینه و قیمت‌گذاری محصولات کسب‌وکارهای کوچک است. با ساختن حساب و استفاده از برنامه، این شرایط را می‌پذیرید. استفاده از برنامه مخصوص افراد 18 سال به بالاست.']],
    ['۲. چه اطلاعاتی جمع می‌شود', ['اطلاعات حساب: نام، نام خانوادگی، شمارهٔ موبایل و شهر. رمز عبور شما به شکل رمزنگاری‌شده نگهداری می‌شود و ما آن را نمی‌بینیم.',
      'اطلاعات کار با برنامه: نوع کسب‌وکار، نام و قیمت مواد و تاریخچهٔ تغییر قیمت‌ها، مقدار مصرف هر ماده در هر دستور، نام محصولات، قیمت فروش و تاریخچهٔ آن، فروش ماهانه، بسته‌بندی، ضایعات و قیمت فروش آن‌ها، دستمزد و سربار، تنظیمات و هر چیز دیگری که در برنامه وارد می‌کنید.',
      'اطلاعات فنی: زمان ورود، نسخهٔ برنامه و نوع دستگاه به شکل کلی.']],
    ['۳. اطلاعات برای چه کاری استفاده می‌شود', ['برای ساختن و نگهداری حساب شما، ذخیره و همگام‌سازی اطلاعاتتان بین دستگاه‌ها، بهتر کردن برنامه، پشتیبانی، و فرستادن پیامک تأیید و اطلاع‌رسانی.',
      'همچنین برای تحلیل بازار و آمار: مثلاً میانگین قیمت مواد در هر شهر، روند قیمت‌ها و الگوی مصرف. این آمارها به شکل تجمیعی و بدون نام و شماره تهیه می‌شوند. ممکن است بر پایهٔ آن‌ها خدمات تازه‌ای مانند پیشنهاد خرید مواد با قیمت مناسب‌تر ارائه شود.']],
    ['۴. اینکه چه کسی اطلاعات را می‌بیند', ['اطلاعات اختصاصی شما (قیمت‌ها، دستورها، مقدارها و ضایعات) به رقبا، مغازه‌ها یا شرکت‌های دیگر داده نمی‌شود و رقبا به آن دسترسی ندارند.',
      'تیم نگهدارندهٔ برنامه برای ارائهٔ خدمت و تحلیل، به اطلاعات شما دسترسی دارد و با پذیرفتن این سیاست با آن موافقت می‌کنید.',
      'اطلاعات فقط در این موارد بیرون از تیم می‌رود: آمار تجمیعی و بدون نام (بند ۳)، ارائه‌دهندگان فنی که برنامه را میزبانی می‌کنند و ناچارند آن را نگه دارند، و مواردی که قانون یا مرجع قضایی صالح رسماً درخواست کند.']],
    ['۵. نگهداری و امنیت', ['اطلاعات شما روی سرویس ابری نگهداری می‌شود و ممکن است سرورها خارج از ایران باشند. از ابزارهای معمول امنیتی استفاده می‌شود، اما هیچ سامانه‌ای امنیت کامل ندارد. رمز عبور خود را به کسی ندهید و رمز قوی بگذارید.']],
    ['۶. حق شما', ['می‌توانید اطلاعات خود را در برنامه ببینید و اصلاح کنید. با «حذف اطلاعات من از ابر» (در بخش حساب) اطلاعات ذخیره‌شدهٔ شما حذف می‌شود. برای حذف کامل حساب، با ما تماس بگیرید. آمار تجمیعی و بدون نام که قبلاً ساخته شده، قابل برگشت به شما نیست.']],
    ['۷. مسئولیت', ['قیمت‌ها و پیشنهادهای برنامه فقط راهنمای محاسبه‌اند و بر پایهٔ عددهایی است که خودتان وارد کرده‌اید. سود، فروش یا درستی نتیجه تضمین نمی‌شود و تصمیم نهایی دربارهٔ قیمت و کار با شماست. برنامه ممکن است گاهی قطع شود یا تغییر کند.',
      'اطلاعاتی را وارد کنید که حق استفاده از آن را دارید. مسئولیت درستی اطلاعاتی که وارد می‌کنید با خودتان است.']],
    ['۸. تغییر سیاست‌ها و قانون', ['ممکن است این سیاست‌ها تغییر کند؛ تغییر مهم در برنامه اطلاع داده می‌شود و ادامهٔ استفاده یعنی پذیرفتن آن. این شرایط تابع قوانین جمهوری اسلامی ایران است.']]
  ];
  function viewPolicy() {
    var back = gateMode() ? 'go-gate' : 'go-acc';
    var h = '<button class="back" data-act="' + back + '">' + ICON('back') + 'برگشت</button>' + lead('سیاست‌ها و شرایط استفاده', 'نسخهٔ ' + POLICY_V);
    POLICY.forEach(function (sec) { h += '<div class="sec"><h3>' + sec[0] + '</h3>' + sec[1].map(function (p) { return '<p class="mute" style="margin:0 0 10px">' + esc(p) + '</p>'; }).join('') + '</div>'; });
    return h;
  }
  function profFromRow(row) { return { first: row.first_name, last: row.last_name, phone: row.phone, city: row.city, v: row.policy_version, at: row.accepted_at }; }
  function ensureProfile() {
    if (!S || !S.user()) return Promise.resolve();
    var m = S.meta();
    var p = m.profilePending ? S.saveProfile(m.profilePending).then(function () { m.profilePending = null; m.profileErr = ''; S.saveMeta(); }).catch(function (e) { m.profileErr = (e && e.text) || 'خطا'; S.saveMeta(); }) : Promise.resolve();
    return p.then(function () {
      if (m.prof && m.prof.first) return S.touchProfile(VER).catch(function () {});
      return S.getProfile().then(function (row) {
        if (row && row.first_name) { m.prof = profFromRow(row); if (row.city) m.city = row.city; S.saveMeta(); paintStat(); render(); }
      }).catch(function () {});
    });
  }
  function gateErr(t) { gf.msg = t; render(); }
  function fixAuthText(t) { return String(t || '').replace('این ایمیل قبلاً ثبت شده است؛ وارد شوید.', 'این شماره قبلاً ثبت شده است؛ وارد شوید.').replace('ایمیل یا رمز عبور اشتباه است.', 'شماره یا رمز عبور اشتباه است.'); }
  function readProfile(needPass) {
    var ph = normPhone(gf.phone), p = { first_name: gf.first.trim(), last_name: gf.last.trim(), phone: ph, city: gf.city.trim(), policy_version: POLICY_V, accepted_at: new Date().toISOString(), app_version: VER };
    if (!p.first_name || !p.last_name) return { err: 'نام و نام خانوادگی را بنویسید.' };
    if (!ph) return { err: 'شمارهٔ موبایل را درست بنویسید، مثل 09123456789.' };
    if (!p.city) return { err: 'شهر را بنویسید.' };
    if (needPass && gf.pass.length < 8) return { err: 'رمز عبور حداقل 8 کاراکتر باشد.' };
    if (!gf.agree) return { err: 'برای ادامه باید سیاست‌ها را بپذیرید.' };
    return { p: p };
  }
  function finishProfile(p) {
    var m = S.meta(); m.prof = { first: p.first_name, last: p.last_name, phone: p.phone, city: p.city, v: p.policy_version, at: p.accepted_at }; m.city = p.city; S.saveMeta();
    p.user_id = S.user().id;
    return S.saveProfile(p).then(function () { m.profilePending = null; m.profileErr = ''; S.saveMeta(); }).catch(function (e) { m.profilePending = p; m.profileErr = (e && e.text) || 'خطا'; S.saveMeta(); });
  }
  function gateAct(act) {
    if (act === 'gf-mode-in') { gf.mode = 'in'; gf.msg = ''; render(); return; }
    if (act === 'gf-mode-up') { gf.mode = 'up'; gf.msg = ''; render(); return; }
    if (navigator.onLine === false) { gateErr('اینترنت وصل نیست. برای ساخت حساب و ورود، یک بار اینترنت لازم است.'); return; }
    if (act === 'gf-up') {
      var r = readProfile(true); if (r.err) { gateErr(r.err); return; }
      gf.msg = 'در حال ساخت حساب…'; render();
      S.signUp(S.phoneId(r.p.phone), gf.pass).then(function (res) {
        if (res.needConfirm) { gateErr('ثبت‌نام نیاز به تأیید دارد. (در Supabase گزینهٔ Confirm email را خاموش کنید.)'); return; }
        return finishProfile(r.p).then(function () { gf.pass = ''; gf.msg = ''; cloud.msg = ''; paintStat(); render(); return reconcile(true); });
      }).catch(function (e) { gateErr(fixAuthText(e && e.text) || 'اتصال به سرور برقرار نشد.'); });
    } else if (act === 'gf-in') {
      var id = String(gf.phone || '').trim(), em = normPhone(id) ? S.phoneId(normPhone(id)) : '';
      if (!em) { gateErr('شمارهٔ موبایل را درست بنویسید، مثل 09123456789.'); return; }
      if (!gf.pass) { gateErr('رمز عبور را بنویسید.'); return; }
      gf.msg = 'در حال ورود…'; render();
      S.signIn(em, gf.pass).then(function () { gf.pass = ''; gf.msg = ''; return S.getProfile().catch(function () { return null; }); }).then(function (row) {
        var m = S.meta(); if (row && row.first_name) { m.prof = profFromRow(row); if (row.city) m.city = row.city; S.saveMeta(); }
        cloud.msg = ''; paintStat(); render(); return reconcile(true);
      }).catch(function (e) { gateErr(fixAuthText(e && e.text) || 'اتصال به سرور برقرار نشد.'); });
    } else if (act === 'gf-prof') {
      var r2 = readProfile(false); if (r2.err) { gateErr(r2.err); return; }
      finishProfile(r2.p).then(function () { gf.msg = ''; render(); return reconcile(false); });
    }
  }

  // ======================================================= render
  var VIEWS = { shop: viewShop, sales: viewSales, debts: viewDebts, labels: viewLabels, label: viewLabel, waste: viewWaste, gate: viewGate, policy: viewPolicy, prods: viewProds, prod: viewProd, ings: viewIngs, packs: viewPacks, quick: viewQuick, setup: viewSetup, chg: viewChg, res: viewRes, cards: viewCards, sub: viewSub, set: viewSet, acc: viewAcc, help: viewHelp };
  var rendering = false;
  function render() {
    if (rendering) { setTimeout(render, 0); return; }
    rendering = true;
    var gm = gateMode(); if (gm) { if (tab !== 'policy') tab = 'gate'; } else if (tab === 'gate') tab = state.profile.done ? 'prods' : 'setup';
    document.body.classList.toggle('gated', !!gm);
    var v = document.getElementById('view');
    try { var ae = document.activeElement; if (ae && v.contains(ae) && ae.blur) ae.blur(); } catch (e) {}
    try { v.innerHTML = VIEWS[tab](); } finally { rendering = false; }
    var nm = (tab === 'prod') ? 'prods' : tab;
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { var on = b.getAttribute('data-tab') === tab; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    Array.prototype.forEach.call(document.querySelectorAll('#nav [data-nav]'), function (b) { b.classList.toggle('on', b.getAttribute('data-nav') === nm); });
    var ti = document.getElementById('title'); if (ti) ti.textContent = titleOf();
    var np = document.querySelector('#nav-prods span'); if (np) np.textContent = W().many;
    document.body.classList.toggle('nonav', (tab === 'setup' && !state.profile.done) || !!gm);
    Array.prototype.forEach.call(document.querySelectorAll('.appname'), function (e) { e.textContent = NAME; });
    navTrack();
    if (tab === 'prod') paintPhoto();
    if (focusSel) { var el = document.querySelector(focusSel); focusSel = null; if (el) { try { el.focus(); el.scrollIntoView({ block: 'center' }); } catch (e) {} } }
  }
  function go(t, id) { tab = t; if (id) cur = id; render(); window.scrollTo(0, 0); }

  // ---------- sheets ----------
  function openSheet(html) { var w = document.getElementById('sheetwrap'); w.innerHTML = html; w.hidden = false; }
  function closeSheet() { var w = document.getElementById('sheetwrap'); w.hidden = true; w.innerHTML = ''; urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} }); urls = []; window._cardBlobs = null; window._cardName = null; }
  function plusSheet() {
    var w = W();
    openSheet('<div class="sheet" role="dialog" aria-label="افزودن"><h3>چه چیزی اضافه کنیم؟</h3>' +
      '<button class="opt-btn" data-sheet="new-item">' + ICON('menuitem') + '<span>' + w.one + ' جدید<small>مواد و قیمت پیشنهادی</small></span></button>' +
      '<button class="opt-btn" data-sheet="new-ing">' + ICON('ing') + '<span>ماده جدید<small>قیمت خرید</small></span></button>' +
      '<button class="opt-btn" data-sheet="new-pack">' + ICON('box') + '<span>بسته‌بندی جدید<small>جعبه، لیوان، کیسه</small></span></button>' +
      '<button class="opt-btn" data-sheet="new-debt">' + ICON('debt') + '<span>بدهی یا طلب جدید<small>یادآوری برای پول مردم و پول شما</small></span></button>' +
      '<button class="opt-btn" data-sheet="new-label">' + ICON('label') + '<span>برچسب و ارزش غذایی<small>برای بسته‌بندی محصول</small></span></button>' +
      '<button class="opt-btn" data-sheet="new-price">' + ICON('chg') + '<span>ثبت قیمت‌های جدید مواد<small>قیمت‌ها عوض شده</small></span></button>' +
      '<button class="btn block" data-sheet="close" style="margin-top:12px">بستن</button></div>');
  }

  // ======================================================= actions
  function newItem() {
    var it = { id: uid(), name: '', price: 0, sales: 0, yield: 1, mode: 'piece', lines: [], pk: [], u: now() };
    state.items.push(it); cur = it.id; tab = 'prod'; focusSel = '[data-f="it-name"]';
  }
  function newIng() { state.ingredients.push({ id: uid(), name: '', unit: 'kg', price: 0, trimmable: true, u: now() }); tab = 'ings'; q.ing = ''; focusSel = '#list .item:last-child [data-f="ing-name"]'; }
  function newPack() { state.packs.push({ id: uid(), name: '', price: 0, u: now() }); tab = 'packs'; q.pk = ''; focusSel = '#list .item:last-child [data-f="pk-name"]'; }

  function delIng(id) {
    gone(id); state.ingredients = state.ingredients.filter(function (x) { return x.id !== id; });
    state.items.forEach(function (it) { var n = it.lines.length; it.lines = it.lines.filter(function (l) { return l.ingId !== id; }); if (it.lines.length !== n) touch(it); });
    state.subs = state.subs.filter(function (s) { if (s.fromId === id || s.toId === id) { gone(s.id); return false; } return true; });
  }
  function delPack(id) {
    gone(id); state.packs = state.packs.filter(function (x) { return x.id !== id; });
    state.items.forEach(function (it) { var n = it.pk.length; it.pk = it.pk.filter(function (l) { return l.packId !== id; }); if (it.pk.length !== n) touch(it); });
  }

  function demo() {
    var ts = now(), I = function (id, name, unit, price, prev, trim) { return { id: id, name: name, unit: unit, price: price, prevPrice: prev, trimmable: trim !== false, u: ts }; };
    state = L.normalize({
      v: 2, profile: { type: 'fast', done: true },
      ingredients: [I('mozz', 'پنیر پیتزا (موزارلا)', 'kg', 650000, 500000), I('proc', 'پنیر پروسسی', 'kg', 380000, 340000), I('dough', 'خمیر', 'kg', 60000, 55000), I('sauce', 'سس گوجه', 'kg', 120000, 110000),
        I('chick', 'سینه مرغ', 'kg', 480000, 380000, false), I('bread', 'نان ساندویچی', 'piece', 12000, 10000), I('oil', 'روغن سرخ‌کردنی', 'l', 250000, 69600)],
      packs: [{ id: 'bx', name: 'جعبهٔ پیتزا', price: 25000, u: ts }],
      items: [{ id: 'pz', name: 'پیتزا مخصوص', price: 450000, sales: 300, u: ts, lines: [{ ingId: 'mozz', amount: 140 }, { ingId: 'dough', amount: 250 }, { ingId: 'sauce', amount: 60 }, { ingId: 'chick', amount: 60 }], pk: [{ packId: 'bx', qty: 1 }] },
        { id: 'sw', name: 'ساندویچ مرغ', price: 260000, sales: 500, u: ts, lines: [{ ingId: 'bread', amount: 1 }, { ingId: 'chick', amount: 110 }, { ingId: 'sauce', amount: 25 }, { ingId: 'oil', amount: 30 }] }],
      subs: [{ id: 's1', fromId: 'mozz', toId: 'proc', ratio: 1, maxShare: 40, u: ts }],
      settings: { targetFC: 30, minPortion: 85, roundTo: 5000, elasticity: 1.2, qualityDrop: 3, sw: { loss: true, sizes: true } }, su: ts,
      meta: { lastPriceUpdate: ts }
    });
    [].concat(state.items, state.ingredients, state.packs).forEach(function (x) { x.sample = true; });
  }
  function doExport() { CARD.saveText(JSON.stringify(state, null, 1), 'repricer-backup.json', 'application/json'); }
  function doImport(file) {
    if (!file) return; var r = new FileReader();
    r.onload = function () { try { state = L.normalize(JSON.parse(r.result)); state.profile.done = state.profile.done || !!(state.items.length || state.ingredients.length); save(); render(); } catch (e) { alert('فایل معتبر نیست'); } };
    r.readAsText(file);
  }
  function csvItems() {
    var c = C(), rows = state.items.map(function (it) {
      var cost = L.unitCost(it, c), P = L.num(it.price);
      return [it.name, it.mode === 'kg' ? 'وزنی' : 'عددی', Math.round(P), Math.round(L.num(it.wholesale)), Math.round(cost), P > 0 ? Math.round(cost / P * 1000) / 10 : '', Math.round(L.suggest(it, c, cost)), L.num(it.sales) || ''];
    });
    CARD.saveText(CARD.csv(['نام', 'روش فروش', 'قیمت فروش', 'قیمت عمده', 'هزینه', 'سهم هزینه %', 'قیمت پیشنهادی', 'فروش ماهانه'], rows), 'products.csv');
  }
  function csvIngs() {
    var rows = state.ingredients.map(function (g) { var rs = L.rise(g); return [g.name, UNAME[g.unit], Math.round(g.price), g.loss || '', rs ? Math.round(rs.pct * 10) / 10 : '']; });
    CARD.saveText(CARD.csv(['نام', 'قیمت بر اساس', 'قیمت', 'ضایعات %', 'تغییر اخیر %'], rows), 'ingredients.csv');
  }

  // ======================================================= events
  function drawer(open) {
    document.body.classList.toggle('open', open);
    var mb = document.getElementById('menuBtn'); mb.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { var on = document.querySelector('#tabs button.on') || document.querySelector('#tabs button'); if (on) setTimeout(function () { on.focus(); }, 50); }
    else mb.focus();
  }
  document.getElementById('menuBtn').addEventListener('click', function () { drawer(!document.body.classList.contains('open')); });
  document.getElementById('scrim').addEventListener('click', function () { drawer(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (!document.getElementById('sheetwrap').hidden) closeSheet(); else if (document.body.classList.contains('open')) drawer(false); } });
  document.getElementById('tabs').addEventListener('click', function (e) {
    var b = closest(e.target, 'button'); if (!b) return; var t = b.getAttribute('data-tab');
    if (t === 'setup') wzStart();
    tab = t; render(); document.body.classList.remove('open'); document.getElementById('menuBtn').setAttribute('aria-expanded', 'false'); window.scrollTo(0, 0);
  });
  document.getElementById('nav').addEventListener('click', function (e) {
    var b = closest(e.target, 'button'); if (!b) return;
    if (b.id === 'plus') { plusSheet(); return; }
    go(b.getAttribute('data-nav'));
  });
  document.getElementById('sheetwrap').addEventListener('click', function (e) {
    if (e.target.id === 'sheetwrap') { closeSheet(); return; }
    var b = closest(e.target, '[data-sheet]'); if (!b) return; var a = b.getAttribute('data-sheet');
    if (a === 'close') closeSheet();
    else if (a === 'new-item') { closeSheet(); newItem(); save(); render(); window.scrollTo(0, 0); }
    else if (a === 'new-ing') { closeSheet(); newIng(); save(); render(); }
    else if (a === 'new-pack') { closeSheet(); newPack(); save(); render(); }
    else if (a === 'new-price') { closeSheet(); go('chg'); }
    else if (a === 'card-send') { var bl = window._cardBlobs; if (bl) CARD.send(bl, window._cardName || 'price-card'); }
    else if (a === 'db-share' || a === 'db-copy') { var ta = document.getElementById('dbtxt'); if (!ta) return; var tx = ta.value; if (a === 'db-share' && navigator.share) { try { navigator.share({ text: tx }).catch(function () {}); return; } catch (er) {} } copyText(tx, ta); }
    else if (a === 'new-debt') { closeSheet(); newDebt(); save(); render(); window.scrollTo(0, 0); setTimeout(askNotif, 300); }
    else if (a === 'plan-go') planGo();
    else if (a === 'notif-yes') { closeSheet(); setNotify(true); }
    else if (a === 'notif-no') { closeSheet(); }
    else if (a === 'new-label') { closeSheet(); newLabel(); save(); render(); window.scrollTo(0, 0); }
  });

  document.getElementById('sheetwrap').addEventListener('input', function (e) { var t = e.target, pid = t.getAttribute && t.getAttribute('data-plan'); if (pid) planQ[pid] = Number(t.value); });

  var view = document.getElementById('view');
  // show the formatted amount under price fields while typing; live search; scale slider
  view.addEventListener('input', function (e) {
    var t = e.target, f = t.getAttribute && t.getAttribute('data-f');
    if (f && f.indexOf('gf-') === 0) { if (t.type !== 'checkbox') gf[f.slice(3)] = t.value; return; }
    if (f === 'q-ing') { q.ing = t.value; document.getElementById('list').innerHTML = ingList(); return; }
    if (f === 'q-pk') { q.pk = t.value; document.getElementById('list').innerHTML = packList(); return; }
    if (f === 'q-prod') { q.prod = t.value; document.getElementById('list').innerHTML = prodCards(); return; }
    if (f === 'scale') { scaleK = Number(t.value) || 1; var it = find(state.items, cur), bx = document.getElementById('scalebox'); if (it && bx) bx.innerHTML = scaleHTML(it); return; }
    if (t.type !== 'number' || !t.parentNode) return;
    var h = t.parentNode.querySelector('.hint'); if (h) h.textContent = Number(t.value) > 0 ? fmt(Number(t.value)) : '';
  });

  view.addEventListener('change', function (e) {
    var t = e.target, f = t.getAttribute('data-f'); if (!f) return;
    var rowEl = closest(t, '[data-id]'), id = rowEl && rowEl.getAttribute('data-id');
    var lineEl = closest(t, '[data-line]'), li = lineEl ? Number(lineEl.getAttribute('data-line')) : -1;
    var n = Number(t.value), k = t.getAttribute('data-k');
    if (f === 'st-notify') { setNotify(t.checked); return; }
    if (f === 'card-photos') { cardOpt.photos = t.checked; return; }
    if (f === 'card-cal') { cardOpt.cal = t.checked; return; }
    if (f === 'photo-in') {
      var pf = t.files && t.files[0]; if (!pf || !cur) return;
      resizePhoto(pf).then(function (b) { return Photos.put(cur, b); }).then(function () { render(); }).catch(function () { alert('ذخیرهٔ عکس ممکن نشد.'); });
      return;
    }
    if (f === 'sl-qty') { setSale(k, Math.max(0, n)); save(); render(); return; }
    if (f.indexOf('sh-') === 0) {
      var sx = find(state.shop, id); if (!sx) return;
      if (f === 'sh-name') { sx.name = t.value; var nm = t.value.trim(), mg = state.ingredients.filter(function (g) { return (g.name || '').trim() === nm; })[0]; if (mg) { sx.ingId = mg.id; sx.unit = mg.unit; } else sx.ingId = null; }
      else if (f === 'sh-qty') sx.qty = Math.max(0, n); else if (f === 'sh-price') sx.price = Math.max(0, n); else if (f === 'sh-unit') sx.unit = t.value; else if (f === 'sh-done') sx.done = t.checked;
      touch(sx); save(); render(); return;
    }
    if (f === 'ing-pre' || f === 'ing-n' || f === 'ing-pg') {
      var gi = find(state.ingredients, id); if (!gi) return; gi.nut = gi.nut || {};
      if (f === 'ing-pre') { var pp0 = PRE[Number(t.value)]; if (!pp0) return; ['k', 'f', 's', 'c', 'su', 'p', 'na'].forEach(function (kk, i3) { gi.nut[kk] = pp0[i3 + 1]; }); }
      else if (f === 'ing-n') gi.nut[k] = Math.max(0, n); else gi.pg = Math.max(0, n);
      touch(gi); save(); render(); return;
    }
    if (f.indexOf('q-') === 0 || f === 'scale') return;
    if (f.indexOf('gf-') === 0) { if (f === 'gf-agree') { gf.agree = t.checked; var gb = document.getElementById('gf-btn'); if (gb) gb.disabled = !gf.agree; } else gf[f.slice(3)] = t.value; return; }
    // wizard fields (no saving)
    if (f === 'wz-type') { wzPick(k); render(); return; }
    if (f === 'wz-cname') { wz.cname = t.value; return; }
    if (f === 'wz-csw') { wz.csw[k] = t.checked; return; }
    if (f === 'wz-ing') { wz.ing[k] = t.checked; return; }
    if (f === 'wz-price') { wz.price[k] = t.value; if (t.value !== '' && !wz.ing[k]) { wz.ing[k] = true; render(); } return; }
    if (f === 'wz-pk') { wz.pk[k] = t.checked; return; }
    if (f === 'wz-pkp') { wz.pkp[k] = t.value; if (t.value !== '' && !wz.pk[k]) { wz.pk[k] = true; render(); } return; }
    if (f === 'wz-dish') { wz.dish[k] = t.checked; render(); return; }
    if (f === 'wz-sell') { wz.sell[k] = t.value; return; }
    if (f === 'up-price') { upd[k] = t.value; return; }
    if (f === 'card-pick') { cardOpt.pick[k] = t.checked; return; }
    if (f === 'card-whole') { cardOpt.wholesale = t.checked; render(); return; }
    if (f === 'qc-ing') { qc.lines[li].ingId = t.value; render(); return; }
    if (f === 'qc-amt') { qc.lines[li].amount = n; render(); return; }
    if (f === 'qc-n') { qc.n = n; render(); return; }
    if (f === 'qc-other') { qc.other = n; render(); return; }
    if (f === 'shop') { state.settings.shopName = t.value; touchSettings(); save(); return; }
    if (f === 'contact') { state.settings.contact = t.value; touchSettings(); save(); return; }
    if (f === 'import') { doImport(t.files[0]); return; }

    if (f.indexOf('db-') === 0) {
      var dd2 = find(state.debts, id); if (!dd2) return;
      if (f === 'db-name') dd2.name = t.value; else if (f === 'db-phone') dd2.phone = t.value; else if (f === 'db-note') dd2.note = t.value;
      else if (f === 'db-amount') dd2.amount = Math.max(0, n); else if (f === 'db-paid') dd2.paid = Math.max(0, n);
      else if (f.indexOf('db-j') === 0) {
        var rw = closest(t, '[data-id]'), jy = Number(rw.querySelector('[data-f="db-jy"]').value), jm = Number(rw.querySelector('[data-f="db-jm"]').value), jd = Number(rw.querySelector('[data-f="db-jd"]').value);
        if (jy >= 1300 && jy <= 1600 && jm >= 1 && jm <= 12 && jd >= 1 && jd <= 31) { var gg = j2g(jy, jm, jd); dd2.due = gg[0] + '-' + pad2(gg[1]) + '-' + pad2(gg[2]); }
      }
      touch(dd2); save(); render(); return;
    }
    if (f.indexOf('lb-') === 0) {
      var lb = find(state.labels, id || cur); if (!lb) return;
      if (f === 'lb-name') lb.name = t.value; else if (f === 'lb-net') lb.net = Math.max(0, n); else if (f === 'lb-serv') lb.serv = Math.max(0, n); else if (f === 'lb-fin') lb.fin = Math.max(0, n);
      else if (f === 'lb-may') lb.may = t.value; else if (f === 'lb-prod') lb.prod = t.value; else if (f === 'lb-contact') lb.contact = t.value; else if (f === 'lb-shelf') lb.shelf = t.value; else if (f === 'lb-store') lb.store = t.value;
      else if (f === 'lb-alg') lb.alg[k] = t.checked;
      else if (f === 'lb-lname') lb.lines[li].name = t.value;
      else if (f === 'lb-lg') lb.lines[li].g = Math.max(0, n);
      else if (f === 'lb-n') lb.lines[li][k] = Math.max(0, n);
      else if (f === 'lb-pre') { var pp = PRE[Number(t.value)]; if (!pp) return; var ln = lb.lines[li]; if (!ln.name) ln.name = pp[0]; ['k', 'f', 's', 'c', 'su', 'p', 'na'].forEach(function (kk, i2) { ln[kk] = pp[i2 + 1]; }); }
      else if (f === 'lb-from') {
        var src = find(state.items, t.value); if (!src) return;
        src.lines.forEach(function (ln0) { var g0 = find(state.ingredients, ln0.ingId); if (!g0) return; lb.lines.push(lbLine(g0, L.num(ln0.amount))); });
        if (!lb.name) lb.name = src.name;
      }
      touch(lb); save(); render(); return;
    }
    var g, it, p;
    if (f === 'ing-name') { g = find(state.ingredients, id); g.name = t.value; touch(g); }
    else if (f === 'ing-unit') { g = find(state.ingredients, id); g.unit = t.value; g.packQty = null; g.packPrice = null; touch(g); }
    else if (f === 'ing-buy') {
      g = find(state.ingredients, id); var v = t.value, list = T.packs[g.unit] || [];
      if (v === 'base') { g.packQty = null; g.packPrice = null; }
      else {
        g.packQty = v === 'custom' ? (L.num(g.packQty) || 1) : list[Number(v.slice(1))][1];
        if (L.num(g.packPrice) > 0) applyPack(g); else g.packPrice = Math.round(g.price * g.packQty);   // keep today's price, show it as a pack price
      }
      touch(g);
    }
    else if (f === 'ing-price') { g = find(state.ingredients, id); setPrice(g, n); }
    else if (f === 'ing-pqty') { g = find(state.ingredients, id); g.packQty = n > 0 ? n : 1; applyPack(g); touch(g); }
    else if (f === 'ing-ppack') { g = find(state.ingredients, id); g.packPrice = n; applyPack(g); touch(g); }
    else if (f === 'ing-loss') { g = find(state.ingredients, id); g.loss = Math.min(90, Math.max(0, n)); touch(g); }
    else if (f === 'ing-trim') { g = find(state.ingredients, id); g.trimmable = t.checked; touch(g); }
    else if (f === 'pk-name') { p = find(state.packs, id); p.name = t.value; touch(p); }
    else if (f === 'pk-price') { p = find(state.packs, id); p.price = n; touch(p); }
    else if (f.indexOf('it-') === 0 || f.indexOf('ln-') === 0 || f.indexOf('pk-') === 0 || f.indexOf('sz-') === 0 || f.indexOf('wl-') === 0) {
      it = find(state.items, cur); if (!it) return;
      if (f === 'it-name') it.name = t.value;
      else if (f === 'it-price') { if (it.price > 0 && n !== it.price) { if (!(it.priceHistory || []).length) it.priceHistory = [{ t: it.u || now() - 864e5, p: it.price }]; it.priceHistory = (it.priceHistory || []).concat([{ t: now(), p: n }]).slice(-40); } it.price = n; }
      else if (f === 'it-sales') it.sales = n;
      else if (f === 'it-cook') it.cookLoss = Math.min(90, Math.max(0, n));
      else if (f === 'it-yield') it.yield = Math.max(1, n || 1);
      else if (f === 'it-min') it.minutes = n;
      else if (f === 'it-whole') it.wholesale = n;
      else if (f === 'it-tgt') it.tgt = n > 0 ? n : null;
      else if (f === 'ln-ing') it.lines[li].ingId = t.value;
      else if (f === 'ln-amt') it.lines[li].amount = n;
      else if (f === 'pk-sel') it.pk[li].packId = t.value;
      else if (f === 'pk-qty') it.pk[li].qty = n;
      else if (f === 'wl-sel') it.waste[li].wasteId = t.value;
      else if (f === 'wl-amt') it.waste[li].amount = n;
      else if (f === 'sz-name') it.sizes[li].name = t.value;
      else if (f === 'sz-factor') it.sizes[li].factor = n;
      else if (f === 'sz-price') it.sizes[li].price = n;
      touch(it);
    }
    else if (f === 'ws-name') { p = find(state.wastes, id); p.name = t.value; touch(p); }
    else if (f === 'ws-unit') { p = find(state.wastes, id); p.unit = t.value; touch(p); }
    else if (f === 'ws-price') { p = find(state.wastes, id); p.price = n; touch(p); }
    else if (f === 'sb-from') { p = find(state.subs, id); p.fromId = t.value; touch(p); }
    else if (f === 'sb-to') { p = find(state.subs, id); p.toId = t.value; touch(p); }
    else if (f === 'sb-ratio') { p = find(state.subs, id); p.ratio = n; touch(p); }
    else if (f === 'sb-share') { p = find(state.subs, id); p.maxShare = n; touch(p); }
    else if (f === 'st-sw') { state.settings.sw[k] = t.checked; touchSettings(); }
    else if (f.indexOf('st-') === 0) { state.settings[f.slice(3)] = n; touchSettings(); }
    save(); render();
  });

  view.addEventListener('click', function (e) {
    var smm = closest(e.target, 'summary[data-nut]');
    if (smm) { var rw0 = closest(smm, '[data-id]'); if (rw0) openNut[rw0.getAttribute('data-id')] = !smm.parentNode.open; return; }
    var a = closest(e.target, 'a[data-act]'); if (a) e.preventDefault();
    var b = closest(e.target, '[data-act]'); if (!b) return;
    var act = b.getAttribute('data-act'), k = b.getAttribute('data-k');
    var rowEl = closest(b, '[data-id]'), id = rowEl && rowEl.getAttribute('data-id');
    var lineEl = closest(b, '[data-line]'), li = lineEl ? Number(lineEl.getAttribute('data-line')) : -1;
    var it = tab === 'prod' ? find(state.items, cur) : null;
    if (act.indexOf('gf-') === 0) { gateAct(act); return; }
    if (act.indexOf('acc-') === 0) { accAct(act); return; }
    if (act.indexOf('go-') === 0) { if (act === 'go-setup') wzStart(); go(act.slice(3)); return; }
    if (act === 'open') { go('prod', id); return; }
    if (act.indexOf('db-f-') === 0) { dbf = act.slice(5); render(); return; }
    if (act === 'lb-open') { go('label', id); return; }
    // wizard
    if (/^theme-(auto|light|dark)$/.test(act)) { setTheme(act.slice(6)); render(); return; }
    if (act === 'sl-prev' || act === 'sl-next') { var sd = isoParts(salesDay || isoOf(new Date())), dt = new Date(sd[0], sd[1] - 1, sd[2] + (act === 'sl-next' ? 1 : -1)); salesDay = isoOf(dt); render(); return; }
    if (act === 'sl-today') { salesDay = isoOf(new Date()); render(); return; }
    if (act === 'sl-plus' || act === 'sl-minus') { var rc = find(state.sales, 'sl_' + salesDay + '_' + k), q0 = rc ? rc.qty : 0; setSale(k, q0 + (act === 'sl-plus' ? 1 : -1)); save(); render(); return; }
    if (act === 'photo-del') { Photos.del(cur).catch(function () {}).then(function () { render(); }); return; }
    if (act === 'sh-plan') { planSheet(); return; }
    if (act === 'sh-share') { openSheet('<div class="sheet" role="dialog" aria-label="متن لیست"><h3>متن لیست خرید</h3><textarea id="dbtxt" rows="8">' + esc(shopText()) + '</textarea><button class="btn pri block" style="margin-top:12px" data-sheet="db-share">' + ICON('share') + 'ارسال</button><button class="btn block" data-sheet="db-copy">' + ICON('copy') + 'کپی</button><button class="btn block" data-sheet="close">بستن</button></div>'); return; }
    if (act === 'wz-all' || act === 'wz-none') { var tt = T.types.filter(function (x) { return x.id === wz.type; })[0]; if (tt) tt.ing.forEach(function (kk) { wz.ing[kk] = act === 'wz-all'; }); render(); return; }
    if (act === 'wz-next') { if (wz.step === 1 && !wz.type) return; wz.step++; render(); window.scrollTo(0, 0); return; }
    if (act === 'wz-back') { wz.step = Math.max(1, wz.step - 1); render(); window.scrollTo(0, 0); return; }
    if (act === 'wz-finish') { if (!wzFinish()) return; tab = 'prods'; save(); render(); window.scrollTo(0, 0); return; }
    // quick price
    if (act === 'qc-add') { if (state.ingredients.length) qc.lines.push({ ingId: state.ingredients[0].id, amount: 0 }); render(); return; }
    if (act === 'qc-del') { qc.lines.splice(li, 1); render(); return; }
    if (act === 'qc-clear') { qc = { lines: [], other: 0, n: 1 }; render(); return; }
    if (act === 'qc-save') {
      var tmp = qcTemp(); if (!tmp.it.lines.length) { alert('اول مواد را وارد کنید.'); return; }
      var ni = { id: uid(), name: '', price: tmp.sug, sales: 0, yield: tmp.it.yield, mode: 'piece', lines: tmp.it.lines.map(function (l) { return { ingId: l.ingId, amount: L.num(l.amount) }; }), pk: [], u: now() };
      if (L.num(qc.other) > 0) { var pg = { id: uid(), name: 'هزینهٔ دیگر', price: L.num(qc.other) / ni.yield, u: now() }; state.packs.push(pg); ni.pk.push({ packId: pg.id, qty: 1 }); }
      state.items.push(ni); cur = ni.id; qc = { lines: [], other: 0, n: 1 }; tab = 'prod'; focusSel = '[data-f="it-name"]'; save(); render(); window.scrollTo(0, 0); return;
    }
    // cards
    if (act === 'theme') { cardOpt.theme = k; render(); return; }
    if (act === 'card-list') { var ids = state.items.filter(function (x) { return cardOpt.pick && cardOpt.pick[x.id]; }).map(function (x) { return x.id; }); makeCard('list', cardRows(ids), cardOpt.wholesale ? 'قیمت عمده' : 'فهرست قیمت'); return; }
    if (act === 'card-one') { if (it) makeCard('single', cardRows([it.id]), ''); return; }

    if (act === 'new-item') { newItem(); }
    else if (act === 'ing-add') newIng();
    else if (act === 'pkg-add') newPack();
    else if (act === 'ing-del') { if (!confirm('حذف شود؟')) return; delIng(id); }
    else if (act === 'pkg-del') { if (!confirm('حذف شود؟')) return; delPack(id); }
    else if (act === 'it-del') { if (!it || !confirm('حذف شود؟')) return; gone(it.id); Photos.del(it.id).catch(function () {}); state.items = state.items.filter(function (x) { return x.id !== it.id; }); tab = 'prods'; }
    else if (act === 'it-dup') { if (!it) return; var cp = JSON.parse(JSON.stringify(it)); cp.id = uid(); cp.name = (it.name || '') + ' (کپی)'; cp.u = now(); state.items.push(cp); cur = cp.id; focusSel = '[data-f="it-name"]'; }
    else if (act === 'it-mode-piece') { if (it) { it.mode = 'piece'; touch(it); } }
    else if (act === 'it-mode-kg') { if (it) { it.mode = 'kg'; touch(it); } }
    else if (act === 'sample-del') { if (!confirm('همهٔ نمونه‌های آماده و مواد آن‌ها حذف شوند؟')) return; deleteSamples(); }
    else if (act === 'ws-add') { state.wastes.push({ id: uid(), name: '', unit: 'kg', price: 0, u: now() }); }
    else if (act === 'ws-del') { if (!confirm('حذف شود؟')) return; gone(id); state.wastes = state.wastes.filter(function (x) { return x.id !== id; }); state.items.forEach(function (x) { var n0 = (x.waste || []).length; x.waste = (x.waste || []).filter(function (l) { return l.wasteId !== id; }); if (x.waste.length !== n0) touch(x); }); }
    else if (act === 'sh-add') { state.shop.push({ id: uid(), name: '', ingId: null, unit: '', qty: 0, price: 0, done: false, u: now() }); tab = 'shop'; focusSel = '.item:last-of-type [data-f="sh-name"]'; }
    else if (act === 'sh-del') { gone(id); state.shop = state.shop.filter(function (x) { return x.id !== id; }); }
    else if (act === 'sh-clear') { if (!state.shop.some(function (x) { return x.done; })) { alert('موردی علامت نخورده است.'); return; } state.shop.forEach(function (x) { if (x.done) gone(x.id); }); state.shop = state.shop.filter(function (x) { return !x.done; }); }
    else if (act === 'lb-from-item') { if (it) labelFromItem(it); }
    else if (act === 'db-add') { newDebt(); setTimeout(askNotif, 300); }
    else if (act === 'db-del') { if (!confirm('حذف شود؟')) return; gone(id); state.debts = state.debts.filter(function (x) { return x.id !== id; }); }
    else if (act === 'db-dir-owed' || act === 'db-dir-owe') { var d1 = find(state.debts, id); if (d1) { d1.dir = act === 'db-dir-owe' ? 'owe' : 'owed'; touch(d1); } }
    else if (act === 'db-settle') { var d2 = find(state.debts, id); if (d2) { d2.paid = d2.amount; touch(d2); } }
    else if (act === 'db-due-0' || act === 'db-due-7' || act === 'db-due-30') { var d3 = find(state.debts, id); if (d3) { d3.due = plusDays(Number(act.slice(7))); touch(d3); } }
    else if (act === 'db-due-clear') { var d4 = find(state.debts, id); if (d4) { d4.due = ''; touch(d4); } }
    else if (act === 'db-msg') { var d5 = find(state.debts, id); if (!d5) return; openSheet('<div class="sheet" role="dialog" aria-label="متن یادآوری"><h3>متن یادآوری</h3><textarea id="dbtxt" rows="6">' + esc(debtMsg(d5)) + '</textarea><button class="btn pri block" style="margin-top:12px" data-sheet="db-share">' + ICON('share') + 'ارسال</button><button class="btn block" data-sheet="db-copy">' + ICON('copy') + 'کپی</button><button class="btn block" data-sheet="close">بستن</button></div>'); return; }
    else if (act === 'lb-add') newLabel();
    else if (act === 'lb-del') { var b1 = find(state.labels, cur); if (!b1 || !confirm('حذف شود؟')) return; gone(b1.id); state.labels = state.labels.filter(function (x) { return x.id !== b1.id; }); tab = 'labels'; }
    else if (act === 'lb-ladd') { var b2 = find(state.labels, cur); if (b2) { b2.lines.push({ name: '', g: 0, k: 0, f: 0, s: 0, c: 0, su: 0, p: 0, na: 0 }); touch(b2); } }
    else if (act === 'lb-ldel') { var b3 = find(state.labels, cur); if (b3) { b3.lines.splice(li, 1); touch(b3); } }
    else if (act === 'lb-make') { var b4 = find(state.labels, cur); if (b4) makeLabel(b4); return; }
    else if (act === 'wl-add') { if (it && state.wastes.length) { it.waste = it.waste || []; it.waste.push({ wasteId: state.wastes[0].id, amount: 0 }); touch(it); } }
    else if (act === 'wl-del') { it.waste.splice(li, 1); touch(it); }
    else if (act === 'ln-add') { if (it && state.ingredients.length) { it.lines.push({ ingId: state.ingredients[0].id, amount: 0 }); touch(it); } }
    else if (act === 'ln-del') { it.lines.splice(li, 1); touch(it); }
    else if (act === 'pk-add') { if (it && state.packs.length) { it.pk.push({ packId: state.packs[0].id, qty: 1 }); touch(it); } }
    else if (act === 'pk-del') { it.pk.splice(li, 1); touch(it); }
    else if (act === 'sz-add') { if (it) { it.sizes = it.sizes || []; it.sizes.push({ id: uid(), name: it.sizes.length ? '' : 'کوچک', factor: 1, price: 0 }); touch(it); } }
    else if (act === 'sz-del') { it.sizes.splice(li, 1); touch(it); }
    else if (act === 'sb-add') { if (state.ingredients.length < 2) { alert('حداقل دو ماده لازم است'); return; } state.subs.push({ id: uid(), fromId: state.ingredients[0].id, toId: state.ingredients[1].id, ratio: 1, maxShare: 50, u: now() }); }
    else if (act === 'sb-del') { gone(id); state.subs = state.subs.filter(function (x) { return x.id !== id; }); }
    else if (act === 'demo') { if (state.items.length && !confirm('داده‌های فعلی با نمونه عوض شود؟')) return; demo(); tab = 'prods'; }
    else if (act === 'reset') {
      if (!confirm('همهٔ داده‌ها پاک شود؟' + (S && S.user() ? ' (اگر وارد حساب هستید، نسخهٔ ابری هم پاک می‌شود.)' : ''))) return;
      var dd = state.del || {}, t0 = now();
      [].concat(state.ingredients, state.packs, state.items, state.subs, state.wastes, state.debts, state.labels, state.shop, state.sales).forEach(function (x) { dd[x.id] = t0; });   // so a merge cannot bring them back
      state = L.blank(); state.su = t0; state.del = dd; wz = null; tab = 'setup';
    }
    else if (act === 'mode-simple') { state.settings.mode = 'simple'; touchSettings(); }
    else if (act === 'mode-full') { state.settings.mode = 'full'; touchSettings(); }
    else if (act === 'apply-target') { state.items.forEach(function (x) { if (x.tgt) { x.tgt = null; touch(x); } }); }
    else if (act === 'export') { doExport(); return; }
    else if (act === 'csv-items') { csvItems(); return; }
    else if (act === 'csv-ings') { csvIngs(); return; }
    else if (act === 'up-go') {
      var any = false;
      state.ingredients.forEach(function (g) { var v = upd[g.id]; if (v === '' || v == null) return; var p = Number(v); if (!(p >= 0) || p === g.price) return; if (L.num(g.packQty) > 0) g.packPrice = p * g.packQty; setPrice(g, p); any = true; });
      upd = {}; if (any) state.meta.priceUpdates++; else { alert('قیمت جدیدی وارد نشده است'); return; }
    }
    else if (act === 'share') { save(); render(); var bx = document.getElementById('sharebox'); bx.innerHTML = '<textarea id="sharetxt" rows="8" style="width:100%;margin-top:8px"></textarea><button class="btn" data-act="copy">کپی</button>'; document.getElementById('sharetxt').value = shareText(); return; }
    else if (act === 'copy') { var ta = document.getElementById('sharetxt'); ta.select(); try { document.execCommand('copy'); } catch (er) {} if (navigator.clipboard) { try { navigator.clipboard.writeText(ta.value); } catch (er) {} } return; }
    else return;
    save(); render();
    if (act === 'new-item' || act === 'it-dup' || act === 'lb-add' || act === 'lb-from-item') window.scrollTo(0, 0);
  });

  window.addEventListener('online', function () { if (S && S.user() && S.meta().dirty) syncNow(0); });
  // weekly reminder also when the app is opened again
  document.addEventListener('visibilitychange', function () { if (!document.hidden && (tab === 'prods' || tab === 'ings' || tab === 'chg')) render(); });
  paintStat();

  // back button
  window.addEventListener('popstate', function (e) {
    var sw = document.getElementById('sheetwrap');
    if (!sw.hidden || document.body.classList.contains('open')) {
      if (!sw.hidden) closeSheet(); else drawer(false);
      try { history.pushState(navState(), ''); } catch (x) {}      // keep the current page; the back press only closed the layer on top
      return;
    }
    var st = e.state; if (!st || !st.tab) return;
    navPop = true; tab = st.tab; cur = st.cur || cur;
    if (st.tab === 'setup') { if (!wz) wzStart(); if (st.step) wz.step = st.step; }
    render(); window.scrollTo(0, 0);
  });
  // swipe from right to left opens the menu, left to right closes it
  (function () {
    var sx = 0, sy = 0, st = 0, bad = false;
    function blocked(el) {
      while (el && el !== document.body) {
        var tg = el.tagName;
        if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT' || tg === 'TABLE') return true;
        if (el.scrollWidth > el.clientWidth + 4) { var ox = getComputedStyle(el).overflowX; if (ox === 'auto' || ox === 'scroll') return true; }
        el = el.parentNode;
      }
      return false;
    }
    document.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { bad = true; return; }
      var t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); bad = blocked(e.target);
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (bad || !e.changedTouches.length) return;
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Date.now() - st > 700 || Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
      if (!document.getElementById('sheetwrap').hidden || document.body.classList.contains('gated')) return;
      var open = document.body.classList.contains('open');
      if (dx < 0 && !open) drawer(true); else if (dx > 0 && open) drawer(false);
    }, { passive: true });
  })();
  document.getElementById('themeBtn').addEventListener('click', function () { setTheme(isDarkNow() ? 'light' : 'dark'); render(); });
  render();
  if (S && S.user() && navigator.onLine !== false) reconcile(false);
})();

// tap to skip the opening animation
(function () { var sp = document.getElementById('splash'); if (sp) sp.addEventListener('click', function () { sp.style.display = 'none'; }); })();

// offline support (registered here so the page needs no inline script)
if ('serviceWorker' in navigator) { window.addEventListener('load', function () { try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {} }); }
