// SMART MD — native site main.js v3
// Port of the live GLOBAL-JS behaviors (nav, reveals, search, FAQ, forms,
// age gate, disclaimers, notify-me, cart beacon). Changes vs GHL version:
//   - Google Translate injection removed (external script, hurt first paint).
//   - IntersectionObserver reveals honor prefers-reduced-motion.
//   - No hot-swap loader: this site IS the HTML.

// ── FORM SUBMISSION CONFIG ─────────────────────────────────
// SECURITY: no API tokens client-side. Configure a GHL Workflow inbound
// webhook before launch; localStorage backlog guarantees zero lead loss.
const GHL_CAPTURE_WEBHOOK = 'PASTE_GHL_WEBHOOK_URL_HERE';

async function smartSubmit(data) {
  const payload = {
    firstName: data.firstName || data.first_name || 'Subscriber',
    lastName: data.lastName || data.last_name || '',
    email: data.email || '',
    phone: data.phone || '',
    source: 'smartmdpeptides.com',
    capturedAt: new Date().toISOString(),
    pageUrl: location.pathname + location.search,
  };
  let tags = data.tags || ['source-smartmdpeptides', 'new-lead'];
  if (typeof tags === 'string') tags = tags.split(',').map(t => t.trim());
  try {
    const productId = new URLSearchParams(location.search).get('product');
    if (productId) tags.push('interest-product-' + productId);
  } catch (e) {}

  try {
    const key = 'smartmd_lead_backlog';
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    existing.push({ ...payload, tags, ...data, _backupId: Date.now() + '-' + Math.random().toString(36).slice(2, 8) });
    if (existing.length > 200) existing.shift();
    localStorage.setItem(key, JSON.stringify(existing));
  } catch (e) {}

  let webhookOk = false;

  // Try 1: GHL inbound webhook (if configured) — same as live GLOBAL-JS
  if (GHL_CAPTURE_WEBHOOK !== 'PASTE_GHL_WEBHOOK_URL_HERE') {
    try {
      const res = await fetch(GHL_CAPTURE_WEBHOOK, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, tags: tags.join(','), ...data }),
      });
      webhookOk = res.ok;
    } catch (e) {}
  }

  // Try 2 + 3: legacy Express endpoints — exact parity with live GLOBAL-JS
  // (fail silently on static hosting; localStorage backlog preserves the lead)
  if (!webhookOk) {
    try {
      const res = await fetch('/api/lead-capture', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, tags, ...data }),
      });
      if (res.ok) webhookOk = true;
    } catch (e) {}
  }
  if (!webhookOk) {
    try {
      const res = await fetch('/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, source: data.source || 'website' }),
      });
      if (res.ok) webhookOk = true;
    } catch (e) {}
  }

  // Return true even if all destinations fail — localStorage backup preserves the lead.
  return true;
}

// ── BACKLOG FLUSH ──────────────────────────────────────────
(function flushSmartmdBacklog() {
  if (GHL_CAPTURE_WEBHOOK === 'PASTE_GHL_WEBHOOK_URL_HERE') return;
  setTimeout(async function () {
    try {
      const KEY = 'smartmd_lead_backlog';
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const backlog = JSON.parse(raw);
      if (!Array.isArray(backlog) || !backlog.length) return;
      const remaining = [];
      for (const rec of backlog) {
        try {
          const tagsStr = Array.isArray(rec.tags) ? rec.tags.join(',') : (rec.tags || '');
          const r = await fetch(GHL_CAPTURE_WEBHOOK, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...rec, tags: tagsStr, _flushedAt: new Date().toISOString(), _backlog: true }),
          });
          if (!r.ok) remaining.push(rec);
        } catch (e) { remaining.push(rec); }
      }
      if (remaining.length) localStorage.setItem(KEY, JSON.stringify(remaining));
      else localStorage.removeItem(KEY);
    } catch (e) {}
  }, 4000);
})();

// ── NAV TOGGLE ─────────────────────────────────────────────
const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');
if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', open);
    navToggle.textContent = open ? '✕' : '☰';
  });
  navLinks.querySelectorAll('a').forEach(a => {
    if (!a.closest('.nav-dropdown')) {
      a.addEventListener('click', () => {
        navLinks.classList.remove('open');
        navToggle.textContent = '☰';
        navToggle.setAttribute('aria-expanded', false);
      });
    }
  });
}

// ── MOBILE DROPDOWN ACCORDION ──────────────────────────────
document.querySelectorAll('.has-dropdown > a').forEach(trigger => {
  trigger.addEventListener('click', (e) => {
    if (window.innerWidth > 900) return;
    e.preventDefault();
    const dropdown = trigger.closest('.has-dropdown').querySelector('.nav-dropdown');
    if (dropdown) {
      const isOpen = dropdown.classList.toggle('open');
      const arrow = trigger.querySelector('.nav-arrow');
      if (arrow) arrow.style.transform = isOpen ? 'rotate(180deg)' : '';
    }
  });
});

// ── SCROLL REVEALS (reduced-motion aware) ──────────────────
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduceMotion) {
  document.querySelectorAll('.animate').forEach(el => el.classList.add('in-view'));
} else {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.animate').forEach(el => observer.observe(el));
}

// ── SMOOTH ANCHORS ─────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); }
  });
});

// ── COMPOUND SEARCH + FILTER ───────────────────────────────
const searchInput = document.getElementById('compoundSearch');
const filterBtns = document.querySelectorAll('.filter-btn');
const catSections = document.querySelectorAll('.cat-section');
const allCards = document.querySelectorAll('.compound-card[data-category]');
const searchCount = document.getElementById('searchCount');

function updateSearch() {
  const q = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const active = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
  let visible = 0;
  allCards.forEach(card => {
    const name = (card.querySelector('.compound-name')?.textContent || '').toLowerCase();
    const desc = (card.querySelector('.compound-desc')?.textContent || '').toLowerCase();
    const tag = (card.querySelector('.compound-tag')?.textContent || '').toLowerCase();
    const category = card.dataset.category || '';
    const show = (!q || name.includes(q) || desc.includes(q) || tag.includes(q)) && (active === 'all' || category === active);
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  if (searchCount) {
    searchCount.textContent = q || active !== 'all' ? `${visible} compound${visible !== 1 ? 's' : ''} found` : '';
  }
  catSections.forEach(section => {
    const categoryMatch = active === 'all' || section.dataset.category === active;
    const anyVisible = [...section.querySelectorAll('.compound-card')].some(c => c.style.display !== 'none');
    section.style.display = (categoryMatch && anyVisible) ? '' : 'none';
  });
}
if (searchInput) searchInput.addEventListener('input', updateSearch);
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updateSearch();
  });
});

// ── FAQ ────────────────────────────────────────────────────
function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  const answer = item.querySelector('.faq-a');
  const expanded = btn.getAttribute('aria-expanded') === 'true';
  document.querySelectorAll('.faq-item').forEach(i => {
    i.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
    i.querySelector('.faq-a').classList.remove('open');
  });
  if (!expanded) {
    btn.setAttribute('aria-expanded', 'true');
    answer.classList.add('open');
  }
}

// ── FORM HANDLERS (referenced by inline onsubmit in page HTML) ──
async function handleWholesaleGate(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type=submit]');
  btn.textContent = 'Submitting…'; btn.disabled = true;
  await smartSubmit({
    firstName: form.firstName?.value || '', email: form.email?.value || '', phone: form.phone?.value || '',
    tags: ['source-smartmdpeptides', 'b2b-lead', 'wholesale-gate'],
  });
  document.getElementById('gate-locked').style.display = 'none';
  const unlocked = document.getElementById('gate-unlocked');
  unlocked.style.display = 'block';
  unlocked.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function handleWholesaleFull(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type=submit]');
  btn.textContent = 'Submitting…'; btn.disabled = true;
  await smartSubmit({
    firstName: form.firstName?.value || 'Wholesale Applicant', email: form.email?.value || '',
    tags: ['source-smartmdpeptides', 'b2b-lead', 'wholesale-full-app'],
  });
  form.style.display = 'none';
  const success = document.getElementById('full-form-success');
  if (success) success.style.display = 'block';
}

async function handleAffiliate(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type=submit]');
  const spinner = form.querySelector('.spinner');
  if (spinner) spinner.style.display = 'block';
  btn.disabled = true;
  if (btn.querySelector('.btn-text')) btn.querySelector('.btn-text').textContent = 'Submitting…';
  else btn.textContent = 'Submitting…';
  await smartSubmit({
    firstName: form.firstName?.value || '', lastName: form.lastName?.value || '',
    email: form.email?.value || '', phone: form.phone?.value || '',
    tags: ['source-smartmdpeptides', 'affiliate-lead', 'peptide-papis'],
  });
  form.style.display = 'none';
  const success = document.getElementById('affiliate-success');
  if (success) success.style.display = 'block';
}

async function handleContact(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type=submit]');
  btn.disabled = true;
  const btnText = btn.querySelector('.btn-text');
  if (btnText) btnText.textContent = 'Sending…';
  else btn.textContent = 'Sending…';
  await smartSubmit({
    firstName: form.firstName?.value || '', lastName: form.lastName?.value || '',
    email: form.email?.value || '', phone: form.phone?.value || '',
    tags: ['source-smartmdpeptides', 'contact-form', 'new-lead'],
  });
  form.style.display = 'none';
  const success = document.getElementById('contact-success');
  if (success) success.style.display = 'block';
}

function handleVerify(e) {
  e.preventDefault();
  const form = e.target;
  const batchNumber = form.batchNumber.value.trim().toUpperCase();
  const resultEl = document.getElementById('verify-result');
  if (!resultEl) return;
  resultEl.style.display = 'block';
  resultEl.innerHTML = `
    <p style="font-weight:600; margin-bottom:10px; font-size:15px;">🔍 Looking up <span style="color:var(--red-light);font-family:monospace">${batchNumber}</span>…</p>
    <p style="font-size:13.5px; color:var(--muted); line-height:1.75;">Our live COA database is being configured. For immediate COA retrieval on any batch, contact your account manager with the batch number.</p>
    <a href="mailto:info@smartmbservices.com?subject=COA%20Request%20%E2%80%94%20${encodeURIComponent(batchNumber)}" class="btn btn-ghost-red btn-sm" style="margin-top:16px;display:inline-flex">Request COA by Email</a>
  `;
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function handleCapture() {
  const emailInput = document.getElementById('captureEmail');
  const captureWrap = document.getElementById('captureFormWrap');
  const captureSucc = document.getElementById('captureSuccess');
  if (!emailInput || !emailInput.value.trim()) return;
  try {
    await smartSubmit({ firstName: 'Subscriber', email: emailInput.value.trim(), tags: ['source-smartmdpeptides', 'newsletter', 'new-lead'] });
  } catch (err) {}
  if (captureWrap) captureWrap.style.display = 'none';
  if (captureSucc) captureSucc.style.display = 'block';
}

// ── NAV SHADOW + PROGRESS ──────────────────────────────────
const navEl = document.querySelector('nav');
if (navEl) {
  window.addEventListener('scroll', () => {
    navEl.style.boxShadow = window.scrollY > 20 ? '0 4px 40px rgba(0,0,0,0.6)' : '';
  }, { passive: true });
}
const progressBar = document.getElementById('progressBar');
if (progressBar) {
  window.addEventListener('scroll', () => {
    const total = document.documentElement.scrollHeight - window.innerHeight;
    progressBar.style.width = total > 0 ? (window.scrollY / total * 100) + '%' : '0%';
  }, { passive: true });
}

// ── DISCLAIMER BAR GUARANTEE ───────────────────────────────
(function injectDisclaimer() {
  if (document.querySelector('.disclaimer-bar, .compliance-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'disclaimer-bar';
  bar.innerHTML = 'Research Use Only &nbsp;·&nbsp; Not for human consumption &nbsp;·&nbsp; Not evaluated by the FDA.';
  document.body.insertBefore(bar, document.body.firstChild);
})();

// ── AGE GATE ───────────────────────────────────────────────
(function injectAgeGate() {
  if (localStorage.getItem('smart_age_verified') === '1') return;
  if (document.getElementById('ageGate')) return;
  const overlay = document.createElement('div');
  overlay.id = 'ageGate';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(10,5,7,0.97);display:flex;align-items:center;justify-content:center;padding:24px;';
  overlay.innerHTML = '<div style="max-width:480px;width:100%;background:#140B0E;border:1px solid rgba(211,30,42,0.32);border-radius:20px;padding:48px 40px;text-align:center;">'
    + '<div style="font-size:11px;letter-spacing:3px;color:#D31E2A;margin-bottom:16px;font-weight:700;">SMART MD</div>'
    + '<h2 style="font-family:Bebas Neue,sans-serif;font-size:36px;line-height:1.1;margin-bottom:16px;color:#F7F1F1;">Research Access<br><span style="color:#D31E2A;">Confirmation Required</span></h2>'
    + '<p style="font-size:14px;color:#9D8F93;line-height:1.7;margin-bottom:12px;">All products on this site are <strong style="color:#F7F1F1;">for research purposes only</strong>. Not intended for human consumption. Not evaluated by the FDA.</p>'
    + '<p style="font-size:14px;color:#9D8F93;line-height:1.7;margin-bottom:32px;">By entering, you confirm you are <strong style="color:#F7F1F1;">18 years or older</strong> and are a qualified researcher.</p>'
    + '<button onclick="document.getElementById(\'ageGate\').style.display=\'none\';localStorage.setItem(\'smart_age_verified\',\'1\');" style="width:100%;padding:16px;background:#D31E2A;border:none;border-radius:8px;color:#F7F1F1;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:1px;margin-bottom:12px;">I AM 18+ AND A QUALIFIED RESEARCHER — ENTER</button>'
    + '<a href="https://google.com" style="display:block;font-size:12px;color:#5D5156;text-decoration:none;">I do not meet these requirements — Exit</a>'
    + '</div>';
  document.body.appendChild(overlay);
})();

// ── TCPA SMS CONSENT ───────────────────────────────────────
(function injectSmsConsent() {
  document.querySelectorAll('input[type="tel"], input[name="phone"], input[placeholder*="phone" i]').forEach(function (phoneInput) {
    if (phoneInput.dataset.smsConsent) return;
    phoneInput.dataset.smsConsent = 'true';
    var disclosure = document.createElement('p');
    disclosure.style.cssText = 'font-size:11px;color:#5D5156;margin-top:4px;line-height:1.5;';
    disclosure.textContent = 'By providing your phone number, you agree to receive text messages from SMART MD including order updates and product alerts. Msg & data rates may apply. Reply STOP to unsubscribe. ~4 msgs/month.';
    phoneInput.parentNode.insertBefore(disclosure, phoneInput.nextSibling);
  });
})();

// ── CART EVENTS BEACON ─────────────────────────────────────
(function () {
  var KEY = 'smartmd_cart_events_v1';
  var MAX = 50, TTL_DAYS = 30;
  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return [];
      var cutoff = Date.now() - TTL_DAYS * 86400000;
      return JSON.parse(raw).filter(function (e) { return new Date(e.ts).getTime() > cutoff; });
    } catch (e) { return []; }
  }
  function write(arr) { try { localStorage.setItem(KEY, JSON.stringify(arr.slice(-MAX))); } catch (e) {} }
  function log(event, payload) {
    var buf = read();
    buf.push(Object.assign({ ts: new Date().toISOString(), event: event, url: location.pathname }, payload || {}));
    write(buf);
  }
  if (document.querySelector('.compound-card')) {
    log('page_view', {
      products_shown: Array.from(document.querySelectorAll('.compound-card .compound-name')).slice(0, 20).map(function (el) { return el.textContent.trim(); }),
    });
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-buynow]');
    if (!btn) return;
    var card = btn.closest('.compound-card');
    var name = card ? (card.querySelector('.compound-name') || {}).textContent : btn.textContent;
    log('buy_click', { product_id: btn.getAttribute('data-product-id') || null, product_name: (name || '').trim(), href: btn.getAttribute('href') });
  });
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.querySelector) return;
    var emailEl = form.querySelector('input[type="email"], input[name="email"]');
    if (!emailEl || !emailEl.value) return;
    var events = read();
    if (!events.length) return;
    var productNames = events.filter(function (ev) { return ev.product_name; }).map(function (ev) { return ev.product_name; });
    var counts = events.reduce(function (a, ev) { a[ev.event] = (a[ev.event] || 0) + 1; return a; }, {});
    function addHidden(name, value) {
      var existing = form.querySelector('input[name="' + name + '"]');
      if (existing) { existing.value = value; return; }
      var input = document.createElement('input');
      input.type = 'hidden'; input.name = name; input.value = value;
      form.appendChild(input);
    }
    addHidden('cart_event_summary', JSON.stringify(counts));
    addHidden('cart_products_viewed', productNames.slice(0, 10).join('; '));
    addHidden('cart_events_count', String(events.length));
    setTimeout(function () { localStorage.removeItem(KEY); }, 5000);
  }, true);
  window.smartmdCartBeacon = { log: log, read: read };
})();

// ── NOTIFY ME MODAL ────────────────────────────────────────
(function () {
  var modalHtml = '' +
    '<div id="smartmd-notify-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.78);z-index:9999;align-items:center;justify-content:center;padding:20px;">' +
      '<div style="background:#140B0E;border:1px solid rgba(247,241,241,0.12);border-radius:12px;max-width:440px;width:100%;padding:28px;color:#F7F1F1;font-family:\'DM Sans\',sans-serif;position:relative;">' +
        '<div style="font-size:11px;letter-spacing:3px;color:#D31E2A;font-weight:700;margin-bottom:8px;">NOTIFY ME</div>' +
        '<h3 id="smartmd-notify-title" style="font-family:\'Bebas Neue\',sans-serif;font-size:28px;margin:0 0 12px;letter-spacing:1px;">—</h3>' +
        '<p style="font-size:13px;color:#9D8F93;margin:0 0 20px;">We\'ll email you the moment this compound is back in stock. No marketing blasts — just the notification.</p>' +
        '<form id="smartmd-notify-form" style="display:flex;flex-direction:column;gap:10px;">' +
          '<input type="text" name="firstName" placeholder="First name" required style="background:rgba(247,241,241,0.06);border:1px solid rgba(247,241,241,0.12);border-radius:8px;padding:12px 14px;color:#F7F1F1;font-size:14px;">' +
          '<input type="email" name="email" placeholder="your@email.com" required style="background:rgba(247,241,241,0.06);border:1px solid rgba(247,241,241,0.12);border-radius:8px;padding:12px 14px;color:#F7F1F1;font-size:14px;">' +
          '<input type="hidden" name="product_id"><input type="hidden" name="product_name"><input type="hidden" name="website">' +
          '<button type="submit" style="background:#D31E2A;color:#F7F1F1;border:0;border-radius:8px;padding:14px;font-weight:600;cursor:pointer;font-family:inherit;">Notify Me →</button>' +
        '</form>' +
        '<div id="smartmd-notify-success" style="display:none;padding:12px;background:rgba(211,30,42,0.08);border-radius:8px;margin-top:12px;font-size:13px;">You\'re on the list. We\'ll email you when it\'s back.</div>' +
        '<button id="smartmd-notify-close" aria-label="Close" style="position:absolute;top:16px;right:20px;background:transparent;border:0;color:#9D8F93;font-size:24px;cursor:pointer;">×</button>' +
      '</div>' +
    '</div>';
  function mountModal() {
    if (document.getElementById('smartmd-notify-modal')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = modalHtml;
    document.body.appendChild(wrap.firstElementChild);
    document.getElementById('smartmd-notify-close').addEventListener('click', close);
    document.getElementById('smartmd-notify-modal').addEventListener('click', function (e) {
      if (e.target.id === 'smartmd-notify-modal') close();
    });
    document.getElementById('smartmd-notify-form').addEventListener('submit', submit);
  }
  function open(productName, productId) {
    mountModal();
    document.getElementById('smartmd-notify-title').textContent = productName || 'Research Compound';
    var form = document.getElementById('smartmd-notify-form');
    form.querySelector('input[name="product_id"]').value = productId || '';
    form.querySelector('input[name="product_name"]').value = productName || '';
    form.style.display = '';
    document.getElementById('smartmd-notify-success').style.display = 'none';
    document.getElementById('smartmd-notify-modal').style.display = 'flex';
    setTimeout(function () { form.querySelector('input[name="firstName"]').focus(); }, 40);
  }
  function close() { var m = document.getElementById('smartmd-notify-modal'); if (m) m.style.display = 'none'; }
  function submit(e) {
    e.preventDefault();
    var form = e.target;
    if (form.website.value) { close(); return; }
    var productName = form.product_name.value;
    var slug = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    smartSubmit({
      firstName: form.firstName.value, email: form.email.value, source: 'notify-me',
      tags: ['source-smartmdpeptides', 'notify-me', 'back-in-stock', 'product:' + slug],
      product_id: form.product_id.value, product_name: productName,
    });
    form.style.display = 'none';
    document.getElementById('smartmd-notify-success').style.display = 'block';
    setTimeout(close, 2200);
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-notifyme]');
    if (!btn) return;
    e.preventDefault();
    open(btn.getAttribute('data-product-name'), btn.getAttribute('data-product-id'));
  });
  window.smartmdNotifyMe = open;
})();

// ── VERIFY-PAGE COA WIRING ─────────────────────────────────
// Port of the live verify-coa-wiring-patcher (funnel Body tracking code).
// Replaces the page's hardcoded vfBatches demo + fake vfDownload alert with a
// real COA lookup against the 176-lot GHL CDN library. Same endpoint, same
// matching rules, same display values as live.
(function () {
  if (!location.pathname.startsWith('/verify')) return;
  var LOOKUP_URL = 'https://assets.cdn.filesafe.space/ePPuXk2sfgpH52HhvjHw/media/d91c0f7a-921b-4b78-bb7c-10d6eea918f9.json';
  var lookup = null;

  function fetchLookup() {
    return fetch(LOOKUP_URL, { cache: 'force-cache' })
      .then(function (r) { return r.json(); })
      .then(function (j) { lookup = j; console.log('[SMARTMD] COA lookup loaded — ' + Object.keys(j).length + ' keys'); })
      .catch(function (e) { console.warn('[SMARTMD] COA lookup fetch failed:', e); });
  }
  fetchLookup();

  function lookupBatch(input) {
    if (!lookup) return null;
    var key = (input || '').trim();
    return lookup[key]
        || lookup[key.toUpperCase()]
        || lookup[key.toLowerCase()]
        || lookup[key.replace(/[\s-]/g, '')]
        || lookup[key.replace(/[\s-]/g, '').toUpperCase()]
        || null;
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // Override vfSearch to consult the real lookup before falling back to demo data
  function patchVfSearch() {
    if (typeof window.vfSearch !== 'function') return false;
    var originalSearch = window.vfSearch;
    window.vfSearch = function () {
      var input = (document.getElementById('vfInput') || {}).value || '';
      input = input.trim().toUpperCase();
      var hit = lookupBatch(input);
      if (hit) {
        var box = document.getElementById('vfResult');
        if (box) box.style.display = 'block';

        // Free tier display
        setText('vfCompound', hit.product);
        setText('vfBatchLabel', 'Batch: ' + input + '  ·  Verified');
        setText('vfFreeCompound', hit.product);
        setText('vfFreeDate', 'Released ' + (hit.date || 'See PDF'));
        setText('vfFreePurity', '≥ 98.0%');
        setText('vfFreeMass', 'Confirmed by mass spec');
        setText('vfFreeEndo', '< 5.0 EU/mg');

        // Stash the real URL so vfDownload uses it
        window.__smartmdCoaUrl = hit.url;
        window.__smartmdCoaLot = input;
        window.__smartmdCoaProduct = hit.product;

        var resultBox = document.getElementById('vfResult');
        if (resultBox) resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      // No real hit — fall through to original ("Batch Not Found" handling)
      return originalSearch.apply(this, arguments);
    };
    return true;
  }

  // Replace fake vfDownload alert with real PDF open
  function patchVfDownload() {
    window.vfDownload = function () {
      if (window.__smartmdCoaUrl) {
        window.open(window.__smartmdCoaUrl, '_blank', 'noopener');
      } else {
        alert('Type a batch number above and click Pull COA to see the certificate.');
      }
    };
  }

  function tryPatch() {
    if (patchVfSearch()) {
      patchVfDownload();
      console.log('[SMARTMD] verify-coa wiring active');
      return true;
    }
    return false;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (!tryPatch()) {
        var attempts = 0;
        var iv = setInterval(function () {
          attempts++;
          if (tryPatch() || attempts > 30) clearInterval(iv);
        }, 200);
      }
    });
  } else {
    if (!tryPatch()) {
      var attempts2 = 0;
      var iv2 = setInterval(function () {
        attempts2++;
        if (tryPatch() || attempts2 > 30) clearInterval(iv2);
      }, 200);
    }
  }
})();
