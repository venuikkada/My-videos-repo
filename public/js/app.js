/* Website logic: language switch, downloader flow and report form.
   Plain JavaScript (no framework) so it loads fast on cheap phones. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var I18N = window.I18N || { en: {} };
  var toolEl = document.getElementById('tool');
  var FILE_TTL_MIN = (toolEl && toolEl.getAttribute('data-ttl')) || '30';

  // ---------------- Language ----------------
  var lang = 'en';
  try { lang = localStorage.getItem('lang') || 'en'; } catch (e) { /* private mode */ }
  if (!I18N[lang]) lang = 'en';

  // Get a label in the current language (falls back to English).
  function t(key, vars) {
    var text = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { text = text.replace('{' + k + '}', vars[k]); });
    return text;
  }

  function applyLanguage() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (I18N[lang][key] || I18N.en[key]) el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      // Keep page-specific English placeholders unless a translation is chosen.
      if (lang !== 'en') el.placeholder = t(el.getAttribute('data-i18n-ph'));
      else if (el.dataset.phEn) el.placeholder = el.dataset.phEn;
    });
    document.querySelectorAll('[data-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang));
    });
  }

  document.querySelectorAll('[data-i18n-ph]').forEach(function (el) { el.dataset.phEn = el.placeholder; });
  document.querySelectorAll('[data-lang]').forEach(function (b) {
    b.addEventListener('click', function () {
      lang = b.getAttribute('data-lang');
      try { localStorage.setItem('lang', lang); } catch (e) { /* ignore */ }
      applyLanguage();
    });
  });
  applyLanguage();

  // ---------------- Small helpers ----------------
  function show(el, yes) { if (el) el.hidden = !yes; }

  // Use a translated error if we have one for this code, else the server text.
  function errorText(data) {
    if (data && data.code && I18N[lang]['err_' + data.code]) return t('err_' + data.code);
    return (data && data.error) || t('networkError');
  }

  function postJson(url, body, timeoutMs) {
    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs || 60000) : null;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined,
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) { var err = new Error('api'); err.data = data; throw err; }
        return data;
      });
    });
  }

  function formatMb(bytes) {
    if (!bytes) return '';
    var mb = bytes / 1048576;
    return mb >= 1 ? mb.toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  // ---------------- Downloader ----------------
  var form = $('link-form');
  if (form) initDownloader();

  function initDownloader() {
    var input = $('link');
    var message = $('message');
    var getBtn = $('get-btn');
    var current = null; // { url, info }
    var pollTimer = null;
    var busy = false;

    function setMessage(text, ok) {
      message.textContent = text || '';
      message.classList.toggle('ok', Boolean(ok));
      show(message, Boolean(text));
    }

    function resetAll() {
      clearTimeout(pollTimer);
      busy = false;
      current = null;
      show($('result'), false);
      show($('job'), false);
      setMessage('');
    }

    // "Paste link" button. Phones ask for permission the first time.
    $('paste-btn').addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function (text) {
          text = (text || '').trim();
          if (!text) { setMessage(t('pasteHint'), true); input.focus(); return; }
          input.value = text;
          setMessage('');
          getOptions();
        }).catch(function () {
          setMessage(t('pasteHint'), true);
          input.focus();
        });
      } else {
        setMessage(t('pasteHint'), true);
        input.focus();
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      getOptions();
    });

    // Allow /?url=... (for example from a "share to" shortcut). We only fill
    // the box; the user still taps the button.
    try {
      var shared = new URLSearchParams(location.search).get('url') || new URLSearchParams(location.search).get('text');
      if (shared) input.value = shared;
    } catch (e) { /* old browser */ }

    function getOptions() {
      var url = input.value.trim();
      if (!url) { setMessage(t('err_EMPTY')); input.focus(); return; }
      if (busy) return;
      resetAll();
      busy = true;
      getBtn.disabled = true;
      show($('loading'), true);

      postJson('/api/info', { url: url }, 70000).then(function (info) {
        current = { url: url, info: info };
        renderInfo(info);
      }).catch(function (err) {
        setMessage(errorText(err.data));
      }).then(function () {
        busy = false;
        getBtn.disabled = false;
        show($('loading'), false);
      });
    }

    function renderInfo(info) {
      $('title').textContent = info.title;
      var meta = [info.platformName, info.durationText, info.uploader].filter(Boolean).join(' · ');
      $('meta').textContent = meta;
      var img = $('thumb');
      if (info.thumbnail) {
        img.onerror = function () { show(img, false); };
        img.src = info.thumbnail;
        show(img, true);
      } else {
        show(img, false);
      }
      renderOptions($('video-options'), info.video, 'video');
      renderOptions($('audio-options'), info.audio, 'audio');
      selectTab(info.video.length ? 'video' : 'audio');
      show($('result'), true);
      $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function renderOptions(container, list, type) {
      container.innerHTML = '';
      if (!list || !list.length) {
        var p = document.createElement('p');
        p.className = 'small';
        p.textContent = t('noOptions');
        container.appendChild(p);
        return;
      }
      list.forEach(function (opt) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'option';
        btn.disabled = Boolean(opt.tooLarge);
        if (opt.tooLarge) btn.setAttribute('data-too-large', '1');

        var left = document.createElement('span');
        var name = document.createElement('strong');
        name.textContent = opt.label;
        left.appendChild(name);
        if (opt.sizeText) {
          var size = document.createElement('span');
          size.className = 'size';
          size.textContent = '  ~' + opt.sizeText;
          left.appendChild(size);
        }
        var right = document.createElement('span');
        right.className = 'go';
        right.textContent = opt.tooLarge ? t('tooLarge') : t('choose') + ' →';

        btn.appendChild(left);
        btn.appendChild(right);
        btn.addEventListener('click', function () { startJob(type, opt.quality); });
        container.appendChild(btn);
      });
    }

    // Tabs
    document.querySelectorAll('[data-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () { selectTab(tab.getAttribute('data-tab')); });
    });
    function selectTab(name) {
      document.querySelectorAll('[data-tab]').forEach(function (tab) {
        tab.setAttribute('aria-selected', String(tab.getAttribute('data-tab') === name));
      });
      show($('panel-video'), name === 'video');
      show($('panel-audio'), name === 'audio');
    }

    function setOptionsDisabled(disabled) {
      document.querySelectorAll('.option').forEach(function (b) {
        if (!b.hasAttribute('data-too-large')) b.disabled = disabled;
      });
    }

    function setProgress(pct, stage, extra) {
      $('bar').style.width = pct + '%';
      $('progress').setAttribute('aria-valuenow', String(pct));
      $('job-pct').textContent = pct + '%' + (extra ? ' · ' + extra : '');
      $('job-stage').textContent = t('stage_' + stage);
    }

    function startJob(type, quality) {
      if (!current || busy) return;
      busy = true;
      setMessage('');
      setOptionsDisabled(true);
      show($('job'), true);
      show($('download-btn'), false);
      show($('file-info'), false);
      show($('again-btn'), false);
      setProgress(0, 'queued');
      $('job').scrollIntoView({ behavior: 'smooth', block: 'center' });

      postJson('/api/jobs', { url: current.url, type: type, quality: quality }, 70000).then(function (data) {
        poll(data.jobId, 0);
      }).catch(function (err) {
        jobFailed(errorText(err.data));
      });
    }

    function poll(jobId, failures) {
      fetch('/api/jobs/' + encodeURIComponent(jobId), { cache: 'no-store' }).then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      }).then(function (r) {
        if (!r.ok) return jobFailed(errorText(r.data));
        var job = r.data;
        if (job.status === 'ready') return jobReady(job);
        if (job.status === 'failed') return jobFailed(job.error);
        var extra = job.status === 'queued' && job.queuePosition ? t('queuePos', { n: job.queuePosition }) : '';
        setProgress(job.progress || 0, job.stage, extra);
        pollTimer = setTimeout(function () { poll(jobId, 0); }, job.status === 'queued' ? 2500 : 1500);
      }).catch(function () {
        // Slow 4G can drop a request. Try a few more times before giving up.
        if (failures < 5) pollTimer = setTimeout(function () { poll(jobId, failures + 1); }, 3000);
        else jobFailed(t('networkError'));
      });
    }

    function jobReady(job) {
      busy = false;
      setProgress(100, 'ready');
      var link = $('download-btn');
      link.href = job.downloadUrl;
      link.setAttribute('download', job.fileName || '');
      show(link, true);
      var info = $('file-info');
      info.textContent = job.fileName + ' · ' + t('fileReady', { size: formatMb(job.fileSize), min: FILE_TTL_MIN });
      show(info, true);
      show($('again-btn'), true);
      setOptionsDisabled(false);
    }

    function jobFailed(text) {
      busy = false;
      $('job-stage').textContent = t('stage_failed');
      show($('job'), false);
      setMessage(text);
      setOptionsDisabled(false);
    }

    $('again-btn').addEventListener('click', function () {
      resetAll();
      input.value = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      input.focus();
    });
  }

  // ---------------- Report form ----------------
  var reportForm = $('report-form');
  if (reportForm) {
    reportForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('report-message');
      var body = {};
      new FormData(reportForm).forEach(function (value, key) { body[key] = value; });
      body.goodFaith = reportForm.elements.goodFaith.checked;
      body.accurate = reportForm.elements.accurate.checked;
      var btn = reportForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      postJson('/api/report', body, 30000).then(function (data) {
        msg.textContent = data.message;
        msg.classList.add('ok');
        show(msg, true);
        reportForm.reset();
      }).catch(function (err) {
        msg.textContent = errorText(err.data);
        msg.classList.remove('ok');
        show(msg, true);
      }).then(function () { btn.disabled = false; });
    });
  }
})();
