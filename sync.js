// Minimal Supabase client (no library): email+password login and one-row-per-owner cloud sync.
(function () {
  'use strict';
  var CFG = window.APP_CONFIG || {};
  var AK = 'repricer.auth', SK = 'repricer.sync';
  function rd(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function wr(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var auth = rd(AK);                       // {access_token, refresh_token, expires_at, user:{id,email}}
  var meta = rd(SK) || { lastSynced: null, dirty: false };

  function req(method, path, body, token, extra) {
    var h = { apikey: CFG.key, 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    for (var k in (extra || {})) h[k] = extra[k];
    return fetch(CFG.url + path, { method: method, headers: h, body: body == null ? undefined : JSON.stringify(body) })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
          return { ok: r.ok, status: r.status, json: j };
        });
      });
  }
  function errText(r) {
    var j = r.json || {}, c = j.error_code || j.code || '', m = j.msg || j.message || j.error_description || j.error || '';
    var map = {
      invalid_credentials: 'ایمیل یا رمز عبور اشتباه است.',
      user_already_exists: 'این ایمیل قبلاً ثبت شده است؛ وارد شوید.',
      email_exists: 'این ایمیل قبلاً ثبت شده است؛ وارد شوید.',
      weak_password: 'رمز عبور ضعیف است (حداقل ۸ کاراکتر).',
      email_not_confirmed: 'ایمیل هنوز تأیید نشده است.',
      over_email_send_rate_limit: 'تعداد درخواست ایمیل زیاد بود؛ کمی بعد دوباره تلاش کنید.',
      over_request_rate_limit: 'درخواست‌های زیاد؛ کمی بعد دوباره تلاش کنید.',
      signup_disabled: 'ثبت‌نام فعلاً بسته است.',
      email_provider_disabled: 'ورود با ایمیل در تنظیمات Supabase خاموش است. (Authentication ← Sign In / Providers ← Email ← روشن کنید)',
      validation_failed: 'ایمیل یا رمز معتبر نیست.'
    };
    return (map[c] || ('خطا' + (r.status ? ' (' + r.status + ')' : '') + (m ? ': ' + m : '')));
  }
  function setSession(j) {
    if (!j || !j.access_token) return false;
    auth = { access_token: j.access_token, refresh_token: j.refresh_token,
      expires_at: j.expires_at || (Math.floor(Date.now() / 1000) + (j.expires_in || 3600)),
      user: { id: j.user && j.user.id, email: j.user && j.user.email } };
    wr(AK, auth); return true;
  }
  function refresh() {
    if (!auth || !auth.refresh_token) return Promise.reject({ text: 'نیاز به ورود دوباره', auth: true });
    return req('POST', '/auth/v1/token?grant_type=refresh_token', { refresh_token: auth.refresh_token }).then(function (r) {
      if (r.ok && setSession(r.json)) return auth.access_token;
      if (r.status >= 400 && r.status < 500) { auth = null; wr(AK, null); throw { text: 'نیاز به ورود دوباره', auth: true }; }
      throw { text: errText(r) };
    });
  }
  function token() {
    if (!auth) return Promise.reject({ text: 'وارد نشده‌اید', auth: true });
    if (auth.expires_at - 60 > Date.now() / 1000) return Promise.resolve(auth.access_token);
    return refresh();
  }
  function authed(method, path, body, extra) {
    return token().then(function (t) { return req(method, path, body, t, extra); }).then(function (r) {
      if (r.status !== 401) return r;
      return refresh().then(function (t) { return req(method, path, body, t, extra); });
    });
  }

  var S = {
    configured: function () { return !!(CFG.url && CFG.key); },
    user: function () { return auth && auth.user ? auth.user : null; },
    meta: function () { return meta; },
    saveMeta: function () { wr(SK, meta); },
    markDirty: function () { meta.dirty = true; wr(SK, meta); },

    signUp: function (email, pw) {
      return req('POST', '/auth/v1/signup', { email: email, password: pw }).then(function (r) {
        if (!r.ok) throw { text: errText(r) };
        if (setSession(r.json)) return { loggedIn: true };
        return { loggedIn: false, needConfirm: true };
      });
    },
    signIn: function (email, pw) {
      return req('POST', '/auth/v1/token?grant_type=password', { email: email, password: pw }).then(function (r) {
        if (!r.ok || !setSession(r.json)) throw { text: errText(r) };
        return true;
      });
    },
    signOut: function () {
      var t = auth && auth.access_token;
      auth = null; wr(AK, null); meta = { lastSynced: null, dirty: false }; wr(SK, meta);
      if (t) req('POST', '/auth/v1/logout', null, t).catch(function () {});
    },
    // returns row {state, city, share_prices, updated_at} or null
    pull: function () {
      return authed('GET', '/rest/v1/shop_state?select=state,city,share_prices,updated_at&user_id=eq.' + auth.user.id).then(function (r) {
        if (!r.ok) throw { text: errText(r) };
        return (r.json && r.json[0]) || null;
      });
    },
    // returns {ok:true, updated_at} or {conflict:true}
    push: function (state, profile, force) {
      var body = { state: state, city: profile.city || null, share_prices: !!profile.share };
      var rep = { Prefer: 'return=representation' };
      var p;
      if (meta.lastSynced || force) {
        var q = '/rest/v1/shop_state?user_id=eq.' + auth.user.id + (force ? '' : '&updated_at=eq.' + encodeURIComponent(meta.lastSynced));
        p = authed('PATCH', q, body, rep).then(function (r) {
          if (!r.ok) throw { text: errText(r) };
          if (r.json && r.json.length) return { ok: true, updated_at: r.json[0].updated_at };
          if (force) return authed('POST', '/rest/v1/shop_state', body, rep).then(done);
          return { conflict: true };
        });
      } else {
        p = authed('POST', '/rest/v1/shop_state', body, rep).then(done);
      }
      function done(r) {
        if (r.status === 409) return { conflict: true };
        if (!r.ok) throw { text: errText(r) };
        return { ok: true, updated_at: r.json[0].updated_at };
      }
      return p.then(function (res) {
        if (res.ok) { meta.lastSynced = res.updated_at; meta.dirty = false; wr(SK, meta); }
        return res;
      });
    },
    // sign-in name for a phone number (real SMS login comes later; the domain can be changed in config.js)
    phoneId: function (phone) { return phone + '@' + (CFG.phoneDomain || 'phone.repricer.app'); },
    // profile row: name, phone, city, accepted policy version
    saveProfile: function (p) {
      return authed('POST', '/rest/v1/profiles?on_conflict=user_id', p, { Prefer: 'resolution=merge-duplicates,return=minimal' }).then(function (r) {
        if (!r.ok) throw { text: errText(r) };
        return true;
      });
    },
    getProfile: function () {
      return authed('GET', '/rest/v1/profiles?select=first_name,last_name,phone,city,accepted_at,policy_version&user_id=eq.' + auth.user.id).then(function (r) {
        if (!r.ok) throw { text: errText(r) };
        return (r.json && r.json[0]) || null;
      });
    },
    touchProfile: function (ver) {
      return authed('PATCH', '/rest/v1/profiles?user_id=eq.' + auth.user.id, { app_version: ver, last_seen_at: new Date().toISOString() }, { Prefer: 'return=minimal' }).catch(function () {});
    },
    deleteCloud: function () {
      return authed('DELETE', '/rest/v1/shop_state?user_id=eq.' + auth.user.id).then(function (r) {
        if (!r.ok) throw { text: errText(r) };
        meta.lastSynced = null; wr(SK, meta);
      });
    },
    // public settings endpoint: tells whether the server is reachable and whether e-mail confirmation is required
    check: function () {
      return req('GET', '/auth/v1/settings').then(function (r) {
        if (!r.ok) throw { text: errText(r) };
        var ext = (r.json && r.json.external) || {};
        return { autoconfirm: !!(r.json && (r.json.mailer_autoconfirm || ext.email_autoconfirm)), signupDisabled: !!(r.json && r.json.disable_signup), emailOff: ext.email === false };
      });
    }
  };
  window.Sync = S;
})();
