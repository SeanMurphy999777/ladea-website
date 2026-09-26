/* ==========================================================================
   Ladea — script.js
   Small, dependency-free enhancements. The page works without this file:
   navigation is plain anchors and the form posts natively to its action URL.

   1. Header state + mobile menu
   2. Scroll reveal (respects reduced motion)
   3. Contact form: validation + submission adapters
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ 1. Header */
  var header = document.querySelector('[data-header]');
  var nav = document.querySelector('[data-nav]');
  var toggle = document.querySelector('[data-nav-toggle]');
  var toggleLabel = document.querySelector('[data-nav-toggle-label]');

  function onScroll() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  function setMenu(open) {
    if (!nav || !toggle) return;
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (toggleLabel) {
      toggleLabel.textContent = open ? toggle.dataset.labelClose : toggle.dataset.labelOpen;
    }
  }
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        setMenu(false);
        toggle.focus();
      }
    });
    window.matchMedia('(min-width: 1081px)').addEventListener('change', function (mq) {
      if (mq.matches) setMenu(false);
    });
  }

  /* ------------------------------------------------------------------ 2. Reveal */
  // Only elements that start below the fold are hidden (.is-pending) and then
  // revealed on scroll. Everything already in view, and everything when JS or
  // IntersectionObserver is unavailable, stays visible: content never depends on JS.
  var revealEls = document.querySelectorAll('[data-reveal]');
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });

    revealEls.forEach(function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight) return; // already in view
      var index = Array.prototype.indexOf.call(el.parentElement.children, el);
      el.style.setProperty('--reveal-delay', Math.min(index, 6) * 60 + 'ms');
      el.classList.add('is-pending');
      io.observe(el);
    });
  }

  /* ------------------------------------------------------------------ 3. Form */
  var form = document.querySelector('[data-contact-form]');
  if (!form) return;

  // Everything configurable lives on the <form> element (set from site.json by the build):
  //   action="…"          submission endpoint
  //   data-adapter="…"    formdata | json | hubspot
  //   data-msg-*          localized messages
  var endpoint = (form.getAttribute('action') || '').trim();
  var adapter = form.dataset.adapter || 'formdata';
  var msg = form.dataset;

  var summary = form.querySelector('[data-form-summary]');
  var submitBtn = form.querySelector('[data-submit]');
  var success = document.querySelector('[data-form-success]');
  var submitText = submitBtn ? submitBtn.textContent : '';

  form.noValidate = true; // we handle validation so messages are consistent and localizable

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var PHONE_RE = /^[+()\d\s.\-]{7,}$/;

  function validateField(field) {
    var value = field.value.trim();
    var error = '';

    if (field.required && !value) {
      error = msg.msgRequired;
    } else if (value && field.type === 'email' && !EMAIL_RE.test(value)) {
      error = msg.msgEmail;
    } else if (value && field.type === 'tel' && !PHONE_RE.test(value)) {
      error = msg.msgPhone;
    } else if (value && field.minLength > 0 && value.length < field.minLength) {
      error = msg.msgMessageShort;
    }

    var errorEl = form.querySelector('[data-error-for="' + field.name + '"]');
    if (errorEl) errorEl.textContent = error;
    if (error) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
    return !error;
  }

  var fields = Array.prototype.filter.call(form.elements, function (el) {
    return el.name && el.name !== '_gotcha' && el.type !== 'hidden' && el.tagName !== 'BUTTON';
  });

  // Validate on blur; once a field has shown an error, re-check as the person types.
  fields.forEach(function (field) {
    field.addEventListener('blur', function () {
      if (field.value.trim() || field.hasAttribute('aria-invalid')) validateField(field);
    });
    field.addEventListener('input', function () {
      if (field.hasAttribute('aria-invalid')) validateField(field);
    });
  });

  function showSummary(text) {
    if (!summary) return;
    summary.textContent = text || '';
    summary.hidden = !text;
  }

  function setSending(sending) {
    if (!submitBtn) return;
    submitBtn.disabled = sending;
    submitBtn.textContent = sending ? msg.msgSending : submitText;
  }

  function collect() {
    var data = {};
    new FormData(form).forEach(function (value, key) { data[key] = String(value).trim(); });
    return data;
  }

  /* Submission adapters -------------------------------------------------------
     Each returns a fetch() promise. Add another adapter here if a backend needs a
     different payload; everything else (validation, UI states) stays the same.     */
  var adapters = {
    // Formspree, Basin, Getform, n8n/Make/Zapier webhooks, most form backends.
    formdata: function (data) {
      var body = new FormData();
      Object.keys(data).forEach(function (k) { body.append(k, data[k]); });
      return fetch(endpoint, { method: 'POST', body: body, headers: { Accept: 'application/json' } });
    },

    // Custom APIs, serverless functions, n8n webhooks expecting JSON.
    json: function (data) {
      return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data)
      });
    },

    // HubSpot Forms API (no API key needed; the form must exist in HubSpot).
    // endpoint: https://api.hsforms.com/submissions/v3/integration/submit/<portalId>/<formGuid>
    // Adjust HUBSPOT_FIELDS if your HubSpot form uses different internal property names.
    hubspot: function (data) {
      var HUBSPOT_FIELDS = { name: 'firstname', company: 'company', email: 'email', phone: 'phone', message: 'message' };
      var payload = {
        fields: Object.keys(HUBSPOT_FIELDS)
          .filter(function (k) { return data[k]; })
          .map(function (k) { return { objectTypeId: '0-1', name: HUBSPOT_FIELDS[k], value: data[k] }; }),
        context: { pageUri: window.location.href, pageName: document.title }
      };
      return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
  };

  function showSuccess() {
    form.hidden = true;
    if (success) {
      success.hidden = false;
      success.focus();
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    showSummary('');

    var firstInvalid = null;
    fields.forEach(function (field) {
      if (!validateField(field) && !firstInvalid) firstInvalid = field;
    });
    if (firstInvalid) {
      showSummary(msg.msgSummary);
      firstInvalid.focus();
      return;
    }

    var data = collect();

    // Honeypot filled → almost certainly a bot. Pretend it worked, send nothing.
    if (data._gotcha) { showSuccess(); return; }
    delete data._gotcha;

    if (!endpoint) {
      console.warn('[Ladea] Contact form has no endpoint. Set form.endpoint in site.json and rebuild (see README).');
      showSummary(msg.msgNotConfigured);
      return;
    }

    var send = adapters[adapter] || adapters.formdata;
    setSending(true);

    send(data)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        form.reset();
        showSuccess();
      })
      .catch(function (err) {
        console.error('[Ladea] Form submission failed:', err);
        showSummary(msg.msgNetwork);
      })
      .then(function () { setSending(false); });
  });
})();
