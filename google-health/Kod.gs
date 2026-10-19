// Min Form – klockdata från Google Health API
// Kör i ditt eget Google-konto. Hämtar vilopuls, HRV, sömn och träningspass
// och lämnar ut dem till Min Form bara om rätt nyckel skickas med.
// Inga uppgifter sparas någon annanstans än i ditt Google-konto.

var DAYS_DEFAULT = 14;

// 1) Kör den här en gång från editorn (välj "setup" och tryck Kör).
//    Den skapar din hemliga nyckel och testar att hämta data.
function setup() {
  var p = PropertiesService.getScriptProperties();
  var k = p.getProperty('KEY');
  if (!k) {
    k = Utilities.getUuid().replace(/-/g, '').slice(0, 24);
    p.setProperty('KEY', k);
  }
  Logger.log('DIN NYCKEL: ' + k);
  var r = collect(3);
  Logger.log('Test: ' + Object.keys(r.days).length + ' dagar, ' + r.exercises.length + ' pass.');
  if (r.errors.length) Logger.log('Fel: ' + r.errors.join(' | '));
  Logger.log(JSON.stringify(r).slice(0, 1500));
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
  try { res = collect(days); res.ok = true; res.at = new Date().toISOString(); }
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
function num_(v) { var n = Number(v); return isFinite(n) && n > 0 ? n : null; }

function api_(type, filter) {
  var base = 'https://health.googleapis.com/v4/users/me/dataTypes/' + type + '/dataPoints';
  var all = [], tok = '', guard = 0;
  do {
    var url = base + '?pageSize=200&filter=' + encodeURIComponent(filter) + (tok ? '&pageToken=' + encodeURIComponent(tok) : '');
    var r = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    var code = r.getResponseCode(), body = r.getContentText();
    if (code !== 200) throw new Error(code + ' ' + body.slice(0, 300));
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
  function tryit(name, fn) { try { fn(); } catch (err) { out.errors.push(name + ': ' + String(err && err.message || err).slice(0, 300)); } }

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
      var m = num_(x.summary && x.summary.minutesAsleep);
      if (d && m) { var o = day(d); o.sleepMin = Math.max(o.sleepMin || 0, Math.round(m)); }
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
