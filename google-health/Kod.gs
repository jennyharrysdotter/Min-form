// Min Form – klockdata från Google Health API (version 4 – med sömnfaser)
// Kör i ditt eget Google-konto. Hämtar vilopuls, HRV, sömn och träningspass
// och lämnar ut dem till Min Form bara om rätt nyckel skickas med.
// Skriptet loggar in med en egen OAuth-klient som BARA har läsbehörighet
// till Google Health (det kräver Google Health API).
//
// Förberedelse: lägg in två skriptegenskaper under Projektinställningar:
//   CLIENT_ID      – klient-id från Google Cloud
//   CLIENT_SECRET  – klienthemlighet från Google Cloud

var DAYS_DEFAULT = 14;
var SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly'
].join(' ');

// 1) Kör "setup". Första gången skriver loggen en länk som du öppnar i Chrome
//    för att godkänna. Kör sedan "setup" igen – då skrivs nyckeln och ett test.
function setup() {
  var p = PropertiesService.getScriptProperties();
  var k = p.getProperty('KEY');
  if (!k) { k = Utilities.getUuid().replace(/-/g, '').slice(0, 24); p.setProperty('KEY', k); }
  Logger.log('OMDIRIGERINGS-URI (till Google Cloud): ' + redirectUri_());
  if (!p.getProperty('CLIENT_ID') || !p.getProperty('CLIENT_SECRET')) {
    Logger.log('SAKNAS: lägg in skriptegenskaperna CLIENT_ID och CLIENT_SECRET under Projektinställningar och kör setup igen.');
    return;
  }
  if (!p.getProperty('REFRESH_TOKEN')) {
    Logger.log('GODKÄNN: öppna den här länken i Chrome och godkänn, kör sedan setup igen:');
    Logger.log(authUrl_());
    return;
  }
  Logger.log('DIN NYCKEL: ' + k);
  var r = collect(3);
  Logger.log('Test: ' + Object.keys(r.days).length + ' dagar, ' + r.exercises.length + ' pass.');
  if (r.errors.length) Logger.log('Fel: ' + r.errors.join(' | '));
  Logger.log(JSON.stringify(r).slice(0, 1500));
}

// Kör om du vill börja om med godkännandet.
function resetAuth() {
  var p = PropertiesService.getScriptProperties();
  p.deleteProperty('REFRESH_TOKEN');
  CacheService.getScriptCache().remove('AT');
  Logger.log('Godkännandet är nollställt. Kör setup igen.');
}

function redirectUri_() {
  return 'https://script.google.com/macros/d/' + ScriptApp.getScriptId() + '/usercallback';
}

function authUrl_() {
  var p = PropertiesService.getScriptProperties();
  var state = ScriptApp.newStateToken().withMethod('authCallback').withTimeout(3600).createToken();
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + [
    'client_id=' + encodeURIComponent(p.getProperty('CLIENT_ID')),
    'redirect_uri=' + encodeURIComponent(redirectUri_()),
    'response_type=code',
    'scope=' + encodeURIComponent(SCOPES),
    'access_type=offline',
    'prompt=consent',
    'include_granted_scopes=false',
    'state=' + encodeURIComponent(state)
  ].join('&');
}

function authCallback(request) {
  var code = request && request.parameter && request.parameter.code;
  if (!code) return HtmlService.createHtmlOutput('<h2>Ingen kod mottogs.</h2><p>' + (request.parameter.error || '') + '</p>');
  try {
    var j = tokenRequest_({ code: code, grant_type: 'authorization_code', redirect_uri: redirectUri_() });
    if (!j.refresh_token) throw new Error('Google skickade ingen refresh_token. Kör resetAuth och försök igen.');
    PropertiesService.getScriptProperties().setProperty('REFRESH_TOKEN', j.refresh_token);
    if (j.access_token) CacheService.getScriptCache().put('AT', j.access_token, Math.max(60, (j.expires_in || 3600) - 120));
    return HtmlService.createHtmlOutput('<h2 style="font-family:sans-serif">✓ Klart!</h2><p style="font-family:sans-serif">Gå tillbaka till skriptet och kör <b>setup</b> igen.</p>');
  } catch (e) {
    return HtmlService.createHtmlOutput('<h2>Något gick fel</h2><pre>' + String(e.message || e) + '</pre>');
  }
}

function tokenRequest_(payload) {
  var p = PropertiesService.getScriptProperties();
  payload.client_id = p.getProperty('CLIENT_ID');
  payload.client_secret = p.getProperty('CLIENT_SECRET');
  var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post', payload: payload, muteHttpExceptions: true });
  var j = JSON.parse(r.getContentText() || '{}');
  if (r.getResponseCode() !== 200) throw new Error('Token: ' + r.getResponseCode() + ' ' + (j.error_description || j.error || r.getContentText().slice(0, 200)));
  return j;
}

function accessToken_() {
  var c = CacheService.getScriptCache();
  var at = c.get('AT');
  if (at) return at;
  var rt = PropertiesService.getScriptProperties().getProperty('REFRESH_TOKEN');
  if (!rt) throw new Error('Inte godkänt ännu – kör setup i skriptet.');
  var j = tokenRequest_({ refresh_token: rt, grant_type: 'refresh_token' });
  c.put('AT', j.access_token, Math.max(60, (j.expires_in || 3600) - 120));
  return j.access_token;
}

// Min Form anropar webbappen: ...exec?key=DIN_NYCKEL&days=14
function doGet(e) {
  var p = PropertiesService.getScriptProperties();
  var key = p.getProperty('KEY');
  if (!key || !e || !e.parameter || e.parameter.key !== key) return out_({ ok: false, error: 'Fel nyckel' });
  var days = Math.min(60, Math.max(1, Number(e.parameter.days) || DAYS_DEFAULT));
  var cache = CacheService.getScriptCache();
  var ck = 'd' + days;
  if (!e.parameter.fresh) {
    var hit = cache.get(ck);
    if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  }
  var res;
  try { res = collect(days); res.ok = true; res.v = 4; res.at = new Date().toISOString(); }
  catch (err) { res = { ok: false, error: String(err && err.message || err) }; }
  var txt = JSON.stringify(res);
  if (res.ok && txt.length < 90000) cache.put(ck, txt, 600);
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function ymd_(d) { return Utilities.formatDate(d, 'Europe/Stockholm', 'yyyy-MM-dd'); }
function pad_(n) { return (n < 10 ? '0' : '') + n; }
function dstr_(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  if (d.date) return dstr_(d.date);
  if (d.year) return d.year + '-' + pad_(d.month) + '-' + pad_(d.day);
  return null;
}
function civ_(ymd) { var a = ymd.split('-'); return { date: { year: +a[0], month: +a[1], day: +a[2] }, time: { hours: 0, minutes: 0, seconds: 0 } }; }
function num_(v) { var n = Number(v); return isFinite(n) && n > 0 ? n : null; }

function api_(type, filter) {
  var base = 'https://health.googleapis.com/v4/users/me/dataTypes/' + type + '/dataPoints';
  var all = [], tok = '', guard = 0, at = accessToken_();
  do {
    var url = base + '?pageSize=200&filter=' + encodeURIComponent(filter) + (tok ? '&pageToken=' + encodeURIComponent(tok) : '');
    var r = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + at }, muteHttpExceptions: true });
    var code = r.getResponseCode(), body = r.getContentText();
    if (code !== 200) {
      var msg = body.slice(0, 600);
      try { var ej = JSON.parse(body).error; msg = ej.message + ' ' + JSON.stringify(ej.details || '').slice(0, 400); } catch (x) {}
      throw new Error(code + ' ' + msg);
    }
    var j = JSON.parse(body);
    all = all.concat(j.dataPoints || []);
    tok = j.nextPageToken || '';
  } while (tok && ++guard < 10);
  return all;
}

function collect(days) {
  var now = new Date();
  var s = ymd_(new Date(now.getTime() - days * 864e5));
  var e = ymd_(new Date(now.getTime() + 864e5));
  var out = { days: {}, exercises: [], errors: [] };
  function day(d) { return out.days[d] = out.days[d] || {}; }
  function tryit(name, fn) { try { fn(); } catch (err) { out.errors.push(name + ': ' + String(err && err.message || err).slice(0, 500)); } }

  tryit('vilopuls', function () {
    api_('daily-resting-heart-rate', 'daily_resting_heart_rate.date >= "' + s + '" AND daily_resting_heart_rate.date < "' + e + '"').forEach(function (p) {
      var x = p.dailyRestingHeartRate; var d = x && dstr_(x.date); var v = x && num_(x.beatsPerMinute);
      if (d && v) day(d).rhr = Math.round(v);
    });
  });
  tryit('hrv', function () {
    api_('daily-heart-rate-variability', 'daily_heart_rate_variability.date >= "' + s + '" AND daily_heart_rate_variability.date < "' + e + '"').forEach(function (p) {
      var x = p.dailyHeartRateVariability; var d = x && dstr_(x.date); var v = x && num_(x.averageHeartRateVariabilityMilliseconds);
      if (d && v) day(d).hrv = Math.round(v);
    });
  });
  tryit('sömn', function () {
    api_('sleep', 'sleep.interval.civil_end_time >= "' + s + 'T00:00:00" AND sleep.interval.civil_end_time < "' + e + 'T00:00:00"').forEach(function (p) {
      var x = p.sleep; if (!x || !x.interval) return;
      if (x.type && /NAP/i.test(String(x.type))) return;
      var d = dstr_(x.interval.civilEndTime) || ymd_(new Date(x.interval.endTime));
      var sm = x.summary || {};
      var m = num_(sm.minutesAsleep);
      if (d && m) {
        var o = day(d);
        if (!o.sleepMin || m > o.sleepMin) {
          o.sleepMin = Math.round(m);
          // sömnfaser för Min Forms egen sömnpoäng (huvudsömnen, längsta passet)
          var sl = { awake: num_(sm.minutesAwake) || 0, period: num_(sm.minutesInSleepPeriod) || 0, fall: num_(sm.minutesToFallAsleep) || 0 };
          (sm.stagesSummary || []).forEach(function (g) {
            var t = String(g.type || '').toUpperCase(), mm = num_(g.minutes) || 0;
            if (/DEEP/.test(t)) sl.deep = mm; else if (/REM/.test(t)) sl.rem = mm;
            else if (/LIGHT/.test(t)) sl.light = mm; else if (/AWAKE|WAKE/.test(t)) sl.wakes = num_(g.count) || 0;
          });
          o.sl = sl;
        }
      }
    });
  });
  tryit('steg', function () {
    var body = { range: { start: civ_(s), end: civ_(e) }, windowSizeDays: 1, pageSize: 100 };
    var r = UrlFetchApp.fetch('https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp', {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(body),
      headers: { Authorization: 'Bearer ' + accessToken_() }, muteHttpExceptions: true
    });
    if (r.getResponseCode() !== 200) throw new Error(r.getResponseCode() + ' ' + r.getContentText().slice(0, 400));
    (JSON.parse(r.getContentText()).rollupDataPoints || []).forEach(function (x) {
      var d = dstr_(x.civilStartTime); var st = x.steps || {};
      var v = num_(st.countSum != null ? st.countSum : st.count_sum);
      if (d && v) day(d).steps = Math.round(v);
    });
  });
  tryit('pass', function () {
    api_('exercise', 'exercise.interval.civil_start_time >= "' + s + 'T00:00:00" AND exercise.interval.civil_start_time < "' + e + 'T00:00:00"').forEach(function (p) {
      var x = p.exercise; if (!x || !x.interval) return;
      var m = x.metricsSummary || {};
      var dur = parseFloat(x.activeDuration) || (new Date(x.interval.endTime) - new Date(x.interval.startTime)) / 1000;
      var azm = m.activeZoneMinutes; if (azm && typeof azm === 'object') azm = azm.totalMinutes || azm.minutes || null;
      out.exercises.push({
        id: p.name || x.interval.startTime,
        start: x.interval.startTime,
        type: String(x.exerciseType || ''),
        name: x.displayName || '',
        min: Math.round(dur / 60),
        km: num_(m.distanceMillimeters) ? Math.round(m.distanceMillimeters / 1e4) / 100 : null,
        kcal: num_(m.caloriesKcal) ? Math.round(m.caloriesKcal) : null,
        hr: num_(m.averageHeartRateBeatsPerMinute) ? Math.round(Number(m.averageHeartRateBeatsPerMinute)) : null,
        steps: num_(m.steps) ? Math.round(Number(m.steps)) : null,
        elev: num_(m.elevationGainMillimeters) ? Math.round(m.elevationGainMillimeters / 1000) : null,
        azm: num_(azm) ? Math.round(Number(azm)) : null
      });
    });
  });
  return out;
}
