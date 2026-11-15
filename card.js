/* Price cards (pictures for Instagram, Bale, Eitaa) and Excel-friendly CSV files. No network, everything is drawn on the phone. */
(function () {
  'use strict';
  var FONT = '"Vazirmatn", Tahoma, "Segoe UI", sans-serif';
  var THEMES = {
    tarazina: { name: 'ترازینا', bg: '#F6F5F0', band: '#0E6B6F', bandInk: '#FFFFFF', ink: '#1E2B2C', mute: '#5C6B6C', accent: '#F2A71B', line: '#D9DDD6' },
    berry: { name: 'توت و شیر', bg: '#FFF5EC', band: '#8E2A55', bandInk: '#FFFFFF', ink: '#2B1620', mute: '#8A6A77', accent: '#F2A33A', line: '#E8CFC3' },
    green: { name: 'سبز', bg: '#F2F6F0', band: '#0E6E55', bandInk: '#FFFFFF', ink: '#14201A', mute: '#5A6A61', accent: '#FFC83D', line: '#CCDCCB' },
    dark: { name: 'تیره', bg: '#1B1620', band: '#2E2538', bandInk: '#FFFFFF', ink: '#F4EEF7', mute: '#A99BB3', accent: '#F2A33A', line: '#41364D' }
  };
  function fmt(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }

  function fontReady() {
    try {
      if (document.fonts && document.fonts.load) {
        return Promise.race([
          Promise.all([document.fonts.load('800 40px Vazirmatn'), document.fonts.load('500 30px Vazirmatn')]),
          new Promise(function (r) { setTimeout(r, 1500); })
        ]);
      }
    } catch (e) {}
    return Promise.resolve();
  }

  function fit(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    var t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }

  function frame(w, h, th) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d');
    x.fillStyle = th.bg; x.fillRect(0, 0, w, h);
    x.direction = 'rtl'; x.textBaseline = 'alphabetic';
    return { c: c, x: x };
  }
  function header(x, w, th, shop, sub) {
    x.fillStyle = th.band; x.fillRect(0, 0, w, 230);
    x.fillStyle = th.accent; x.fillRect(0, 230, w, 10);
    x.fillStyle = th.bandInk; x.textAlign = 'right';
    x.font = '800 74px ' + FONT; x.fillText(fit(x, shop || 'فهرست قیمت', w - 140), w - 70, 118);
    x.font = '500 38px ' + FONT; x.globalAlpha = .85; x.fillText(sub || '', w - 70, 182); x.globalAlpha = 1;
  }
  function footer(x, w, h, th, contact) {
    if (!contact) return;
    x.fillStyle = th.mute; x.textAlign = 'center'; x.font = '600 38px ' + FONT;
    x.fillText(fit(x, contact, w - 140), w / 2, h - 52);
  }

  // one product, big
  function single(opt, th) {
    var w = 1080, h = 1080, f = frame(w, h, th), x = f.x;
    header(x, w, th, opt.shop, opt.sub || '');
    x.textAlign = 'center'; x.fillStyle = th.ink;
    var name = opt.rows[0].name || '';
    x.font = '800 92px ' + FONT; x.fillText(fit(x, name, w - 160), w / 2, 480);
    x.fillStyle = th.accent; x.fillRect(w / 2 - 90, 530, 180, 10);
    x.fillStyle = th.band === '#2E2538' ? th.accent : th.band;
    x.font = '800 170px ' + FONT; x.direction = 'ltr'; x.fillText(fmt(opt.rows[0].price), w / 2, 760); x.direction = 'rtl';
    x.fillStyle = th.ink; x.font = '600 52px ' + FONT;
    x.fillText('تومان' + (opt.rows[0].unit ? '  ·  ' + opt.rows[0].unit : ''), w / 2, 850);
    if (opt.rows[0].note) { x.fillStyle = th.mute; x.font = '500 40px ' + FONT; x.fillText(fit(x, opt.rows[0].note, w - 160), w / 2, 930); }
    footer(x, w, h, th, opt.contact);
    return f.c;
  }

  // price list, up to 12 rows per picture
  function list(rows, opt, th, page, pages) {
    var rowH = 92, top = 290, w = 1080, h = Math.max(1080, top + rows.length * rowH + 150);
    var f = frame(w, h, th), x = f.x;
    header(x, w, th, opt.shop, (opt.sub || 'فهرست قیمت') + (pages > 1 ? '  ·  ' + (page + 1) + '/' + pages : ''));
    rows.forEach(function (r, i) {
      var y = top + i * rowH + 56;
      x.textAlign = 'right'; x.fillStyle = th.ink; x.font = '700 46px ' + FONT;
      var nm = fit(x, r.name || '', 560);
      x.fillText(nm, w - 70, y);
      var nw = x.measureText(nm).width;
      x.textAlign = 'left'; x.font = '800 46px ' + FONT; x.direction = 'ltr';
      var pr = fmt(r.price);
      x.fillText(pr, 70, y);
      var pw = x.measureText(pr).width;
      x.direction = 'rtl';
      x.strokeStyle = th.line; x.lineWidth = 4; x.setLineDash([2, 12]); x.lineCap = 'round';
      x.beginPath(); x.moveTo(70 + pw + 24, y - 12); x.lineTo(w - 70 - nw - 24, y - 12); x.stroke(); x.setLineDash([]);
    });
    x.textAlign = 'right'; x.fillStyle = th.mute; x.font = '500 34px ' + FONT;
    x.fillText('قیمت‌ها به تومان', w - 70, top + rows.length * rowH + 56);
    footer(x, w, h, th, opt.contact);
    return f.c;
  }


  // ---- food label with nutrition table (all numbers are calculated by the app from the ingredients) ----
  function wrap(x, text, maxW) {
    var words = String(text || '').split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) { if (!w) return; var t = cur ? cur + ' ' + w : w; if (cur && x.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur); return lines;
  }
  function n1(v) { return String(Math.round((Number(v) || 0) * 10) / 10); }
  function labelImg(o, th) {
    var w = 1080, P = 70, R = w - P, f = frame(w, 3600, th), x = f.x, y;
    header(x, w, th, o.name || 'برچسب', o.net ? 'وزن خالص: ' + o.net + ' گرم' : '');
    y = 320;
    function title(t) { x.textAlign = 'right'; x.fillStyle = th.band === '#2E2538' ? th.accent : th.band; x.font = '800 46px ' + FONT; x.fillText(t, R, y); y += 22; }
    function para(t, size, color, weight) {
      x.textAlign = 'right'; x.fillStyle = color || th.ink; x.font = (weight || 500) + ' ' + size + 'px ' + FONT;
      wrap(x, t, w - 2 * P).forEach(function (ln) { y += size * 1.55; x.fillText(ln, R, y); }); y += 22;
    }
    if (o.ingredients) { title('ترکیبات'); para(o.ingredients, 38); }
    if (o.allergens && o.allergens.length || o.may) {
      var y0 = y; var tmp = y;
      x.font = '700 38px ' + FONT;
      var t1 = o.allergens && o.allergens.length ? 'آلرژن‌ها: حاوی ' + o.allergens.join('، ') : '';
      var l1 = t1 ? wrap(x, t1, w - 2 * P - 50) : [], l2 = o.may ? wrap(x, 'ممکن است حاوی ردپای ' + o.may + ' باشد', w - 2 * P - 50) : [];
      var bh = (l1.length + l2.length) * 58 + 36;
      x.fillStyle = th.accent; x.globalAlpha = .22; x.fillRect(P, y0, w - 2 * P, bh); x.globalAlpha = 1;
      x.fillStyle = th.accent; x.fillRect(R - 8, y0, 8, bh);
      x.fillStyle = th.ink; x.textAlign = 'right'; tmp = y0 + 18;
      l1.concat(l2).forEach(function (ln) { tmp += 58; x.fillText(ln, R - 28, tmp - 14); });
      y = y0 + bh + 70;
    }
    // nutrition table
    title('ارزش غذایی (محاسبه‌شده)'); y += 8;
    var hasS = !!o.serv, c1 = hasS ? R - 560 : R - 600, c2 = R - 830, rowH = 72;
    x.fillStyle = th.band; x.fillRect(P, y, w - 2 * P, rowH); x.fillStyle = th.bandInk; x.font = '700 32px ' + FONT;
    x.textAlign = 'center'; x.fillText('در 100 گرم', c1, y + 48); if (hasS) x.fillText('هر وعده ' + o.servG + ' گرم', c2 + 10, y + 48);
    y += rowH;
    o.rows.forEach(function (r, i) {
      if (i % 2) { x.fillStyle = th.line; x.globalAlpha = .35; x.fillRect(P, y, w - 2 * P, rowH); x.globalAlpha = 1; }
      x.fillStyle = th.ink; x.textAlign = 'right'; x.font = (r.sub ? '500 ' : '700 ') + '38px ' + FONT; x.fillText(r.label, R - 20 - (r.sub ? 30 : 0), y + 49);
      x.textAlign = 'center'; x.font = '700 40px ' + FONT; x.direction = 'ltr';
      x.fillText(r.per100, c1, y + 49); if (hasS) x.fillText(r.perServ, c2 + 10, y + 49);
      x.direction = 'rtl'; y += rowH;
    });
    x.strokeStyle = th.band; x.lineWidth = 5; x.strokeRect(P, y - rowH * (o.rows.length + 1), w - 2 * P, rowH * (o.rows.length + 1));
    y += 20;
    x.fillStyle = th.mute; x.font = '500 30px ' + FONT; x.textAlign = 'right';
    x.fillText('مقادیر بر پایهٔ محاسبه از ترکیبات است، نه آزمایش.', R, y + 30); y += 70;
    [['تولیدکننده', o.prod], ['تماس و نشانی', o.contact], ['مدت نگهداری', o.shelf], ['شرایط نگهداری', o.store]].forEach(function (p) {
      if (!p[1]) return;
      x.textAlign = 'right'; x.font = '500 38px ' + FONT; x.fillStyle = th.ink;
      wrap(x, p[0] + ': ' + p[1], w - 2 * P).forEach(function (ln) { y += 58; x.fillText(ln, R, y); });
    });
    y += 70;
    var out = document.createElement('canvas'); out.width = w; out.height = y;
    out.getContext('2d').drawImage(f.c, 0, 0);
    return out;
  }

  var Card = {
    themes: THEMES,
    // opt = {kind:'single'|'list', shop, contact, theme, sub, rows:[{name, price, unit?, note?}]} -> Promise<[canvas,...]>
    make: function (opt) {
      var th = THEMES[opt.theme] || THEMES.tarazina;
      return fontReady().then(function () {
        if (opt.kind === 'single') return [single(opt, th)];
        var per = 12, pages = Math.max(1, Math.ceil(opt.rows.length / per)), out = [];
        for (var p = 0; p < pages; p++) out.push(list(opt.rows.slice(p * per, (p + 1) * per), opt, th, p, pages));
        return out;
      });
    },
    // opt = {theme, name, net, ingredients, allergens:[], may, serv, servG, rows:[{label, per100, perServ, sub?}], prod, contact, shelf, store}
    label: function (opt) {
      var th = THEMES[opt.theme] || THEMES.tarazina;
      return fontReady().then(function () { return [labelImg(opt, th)]; });
    },
    toBlob: function (canvas) {
      return new Promise(function (res) { canvas.toBlob(function (b) { res(b); }, 'image/png'); });
    },
    // share through the phone's share sheet when possible, else download the file
    send: function (blobs, base) {
      var files = [];
      try { files = blobs.map(function (b, i) { return new File([b], base + (blobs.length > 1 ? '-' + (i + 1) : '') + '.png', { type: 'image/png' }); }); } catch (e) { files = []; }
      if (files.length && navigator.canShare && navigator.share) {
        try {
          if (navigator.canShare({ files: files })) return navigator.share({ files: files }).then(function () { return 'shared'; }, function (e) { if (e && e.name === 'AbortError') return 'cancelled'; Card.download(blobs, base); return 'downloaded'; });
        } catch (e) {}
      }
      Card.download(blobs, base); return Promise.resolve('downloaded');
    },
    download: function (blobs, base) {
      blobs.forEach(function (b, i) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(b);
        a.download = base + (blobs.length > 1 ? '-' + (i + 1) : '') + '.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      });
    },
    // CSV that Excel opens correctly (UTF-8 with a BOM)
    csv: function (head, rows) {
      function q(v) { v = v == null ? '' : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
      var lines = [head].concat(rows).map(function (r) { return r.map(q).join(','); });
      return '﻿' + lines.join('\r\n');
    },
    saveText: function (text, name, type) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/csv;charset=utf-8' }));
      a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }
  };
  window.Card = Card;
})();
