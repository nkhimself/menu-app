/* Core maths of the menu re-pricing app. Works in browsers and Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Logic = factory();
})(this, function () {
  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }

  // amounts are grams (kg-priced), millilitres (litre-priced) or pieces
  function lineCost(ing, amount, usePrev) {
    if (!ing) return 0;
    var a = num(amount);
    var p = usePrev && ing.prevPrice != null ? num(ing.prevPrice) : num(ing.price);
    return ing.unit === 'piece' ? a * p : a / 1000 * p;
  }

  function itemCost(item, ingMap, usePrev) {
    var total = 0;
    (item.lines || []).forEach(function (l) { total += lineCost(ingMap[l.ingId], l.amount, usePrev); });
    return total;
  }

  function roundUp(x, step) {
    step = num(step);
    if (step <= 0) return Math.round(x);
    return Math.ceil(x / step - 1e-9) * step;
  }

  // Which ingredient price move hurt this item most (current price vs previous price)
  function explain(item, ingMap) {
    var rows = [];
    (item.lines || []).forEach(function (l) {
      var ing = ingMap[l.ingId];
      if (!ing || ing.prevPrice == null) return;
      var d = lineCost(ing, l.amount, false) - lineCost(ing, l.amount, true);
      if (Math.abs(d) > 1e-9) rows.push({ ingId: l.ingId, name: ing.name, delta: d,
        pct: num(ing.prevPrice) ? (num(ing.price) / num(ing.prevPrice) - 1) * 100 : 0 });
    });
    rows.sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });
    return rows;
  }

  // "Keep my price": find cost cuts (swaps first, then trims) until food cost is back to target
  function keepPlan(item, ingMap, settings, subs) {
    var target = num(settings.targetFC) / 100;
    var cost0 = itemCost(item, ingMap);
    var gap = cost0 - target * num(item.price);
    var actions = [], saved = 0;
    var lines = (item.lines || []).map(function (l) { return { ingId: l.ingId, amount: num(l.amount) }; });

    // 1) substitutions
    (subs || []).forEach(function (s) {
      if (gap <= 1e-9) return;
      var line = lines.filter(function (l) { return l.ingId === s.fromId; })[0];
      var from = ingMap[s.fromId], to = ingMap[s.toId];
      if (!line || !from || !to || line.amount <= 0) return;
      var share = Math.min(1, Math.max(0, num(s.maxShare) / 100));
      var amtFrom = line.amount * share;
      var amtTo = amtFrom * (num(s.ratio) || 1);
      var saving = lineCost(from, amtFrom) - lineCost(to, amtTo);
      if (saving <= 1e-9) return;
      var f = Math.min(1, gap / saving);
      actions.push({ type: 'swap', fromId: s.fromId, toId: s.toId, fromName: from.name, toName: to.name,
        amountFrom: amtFrom * f, amountTo: amtTo * f, percent: share * f * 100, saving: saving * f });
      line.amount -= amtFrom * f; saved += saving * f; gap -= saving * f;
      var ex = lines.filter(function (l) { return l.ingId === s.toId; })[0];
      if (ex) ex.amount += amtTo * f; else lines.push({ ingId: s.toId, amount: amtTo * f });
    });

    // 2) trims on ingredients the owner allows to trim, most expensive first
    var maxTrim = Math.max(0, (100 - num(settings.minPortion)) / 100);
    var trimmable = lines.filter(function (l) { var g = ingMap[l.ingId]; return g && g.trimmable !== false; })
      .map(function (l) { return { l: l, c: lineCost(ingMap[l.ingId], l.amount) }; })
      .sort(function (a, b) { return b.c - a.c; });
    trimmable.forEach(function (t) {
      if (gap <= 1e-9 || t.c <= 0 || maxTrim <= 0) return;
      var frac = Math.min(maxTrim, gap / t.c);
      var saving = t.c * frac;
      actions.push({ type: 'trim', ingId: t.l.ingId, name: ingMap[t.l.ingId].name,
        percent: frac * 100, amountFrom: t.l.amount, amountTo: t.l.amount * (1 - frac), saving: saving });
      saved += saving; gap -= saving;
    });

    var newCost = cost0 - saved;
    var needsRise = gap > 1e-6;
    return { cost0: cost0, newCost: newCost, actions: actions, residualGap: Math.max(0, gap),
      needsPriceRise: needsRise,
      priceNeeded: needsRise ? roundUp(newCost / target, settings.roundTo) : num(item.price) };
  }

  // Compare: do nothing / raise price / keep price with cuts. Profit is per month if sales are given, else per unit.
  function scenarios(item, ingMap, settings, subs) {
    var P = num(item.price), q = num(item.sales) > 0 ? num(item.sales) : 1;
    var eps = num(settings.elasticity), qd = num(settings.qualityDrop) / 100;
    var target = num(settings.targetFC) / 100;
    var cost0 = itemCost(item, ingMap);
    var fc = P > 0 ? cost0 / P : 0;
    var over = fc > target + 1e-9;

    var raisePrice = Math.max(P, roundUp(cost0 / target, settings.roundTo));
    var raiseQ = q * Math.pow(raisePrice / P, -eps);
    var plan = keepPlan(item, ingMap, settings, subs);
    var keepPrice = Math.max(P, plan.priceNeeded);
    var keepQ = q * Math.pow(keepPrice / P, -eps) * (plan.actions.length ? (1 - qd) : 1);

    var s = {
      nothing: { price: P, cost: cost0, qty: q, profit: q * (P - cost0) },
      raise: { price: raisePrice, cost: cost0, qty: raiseQ, profit: raiseQ * (raisePrice - cost0) },
      keep: { price: keepPrice, cost: plan.newCost, qty: keepQ, profit: keepQ * (keepPrice - plan.newCost) }
    };
    var best = 'nothing';
    ['raise', 'keep'].forEach(function (k) { if (s[k].profit > s[best].profit + 1e-9) best = k; });
    return { cost: cost0, fc: fc, over: over, scenarios: s, best: over ? best : 'nothing', plan: plan,
      explain: explain(item, ingMap), hasSales: num(item.sales) > 0 };
  }

  function buildMap(state) {
    var m = {}; (state.ingredients || []).forEach(function (i) { m[i.id] = i; }); return m;
  }

  // "What changed": ingredients whose price moved since the last update, and what that did to each dish.
  function changes(state) {
    var map = buildMap(state), target = num(state.settings && state.settings.targetFC) / 100;
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
      var now = itemCost(it, map, false), prev = itemCost(it, map, true);
      var ex = explain(it, map);
      var fcNow = now / P, fcPrev = prev / P;
      items.push({ id: it.id, name: it.name, price: P, costNow: now, costPrev: prev, delta: now - prev,
        fcNow: fcNow, fcPrev: fcPrev, over: target > 0 && fcNow > target + 1e-9,
        crossed: target > 0 && fcNow > target + 1e-9 && fcPrev <= target + 1e-9,
        cause: ex.length ? ex[0].name : '' });
    });
    items.sort(function (a, b) { return b.delta - a.delta; });
    return { ingredients: ings, items: items };
  }

  return { lineCost: lineCost, itemCost: itemCost, roundUp: roundUp, explain: explain,
    keepPlan: keepPlan, scenarios: scenarios, buildMap: buildMap, changes: changes };
});
