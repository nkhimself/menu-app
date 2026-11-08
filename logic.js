/* Core maths of the pricing app. Works in browsers and Node.
   Amounts in recipes: grams (kg-priced), millilitres (litre-priced) or pieces.
   One recipe makes `yield` pieces (mode "piece") or a batch sold by weight (mode "kg"). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Logic = factory();
})(this, function () {
  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }

  // ---------- state shape ----------
  function blank() {
    return {
      v: 2, ingredients: [], packs: [], items: [], subs: [], wastes: [],
      profile: { type: '', customName: '', done: false },
      settings: { targetFC: 30, minPortion: 85, roundTo: 5000, elasticity: 1.2, qualityDrop: 3,
        mode: 'simple', wage: 0, overheadPct: 0, remindDays: 7, shopName: '', contact: '',
        sw: { loss: false, batch: false, sizes: false, weight: false } },
      meta: { setupSeconds: null, setups: 0, priceUpdates: 0, lastPriceUpdate: null },
      su: 0, del: {}
    };
  }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  // Accepts old (v1) or new state and returns a clean v2 state.
  function normalize(s) {
    var d = blank(); s = s || {};
    d.ingredients = (s.ingredients || []).map(function (g) {
      g = copy(g); g.unit = g.unit || 'kg'; g.price = num(g.price); g.u = num(g.u);
      if (g.loss != null) g.loss = clamp(num(g.loss), 0, 90);
      return g;
    });
    d.packs = (s.packs || []).map(function (p) { p = copy(p); p.price = num(p.price); p.u = num(p.u); return p; });
    d.items = (s.items || []).map(function (it) {
      it = copy(it); it.lines = it.lines || []; it.pk = it.pk || []; it.waste = it.waste || []; it.u = num(it.u);
      it.yield = Math.max(1, num(it.yield) || 1); it.mode = it.mode === 'kg' ? 'kg' : 'piece';
      return it;
    });
    d.subs = (s.subs || []).map(function (x) { x = copy(x); x.u = num(x.u); return x; });
    d.wastes = (s.wastes || []).map(function (w) { w = copy(w); w.unit = w.unit === 'piece' ? 'piece' : 'kg'; w.price = num(w.price); w.u = num(w.u); return w; });
    if (s.profile) for (var p in s.profile) d.profile[p] = s.profile[p];
    // old v1 users already worked without the setup step
    if (!s.v && (d.items.length || d.ingredients.length)) d.profile.done = true;
    for (var k in s.settings || {}) {
      if (k === 'sw') { for (var w in s.settings.sw || {}) d.settings.sw[w] = !!s.settings.sw[w]; }
      else d.settings[k] = s.settings[k];
    }
    for (var m in s.meta || {}) d.meta[m] = s.meta[m];
    d.su = num(s.su); d.del = copy(s.del || {});
    return cleanup(d);
  }

  // remove references to things that no longer exist
  function cleanup(st) {
    var ing = {}, pk = {}, ws = {};
    st.ingredients.forEach(function (g) { ing[g.id] = 1; });
    (st.wastes || []).forEach(function (w) { ws[w.id] = 1; });
    st.packs.forEach(function (p) { pk[p.id] = 1; });
    st.items.forEach(function (it) {
      it.lines = it.lines.filter(function (l) { return ing[l.ingId]; });
      it.pk = it.pk.filter(function (l) { return pk[l.packId]; });
      it.waste = (it.waste || []).filter(function (l) { return ws[l.wasteId]; });
    });
    st.subs = st.subs.filter(function (x) { return ing[x.fromId] && ing[x.toId]; });
    return st;
  }

  // ---------- per-item merge of two devices (latest change of the same item wins) ----------
  function mergeList(la, lb, delA, delB) {
    var out = {}, order = [];
    function put(x) {
      var cur = out[x.id];
      if (!cur) { out[x.id] = x; order.push(x.id); }
      else if (num(x.u) > num(cur.u)) out[x.id] = x;
    }
    la.forEach(put); lb.forEach(put);
    return order.map(function (id) { return out[id]; }).filter(function (x) {
      var d = Math.max(num(delA[x.id]), num(delB[x.id]));
      return !(d && d >= num(x.u));
    });
  }
  function mergeStates(a, b, now) {
    a = normalize(a); b = normalize(b); now = now || Date.now();
    var del = {}, id;
    [a.del, b.del].forEach(function (dd) { for (id in dd) del[id] = Math.max(num(del[id]), num(dd[id])); });
    for (id in del) if (now - del[id] > 90 * 864e5) delete del[id];
    var out = blank();
    out.ingredients = mergeList(a.ingredients, b.ingredients, a.del, b.del);
    out.packs = mergeList(a.packs, b.packs, a.del, b.del);
    out.items = mergeList(a.items, b.items, a.del, b.del);
    out.subs = mergeList(a.subs, b.subs, a.del, b.del);
    out.wastes = mergeList(a.wastes, b.wastes, a.del, b.del);
    var newer = num(b.su) > num(a.su) ? b : a;
    out.settings = copy(newer.settings); out.profile = copy(newer.profile); out.su = Math.max(num(a.su), num(b.su));
    out.meta = copy(a.meta);
    out.meta.lastPriceUpdate = Math.max(num(a.meta.lastPriceUpdate), num(b.meta.lastPriceUpdate)) || null;
    out.meta.priceUpdates = Math.max(num(a.meta.priceUpdates), num(b.meta.priceUpdates));
    out.meta.setups = Math.max(num(a.meta.setups), num(b.meta.setups));
    if (out.meta.setupSeconds == null) out.meta.setupSeconds = b.meta.setupSeconds;
    out.del = del;
    return cleanup(out);
  }
  function sameData(a, b) { return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b)); }

  // ---------- costs ----------
  function buildMap(state) {
    var m = {}; (state.ingredients || []).forEach(function (i) { m[i.id] = i; }); return m;
  }
  function packMap(state) {
    var m = {}; (state.packs || []).forEach(function (i) { m[i.id] = i; }); return m;
  }
  // context passed around: ingredient map, packaging map, settings
  function wasteMap(state) { var m = {}; (state.wastes || []).forEach(function (w) { m[w.id] = w; }); return m; }
  function ctx(state) { return { ing: buildMap(state), pk: packMap(state), ws: wasteMap(state), s: state.settings || {} }; }
  function full(c) { return (c.s && c.s.mode) === 'full'; }
  function ovF(c) { return full(c) ? Math.max(0, num(c.s.overheadPct)) / 100 : 0; }

  function lossFactor(ing) { return 1 / (1 - clamp(num(ing.loss), 0, 90) / 100); }

  // cost of `amount` of an ingredient (price already for 1 kg / 1 l / 1 piece), including its waste
  function lineCost(ing, amount, usePrev) {
    if (!ing) return 0;
    var a = num(amount);
    var p = usePrev && ing.prevPrice != null ? num(ing.prevPrice) : num(ing.price);
    var c = ing.unit === 'piece' ? a * p : a / 1000 * p;
    return c * lossFactor(ing);
  }
  function batchIng(item, c, usePrev) {
    var t = 0; (item.lines || []).forEach(function (l) { t += lineCost(c.ing[l.ingId], l.amount, usePrev); });
    return t;
  }
  function labour(item, c) { return full(c) ? num(item.minutes) / 60 * num(c.s.wage) : 0; }
  // how many sold units one batch makes: pieces, or finished kilograms
  function divisor(item, c) {
    if (item.mode === 'kg') {
      var g = 0;
      (item.lines || []).forEach(function (l) { var i = c.ing[l.ingId]; if (i && i.unit !== 'piece') g += num(l.amount); });
      var kg = g / 1000 * (1 - clamp(num(item.cookLoss), 0, 90) / 100);
      return kg > 1e-9 ? kg : 1;
    }
    return Math.max(1, num(item.yield) || 1);
  }
  function packCost(item, c) {
    var t = 0; (item.pk || []).forEach(function (l) { var p = c.pk[l.packId]; if (p) t += num(l.qty) * num(p.price); });
    return t;
  }
  // money the batch brings back by selling its waste (bones, peels, used oil...)
  function wasteCredit(item, c) {
    var t = 0;
    (item.waste || []).forEach(function (l) {
      var w = c.ws && c.ws[l.wasteId]; if (!w) return;
      t += w.unit === 'piece' ? num(l.amount) * num(w.price) : num(l.amount) / 1000 * num(w.price);
    });
    return t;
  }
  // parts of the cost of ONE sold unit (wst = waste sales taken off the cost)
  function parts(item, c, usePrev) {
    var d = divisor(item, c), ing = batchIng(item, c, usePrev), lab = labour(item, c);
    return { ing: ing / d, lab: lab / d, ovh: (ing + lab) * ovF(c) / d, pack: packCost(item, c), wst: wasteCredit(item, c) / d };
  }
  function unitCost(item, c, usePrev) {
    var p = parts(item, c, usePrev); return Math.max(0, p.ing + p.lab + p.ovh + p.pack - p.wst);
  }
  // one ingredient-cost unit in the batch -> its effect on one sold unit
  function perUnit(item, c) { return (1 + ovF(c)) / divisor(item, c); }
  function itemTarget(item, c) { return num(item.tgt) > 0 ? num(item.tgt) : num(c.s.targetFC); }

  function roundUp(x, step) {
    step = num(step);
    if (step <= 0) return Math.round(x);
    return Math.ceil(x / step - 1e-9) * step;
  }
  function suggest(item, c, cost) {
    var t = itemTarget(item, c) / 100; if (t <= 0) return 0;
    return roundUp((cost == null ? unitCost(item, c) : cost) / t, c.s.roundTo);
  }

  // Which ingredient price move hurt this item most (current price vs previous price), per sold unit
  function explain(item, c) {
    var rows = [], k = perUnit(item, c);
    (item.lines || []).forEach(function (l) {
      var ing = c.ing[l.ingId];
      if (!ing || ing.prevPrice == null) return;
      var d = (lineCost(ing, l.amount, false) - lineCost(ing, l.amount, true)) * k;
      if (Math.abs(d) > 1e-9) rows.push({ ingId: l.ingId, name: ing.name, delta: d,
        pct: num(ing.prevPrice) ? (num(ing.price) / num(ing.prevPrice) - 1) * 100 : 0 });
    });
    rows.sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });
    return rows;
  }

  // "Keep my price": find cost cuts (swaps first, then trims) until cost share is back to target
  function keepPlan(item, c, subs) {
    var target = itemTarget(item, c) / 100, k = perUnit(item, c);
    var cost0 = unitCost(item, c);
    var gap = cost0 - target * num(item.price);
    var actions = [], saved = 0;
    var lines = (item.lines || []).map(function (l) { return { ingId: l.ingId, amount: num(l.amount) }; });

    (subs || []).forEach(function (s) {
      if (gap <= 1e-9) return;
      var line = lines.filter(function (l) { return l.ingId === s.fromId; })[0];
      var from = c.ing[s.fromId], to = c.ing[s.toId];
      if (!line || !from || !to || line.amount <= 0) return;
      var share = Math.min(1, Math.max(0, num(s.maxShare) / 100));
      var amtFrom = line.amount * share;
      var amtTo = amtFrom * (num(s.ratio) || 1);
      var saving = (lineCost(from, amtFrom) - lineCost(to, amtTo)) * k;
      if (saving <= 1e-9) return;
      var f = Math.min(1, gap / saving);
      actions.push({ type: 'swap', fromId: s.fromId, toId: s.toId, fromName: from.name, toName: to.name,
        amountFrom: amtFrom * f, amountTo: amtTo * f, percent: share * f * 100, saving: saving * f });
      line.amount -= amtFrom * f; saved += saving * f; gap -= saving * f;
      var ex = lines.filter(function (l) { return l.ingId === s.toId; })[0];
      if (ex) ex.amount += amtTo * f; else lines.push({ ingId: s.toId, amount: amtTo * f });
    });

    var maxTrim = Math.max(0, (100 - num(c.s.minPortion)) / 100);
    var trimmable = lines.filter(function (l) { var g = c.ing[l.ingId]; return g && g.trimmable !== false; })
      .map(function (l) { return { l: l, c: lineCost(c.ing[l.ingId], l.amount) * k }; })
      .sort(function (a, b) { return b.c - a.c; });
    trimmable.forEach(function (t) {
      if (gap <= 1e-9 || t.c <= 0 || maxTrim <= 0) return;
      var frac = Math.min(maxTrim, gap / t.c);
      var saving = t.c * frac;
      actions.push({ type: 'trim', ingId: t.l.ingId, name: c.ing[t.l.ingId].name,
        percent: frac * 100, amountFrom: t.l.amount, amountTo: t.l.amount * (1 - frac), saving: saving });
      saved += saving; gap -= saving;
    });

    var newCost = cost0 - saved;
    var needsRise = gap > 1e-6;
    return { cost0: cost0, newCost: newCost, actions: actions, residualGap: Math.max(0, gap),
      needsPriceRise: needsRise,
      priceNeeded: needsRise ? roundUp(newCost / target, c.s.roundTo) : num(item.price) };
  }

  // Compare: do nothing / raise price / keep price with cuts. Profit is per month if sales are given, else per unit.
  function scenarios(item, c, subs) {
    var s = c.s;
    var P = num(item.price), q = num(item.sales) > 0 ? num(item.sales) : 1;
    var eps = num(s.elasticity), qd = num(s.qualityDrop) / 100;
    var target = itemTarget(item, c) / 100;
    var cost0 = unitCost(item, c);
    var fc = P > 0 ? cost0 / P : 0;
    var over = P > 0 && fc > target + 1e-9;

    var raisePrice = Math.max(P, roundUp(cost0 / target, s.roundTo));
    var raiseQ = P > 0 ? q * Math.pow(raisePrice / P, -eps) : q;
    var plan = keepPlan(item, c, subs);
    var keepPrice = Math.max(P, plan.priceNeeded);
    var keepQ = P > 0 ? q * Math.pow(keepPrice / P, -eps) * (plan.actions.length ? (1 - qd) : 1) : q;

    var sc = {
      nothing: { price: P, cost: cost0, qty: q, profit: q * (P - cost0) },
      raise: { price: raisePrice, cost: cost0, qty: raiseQ, profit: raiseQ * (raisePrice - cost0) },
      keep: { price: keepPrice, cost: plan.newCost, qty: keepQ, profit: keepQ * (keepPrice - plan.newCost) }
    };
    var best = 'nothing';
    ['raise', 'keep'].forEach(function (k) { if (sc[k].profit > sc[best].profit + 1e-9) best = k; });
    return { cost: cost0, fc: fc, over: over, target: target * 100, scenarios: sc, best: over ? best : 'nothing', plan: plan,
      explain: explain(item, c), hasSales: num(item.sales) > 0, suggested: roundUp(cost0 / target, s.roundTo) };
  }

  // sizes: [{name, factor, price}] -> cost and cost share of each size (packaging is the same for each size)
  function sizeRows(item, c) {
    var p = parts(item, c), t = itemTarget(item, c) / 100;
    return (item.sizes || []).map(function (z) {
      var f = num(z.factor) || 1, cost = (p.ing + p.lab + p.ovh) * f + p.pack, price = num(z.price);
      return { id: z.id, name: z.name, factor: f, price: price, cost: cost, fc: price > 0 ? cost / price : 0,
        suggested: t > 0 ? roundUp(cost / t, c.s.roundTo) : 0 };
    });
  }

  // wholesale price -> its cost share
  function wholesale(item, c) {
    var w = num(item.wholesale), cost = unitCost(item, c);
    return { price: w, cost: cost, fc: w > 0 ? cost / w : 0, profit: w - cost };
  }

  // 30-day (or shorter) price move of an ingredient from its history
  function rise(ing, now) {
    var h = (ing.history || []).filter(function (x) { return x && num(x.p) > 0; });
    if (h.length < 2) return null;
    now = now || Date.now();
    var cutoff = now - 30 * 864e5, ref = null;
    h.forEach(function (x) { if (x.t <= cutoff) ref = x; });
    if (!ref) ref = h[0];
    var last = h[h.length - 1];
    var days = Math.max(1, Math.round((now - ref.t) / 864e5));
    if (ref === last) return null;
    return { pct: (num(last.p) / num(ref.p) - 1) * 100, days: Math.min(days, 30) };
  }

  // "What changed": ingredients whose price moved since the last update, and what that did to each product.
  function changes(state) {
    var c = ctx(state);
    var ings = [];
    (state.ingredients || []).forEach(function (g) {
      if (g.prevPrice == null || num(g.prevPrice) === num(g.price)) return;
      ings.push({ id: g.id, name: g.name, prev: num(g.prevPrice), now: num(g.price),
        pct: num(g.prevPrice) ? (num(g.price) / num(g.prevPrice) - 1) * 100 : 0 });
    });
    ings.sort(function (a, b) { return Math.abs(b.pct) - Math.abs(a.pct); });
    var items = [];
    (state.items || []).forEach(function (it) {
      var P = num(it.price); if (P <= 0) return;
      var target = itemTarget(it, c) / 100;
      var now = unitCost(it, c, false), prev = unitCost(it, c, true);
      var ex = explain(it, c);
      var fcNow = now / P, fcPrev = prev / P;
      items.push({ id: it.id, name: it.name, price: P, costNow: now, costPrev: prev, delta: now - prev,
        fcNow: fcNow, fcPrev: fcPrev, over: target > 0 && fcNow > target + 1e-9,
        crossed: target > 0 && fcNow > target + 1e-9 && fcPrev <= target + 1e-9,
        cause: ex.length ? ex[0].name : '' });
    });
    items.sort(function (a, b) { return b.delta - a.delta; });
    return { ingredients: ings, items: items };
  }

  // price of 1 base unit from a pack price (e.g. a 40 kg bag, a tray of 30 eggs)
  function packUnitPrice(packPrice, packQty) {
    var q = num(packQty); return q > 0 ? num(packPrice) / q : 0;
  }

  return { wasteCredit: wasteCredit, num: num, blank: blank, normalize: normalize, cleanup: cleanup, mergeStates: mergeStates, sameData: sameData,
    buildMap: buildMap, packMap: packMap, ctx: ctx, lineCost: lineCost, batchIng: batchIng, labour: labour,
    divisor: divisor, packCost: packCost, parts: parts, unitCost: unitCost, itemTarget: itemTarget, roundUp: roundUp,
    suggest: suggest, explain: explain, keepPlan: keepPlan, scenarios: scenarios, sizeRows: sizeRows,
    wholesale: wholesale, rise: rise, changes: changes, packUnitPrice: packUnitPrice };
});
