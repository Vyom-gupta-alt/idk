/* OpenScore — single-page app. No build step, no backend.
 * Progress lives in localStorage (per browser). */
(function () {
  'use strict';

  /* ───────────── helpers ───────────── */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const LETTERS = 'ABCDE';
  const WEIGHT = { Easy: 1, Medium: 1.5, Hard: 2, Extreme: 2.5 };
  const todayKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const fmtTime = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const Q = window.QUESTIONS, V = window.VOCAB, L = window.LESSONS, G = window.Generator;
  const byId = Object.fromEntries(Q.map(q => [q.id, q]));

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  /* ───────────── storage ───────────── */
  const KEY = 'openscore:v1';
  const blank = () => ({ attempts: [], daily: {}, vocab: {}, mocks: [], lessons: {}, theme: null });
  const Store = {
    data: (() => {
      try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY)) || {}); }
      catch (e) { return blank(); }
    })(),
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* storage unavailable */ } },
    reset() { this.data = blank(); this.save(); }
  };

  function record(q, correct, source) {
    Store.data.attempts.push({
      id: q.id, test: q.test, section: q.section, domain: q.domain, skill: q.skill,
      difficulty: q.difficulty, correct: !!correct, source, t: Date.now()
    });
    if (Store.data.attempts.length > 5000) Store.data.attempts.splice(0, 1000);
    Store.save();
  }

  /* ───────────── answer checking ───────────── */
  function parseNum(s) {
    s = String(s).trim().replace(/[−–]/g, '-').replace(/,/g, '').replace(/^\$/, '');
    if (/^-?\d*\.?\d+\s*\/\s*-?\d*\.?\d+$/.test(s)) {
      const [a, b] = s.split('/').map(Number);
      return b ? a / b : NaN;
    }
    if (/^-?\d*\.?\d+$/.test(s)) return Number(s);
    return NaN;
  }
  function isCorrect(q, resp) {
    if (q.choices) return resp === q.answer;
    const v = parseNum(resp);
    if (Number.isNaN(v)) return false;
    return q.answer.some(a => Math.abs(parseNum(a) - v) < 1e-3);
  }
  const answerText = q => q.choices ? `${LETTERS[q.answer]}) ${q.choices[q.answer]}` : q.answer[0];

  /* ───────────── scoring ───────────── */
  function perf(list) {
    if (!list.length) return null;
    const acc = list.filter(a => a.correct).length / list.length;
    let w = 0, wc = 0;
    list.forEach(a => { const k = WEIGHT[a.difficulty] || 1; w += k; if (a.correct) wc += k; });
    const hard = list.filter(a => a.difficulty === 'Hard' || a.difficulty === 'Extreme');
    const hardAcc = hard.length ? hard.filter(a => a.correct).length / hard.length : acc * 0.6;
    // Blend overall accuracy, difficulty-weighted accuracy and hard-question accuracy.
    return Math.min(1, 0.35 * acc + 0.35 * (wc / w) + 0.3 * hardAcc);
  }
  const round10 = n => Math.round(n / 10) * 10;
  function predict() {
    const recent = Store.data.attempts.slice(-400);
    const sat = s => recent.filter(a => a.test === 'SAT' && a.section === s).slice(-80);
    const satMath = sat('Math'), satRW = sat('Reading & Writing');
    const pm = perf(satMath), pr = perf(satRW);
    const res = { satMath: null, satRW: null, sat: null, act: null, actParts: {} };
    if (satMath.length >= 5) res.satMath = round10(200 + 600 * pm);
    if (satRW.length >= 5) res.satRW = round10(200 + 600 * pr);
    if (res.satMath && res.satRW) res.sat = res.satMath + res.satRW;
    const actSecs = ['English', 'Math', 'Reading', 'Science'];
    const parts = [];
    actSecs.forEach(s => {
      const l = recent.filter(a => a.test === 'ACT' && a.section === s).slice(-60);
      if (l.length >= 3) { const v = Math.round(1 + 35 * perf(l)); res.actParts[s] = v; parts.push(v); }
    });
    if (parts.length) res.act = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
    return res;
  }
  function domainStats(test) {
    const out = {};
    Store.data.attempts.filter(a => a.test === test).forEach(a => {
      const k = a.domain; out[k] = out[k] || { n: 0, c: 0, section: a.section };
      out[k].n++; if (a.correct) out[k].c++;
    });
    return out;
  }
  function weakest(n = 3) {
    const rows = [];
    ['SAT', 'ACT'].forEach(t => Object.entries(domainStats(t)).forEach(([d, s]) => {
      if (s.n >= 2) rows.push({ test: t, domain: d, acc: s.c / s.n, n: s.n });
    }));
    return rows.sort((a, b) => a.acc - b.acc).slice(0, n);
  }

  /* ───────────── streak ───────────── */
  function streak() {
    let n = 0; const d = new Date();
    if (!Store.data.daily[todayKey(d)]) d.setDate(d.getDate() - 1); // today not done yet: count from yesterday
    while (Store.data.daily[todayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  const updateStreak = () => { $('#streakPill').textContent = '🔥 ' + streak(); };

  /* ───────────── environment ───────────── */
  // Inside a claude.ai artifact viewer, window.claude exists before page scripts run.
  const IN_CLAUDE = !!window.claude;
  let sampleFn = null; // Claude-backed tutor, when the viewer offers it
  if (IN_CLAUDE && typeof window.claude.use === 'function') {
    window.claude.use('sample').then(fn => { sampleFn = fn || null; document.dispatchEvent(new Event('ai-ready')); }).catch(() => {});
  }
  function copyText(text) {
    try {
      navigator.clipboard.writeText(text).then(() => toast('Copied'), () => toast('Copy failed. Select the text manually.'));
    } catch (e) { toast('Copy failed. Select the text manually.'); }
  }

  const AI_PREAMBLE = 'You are Atlas, the tutor on OpenScore, a free SAT and ACT prep site. You are warm, direct and exact. ' +
    'You specialize in Digital SAT Desmos shortcuts: graphing both sides, clicking intersections, sliders for unknown constants, and regressions with ~ (y_1 ~ m x_1 + b, y_1 ~ a x_1^2 + b x_1 + c, y_1 ~ a b^{x_1}). ' +
    'Keep answers under 180 words unless the student asks for more. Write plain text with short paragraphs or numbered steps; no markdown headings or tables; write math with Unicode (x², √, π, ≤). ' +
    'Never invent facts about official tests; if unsure, say so. Only help with test prep and studying.';
  function studentContext() {
    const p = predict(), w = weakest(3);
    return `Student data from this site: predicted SAT ${p.sat ?? 'unknown'} (Math ${p.satMath ?? '?'}, R&W ${p.satRW ?? '?'}); predicted ACT ${p.act ?? 'unknown'}; ` +
      `questions answered ${Store.data.attempts.length}; weakest domains: ${w.length ? w.map(x => `${x.domain} (${x.test}) ${Math.round(x.acc * 100)}%`).join(', ') : 'not enough data'}.`;
  }
  const aiErrorCopy = code => ({
    not_granted: 'Atlas AI needs your permission to run. You can still use the built-in commands.',
    rate_limited: 'Atlas is getting a lot of questions right now. Try again in a minute.',
    prompt_too_large: 'That message is too long for Atlas. Try a shorter one.',
    refused: 'Atlas can only help with SAT and ACT prep.',
    cancelled: 'Stopped.'
  }[code] || 'Atlas couldn\'t answer just now. Try again in a moment.');
  const renderAi = t => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

  /* ───────────── Desmos calculator drawer ───────────── */
  // Leave empty to embed desmos.com/calculator in an iframe (no key needed).
  // With a Desmos API key (https://www.desmos.com/api) the drawer uses the API and can pre-fill expressions.
  const DESMOS_KEY = '';
  let calc = null, calcMode = null;
  function toDesmos(line) {
    return line.replace(/₁/g, '_1').replace(/²/g, '^2').replace(/√\(([^)]*)\)/g, '\\sqrt{$1}')
      .replace(/·/g, '\\cdot ').replace(/−/g, '-').replace(/~/g, '\\sim ').replace(/\^\(([^)]*)\)/g, '^{$1}');
  }
  function plainForTyping(line) {
    return line.replace(/₁/g, '_1').replace(/²/g, '^2').replace(/√/g, 'sqrt').replace(/·/g, '*').replace(/−/g, '-');
  }
  function openCalc(lines) {
    const drawer = $('#calcDrawer'), host = $('#calculator'), strip = $('#calcExprs');
    drawer.classList.remove('hidden');
    $('#calcFab').setAttribute('aria-expanded', 'true');
    if (!calcMode) {
      if (IN_CLAUDE) {
        calcMode = 'link';
        host.innerHTML = '<div class="calc-fallback"><p>The calculator opens in its own tab here. Your expressions are listed above so you can copy them in.</p><a class="btn brand" href="https://www.desmos.com/calculator" target="_blank" rel="noopener">Open Desmos ↗</a></div>';
      } else if (DESMOS_KEY) {
        calcMode = 'api';
        const sc = document.createElement('script');
        sc.src = 'https://www.desmos.com/api/v1.10/calculator.js?apiKey=' + DESMOS_KEY;
        sc.onload = () => { calc = window.Desmos.GraphingCalculator(host, { expressionsCollapsed: false }); if (lines) openCalc(lines); };
        sc.onerror = () => { calcMode = 'failed'; calcFallback(); };
        document.head.appendChild(sc);
      } else {
        calcMode = 'iframe';
        host.innerHTML = '<iframe title="Desmos graphing calculator" src="https://www.desmos.com/calculator" loading="lazy"></iframe>';
      }
    }
    if (calcMode === 'api' && calc && lines) lines.forEach((l, i) => calc.setExpression({ id: 'q' + i, latex: toDesmos(l) }));
    if (lines && calcMode !== 'api') {
      strip.innerHTML = '<span class="small muted">Type these into Desmos:</span>' + lines.map(l =>
        `<button class="chip mono" data-copy="${esc(plainForTyping(l))}" title="Copy">${esc(l)} ⧉</button>`).join('');
      strip.hidden = false;
      $$('[data-copy]', strip).forEach(b => b.addEventListener('click', () => copyText(b.dataset.copy)));
    }
  }
  function calcFallback() {
    $('#calculator').innerHTML = '<div class="calc-fallback"><p>The embedded calculator couldn\'t load.</p><a class="btn brand" href="https://www.desmos.com/calculator" target="_blank" rel="noopener">Open Desmos in a new tab ↗</a></div>';
  }
  function closeCalc() {
    $('#calcDrawer').classList.add('hidden');
    $('#calcFab').setAttribute('aria-expanded', 'false');
  }

  /* ───────────── question component ───────────── */
  /* mode 'practice': check immediately with explanation.
   * mode 'exam': selection only; opts.onSelect(resp) receives the response. */
  function mountQuestion(el, q, opts = {}) {
    const mode = opts.mode || 'practice';
    let selected = opts.selected ?? null;
    let done = false;
    el.innerHTML = `
      <div class="q-meta">
        <span class="tag">${esc(q.test)} · ${esc(q.section)}</span>
        <span class="tag">${esc(q.domain)}</span>
        <span class="tag ${esc(q.difficulty)}">${esc(q.difficulty)}</span>
        ${q.generated ? '<span class="tag">Generated</span>' : ''}
        <span class="spacer"></span>
        <span class="small muted">${esc(q.skill)}</span>
      </div>
      ${q.passage ? `<div class="q-passage">${esc(q.passage)}</div>` : ''}
      <div class="q-prompt">${esc(q.prompt)}</div>
      ${q.choices ? `<div class="choices">${q.choices.map((c, i) => `
        <button class="choice" data-i="${i}"><span class="letter">${LETTERS[i]}</span><span>${esc(c)}</span></button>`).join('')}</div>`
      : `<div class="grid-in"><input type="text" inputmode="decimal" placeholder="Your answer (e.g. 12, -3, 3/5, 1.2)" aria-label="Your answer" value="${selected != null ? esc(selected) : ''}"></div>`}
      ${mode === 'practice' ? '<div class="player-nav"><button class="btn primary check">Check answer</button><button class="btn ghost reveal-hint">' + (q.desmos ? 'Desmos hint' : '') + '</button></div>' : ''}
      <div class="fb"></div>`;
    const hintBtn = $('.reveal-hint', el);
    if (hintBtn && !q.desmos) hintBtn.remove();

    const paintSel = () => $$('.choice', el).forEach(b => b.classList.toggle('selected', Number(b.dataset.i) === selected));
    paintSel();

    $$('.choice', el).forEach(b => b.addEventListener('click', () => {
      if (done) return;
      selected = Number(b.dataset.i); paintSel();
      if (opts.onSelect) opts.onSelect(selected);
    }));
    const input = $('.grid-in input', el);
    if (input) {
      input.addEventListener('input', () => { selected = input.value; if (opts.onSelect) opts.onSelect(selected); });
      input.addEventListener('keydown', e => { if (e.key === 'Enter' && mode === 'practice') check(); });
    }
    if (hintBtn) hintBtn.addEventListener('click', () => {
      $('.fb', el).insertAdjacentHTML('afterbegin', `<div class="desmos-tip"><b>Desmos approach:</b> ${esc(q.desmos)}</div>`);
      hintBtn.remove();
    });
    const checkBtn = $('.check', el);
    if (checkBtn) checkBtn.addEventListener('click', check);

    function check() {
      if (done) return;
      if (selected === null || selected === '') { toast('Pick or enter an answer first'); return; }
      done = true;
      const ok = isCorrect(q, selected);
      if (q.choices) {
        $$('.choice', el).forEach(b => {
          const i = Number(b.dataset.i); b.disabled = true;
          if (i === q.answer) b.classList.add('correct');
          else if (i === selected) b.classList.add('wrong');
        });
      } else input.disabled = true;
      $('.player-nav', el).remove();
      $('.fb', el).innerHTML = `
        <div class="feedback ${ok ? 'good' : 'bad'}">
          <h4>${ok ? '✓ Correct' : '✗ Not quite. Correct answer: ' + esc(answerText(q))}</h4>
          <div>${esc(q.explanation)}</div>
        </div>
        ${q.desmos ? `<div class="desmos-tip"><b>Desmos shortcut:</b> ${esc(q.desmos)}
          <div style="margin-top:8px"><button class="btn sm brand open-calc">Open Desmos</button></div></div>` : ''}`;
      const oc = $('.open-calc', el); if (oc) oc.addEventListener('click', () => openCalc());
      if (sampleFn) {
        const fb = $('.fb', el);
        fb.insertAdjacentHTML('beforeend', '<div class="row" style="margin-top:12px"><button class="btn sm ask-atlas">Ask Atlas to explain differently</button></div><div class="atlas-out"></div>');
        $('.ask-atlas', el).addEventListener('click', async ev => {
          const btn = ev.currentTarget, out = $('.atlas-out', el);
          btn.disabled = true; out.className = 'atlas-out msg bot'; out.textContent = 'Thinking…';
          const given = q.choices ? `${LETTERS[selected]}) ${q.choices[selected]}` : selected;
          const prompt = `${AI_PREAMBLE}\n\nA student answered this ${q.test} ${q.section} question.\n` +
            (q.passage ? `Passage:\n${q.passage}\n` : '') + `Question:\n${q.prompt}\n` +
            (q.choices ? 'Choices:\n' + q.choices.map((c, i) => `${LETTERS[i]}) ${c}`).join('\n') + '\n' : '') +
            `Student's answer: ${given}\nCorrect answer: ${answerText(q)}\nOfficial explanation: ${q.explanation}\n` +
            (q.desmos ? `Desmos approach: ${q.desmos}\n` : '') +
            `\nThe student was ${ok ? 'right but wants a deeper understanding' : 'wrong'}. ${ok ? '' : 'Explain the likely mistake behind their answer, then '}walk through the fastest reliable method step by step, including a Desmos shortcut if one applies. End with one short tip to remember.`;
          try {
            const { text } = await sampleFn(prompt, { onText: ({ text }) => { out.innerHTML = renderAi(text); }, cache: true });
            out.innerHTML = renderAi(text);
          } catch (e) { out.textContent = e && e.text ? e.text : aiErrorCopy(e && e.code); btn.disabled = false; }
        });
      }
      if (opts.onResult) opts.onResult(ok);
    }
  }

  /* ───────────── views ───────────── */
  const app = $('#app');
  const views = {};
  let cleanup = null;

  views.home = () => {
    const total = Q.length;
    app.innerHTML = `
      <section class="hero">
        <svg class="hero-graph" viewBox="0 0 460 300" aria-hidden="true">
          <line class="axis" x1="20" y1="250" x2="450" y2="250"></line><line class="axis" x1="60" y1="20" x2="60" y2="280"></line>
          <path class="curve" d="M60 214 Q 200 -40 380 250"></path>
          <circle class="pt" cx="60" cy="214" r="6"></circle><circle class="pt" cx="132.5" cy="121" r="6"></circle><circle class="pt" cx="292.5" cy="139" r="6"></circle>
          <text x="250" y="38">y₁ ~ a·x₁² + b·x₁ + c</text><text x="250" y="58">R² = 1</text>
        </svg>
        <div class="hero-inner">
          <div class="eyebrow">✓ Free: every feature, no account, no card</div>
          <h1>Score 1500+ on the SAT <mark>without paying a cent.</mark></h1>
          <p class="lead">Practice questions, Desmos regression shortcuts, adaptive mock exams, score predictions, vocab drills and an AI tutor. Other prep sites charge up to $88 a month for this.</p>
          <div class="row">
            <a class="btn primary lg" href="#daily">Answer today's question</a>
            <a class="btn lg" href="#mock">Take a mock exam</a>
          </div>
        </div>
      </section>

      <div class="grid cols-4 stats">
        <div class="card stat"><b>${total}</b><span>hand-written questions</span></div>
        <div class="card stat"><b>∞</b><span>generated math questions</span></div>
        <div class="card stat"><b>${V.length}</b><span>high-yield vocab words</span></div>
        <div class="card stat"><b>${L.length}</b><span>course modules</span></div>
      </div>

      <section class="section">
        <div class="section-title"><h2>Everything you need for 1500+ / 34+</h2><p>Built around the shortcuts top scorers actually use.</p></div>
        <div class="grid cols-3">
          ${[
            ['QB', 'Question Bank', 'SAT & ACT questions sorted by official domain and skill, from Easy to Extreme.', '#practice'],
            ['ƒ(x)', 'Desmos Solutions', 'Math questions include a Desmos regression or graphing shortcut, with the calculator built in.', '#learn'],
            ['∞', 'Infinite Math', 'Procedurally generated SAT math. You will never run out of practice problems.', '#infinite'],
            ['M1→M2', 'Adaptive Mock Exams', 'Timed modules that adapt like the Digital SAT, scored on the 400–1600 scale.', '#mock'],
            ['1600', 'Diagnostics', 'Accuracy by domain, predicted SAT and ACT scores, and your weakest areas.', '#progress'],
            ['Aa', 'Vocab Builder', 'Flashcards and quizzes for words that keep appearing on the test.', '#vocab'],
            ['1/day', 'Daily Question', 'A new question every day with streak tracking to keep you consistent.', '#daily'],
            ['AI', 'Atlas Tutor', 'Ask anything, get new practice questions written for you, and get explanations of your mistakes.', '#tutor'],
            ['§', 'Course Modules', 'Short, focused lessons on Desmos, SAT Reading & Writing, and ACT strategy.', '#learn']
          ].map(([i, t, d, h]) => `
            <div class="card feature"><h3><span class="ico">${i}</span>${t}</h3><p>${d}</p><a href="${h}">Open →</a></div>`).join('')}
        </div>
      </section>

      <section class="section">
        <div class="section-title"><h2>Pricing</h2><p>Every plan costs the same: nothing.</p></div>
        <div class="grid cols-4">
          ${[
            ['Free', '', 'Get started', ['Official-style SAT practice', 'Daily questions & streaks']],
            ['Plus', '$19', 'Self-study', ['Full SAT & ACT question bank', 'Vocab builder', 'Desmos solutions', 'Mock exams & diagnostics']],
            ['Premium', '$44', 'Study smarter', ['Everything in Plus', 'All mock exams', 'Full course modules', 'Atlas AI tutor']],
            ['Max', '$88', 'All-inclusive', ['Everything in Premium', 'Advanced Desmos regression modules', 'Infinite generated practice', 'AI-written questions & explanations', 'Personalized study plan']]
          ].map(([n, was, sub, items], i) => `
            <div class="card price-card ${i === 3 ? 'featured' : ''}">
              ${i === 3 ? '<span class="ribbon">Everything</span>' : ''}
              <h3>${n}</h3><div class="muted small">${sub}</div>
              <div class="price">${was ? `<s>${was}/mo</s>` : ''}$0</div>
              <ul>${items.map(x => `<li>${x}</li>`).join('')}</ul>
              <a class="btn ${i === 3 ? 'primary' : ''}" href="#practice">Start free</a>
            </div>`).join('')}
        </div>
        <p class="center muted small" style="margin-top:16px">No accounts, no trials, no upsells. Progress is saved in your browser.</p>
      </section>`;
  };

  /* Practice / question bank */
  views.practice = () => {
    const tests = ['SAT', 'ACT'];
    const uniq = (arr) => [...new Set(arr)];
    app.innerHTML = `
      <div class="page-head"><h1>Question Bank</h1>
        <p>Filter by test, section, domain and difficulty. Every answer comes with an explanation, and math questions include a Desmos shortcut where one helps.</p></div>
      <div class="card">
        <div class="filters">
          <label class="field">Test<select id="fTest"><option value="">All</option>${tests.map(t => `<option>${t}</option>`).join('')}</select></label>
          <label class="field">Section<select id="fSection"></select></label>
          <label class="field">Domain<select id="fDomain"></select></label>
          <label class="field">Difficulty<select id="fDiff"><option value="">All</option>${Object.keys(WEIGHT).map(d => `<option>${d}</option>`).join('')}</select></label>
          <button class="btn primary" id="startBtn">Start</button>
        </div>
        <label class="row small muted" style="margin-top:12px"><input type="checkbox" id="fUnseen"> Only questions I haven't answered correctly</label>
        <p class="small muted" id="countLine" style="margin:10px 0 0"></p>
      </div>
      <div id="session" style="margin-top:20px"></div>`;

    const f = { test: $('#fTest'), section: $('#fSection'), domain: $('#fDomain'), diff: $('#fDiff'), unseen: $('#fUnseen') };
    const solved = () => new Set(Store.data.attempts.filter(a => a.correct).map(a => a.id));
    const pool = () => {
      const s = f.unseen.checked ? solved() : null;
      return Q.filter(q => (!f.test.value || q.test === f.test.value) && (!f.section.value || q.section === f.section.value)
        && (!f.domain.value || q.domain === f.domain.value) && (!f.diff.value || q.difficulty === f.diff.value)
        && (!s || !s.has(q.id)));
    };
    const fill = (sel, vals) => { const cur = sel.value; sel.innerHTML = '<option value="">All</option>' + vals.map(v => `<option>${esc(v)}</option>`).join(''); if (vals.includes(cur)) sel.value = cur; };
    const refresh = () => {
      fill(f.section, uniq(Q.filter(q => !f.test.value || q.test === f.test.value).map(q => q.section)));
      fill(f.domain, uniq(Q.filter(q => (!f.test.value || q.test === f.test.value) && (!f.section.value || q.section === f.section.value)).map(q => q.domain)));
      $('#countLine').textContent = pool().length + ' questions match.';
    };
    Object.values(f).forEach(s => s.addEventListener('change', refresh));
    refresh();
    $('#startBtn').addEventListener('click', () => {
      const p = shuffle(pool());
      if (!p.length) { toast('No questions match those filters'); return; }
      runSession($('#session'), p, 'bank');
      $('#session').scrollIntoView({ behavior: 'smooth' });
    });
  };

  function runSession(el, list, source, getNext) {
    let i = 0, right = 0, answered = 0;
    const show = () => {
      const q = list[i] || (getNext && (list[i] = getNext()));
      if (!q) {
        el.innerHTML = `<div class="card center"><h2>Session complete</h2>
          <p class="score-big">${right}/${answered}</p><p class="muted">correct</p>
          <div class="row" style="justify-content:center"><a class="btn primary" href="#progress">View diagnostics</a><button class="btn" id="again">Practice again</button></div></div>`;
        $('#again', el).addEventListener('click', () => { i = 0; right = 0; answered = 0; list = shuffle(list); show(); });
        return;
      }
      el.innerHTML = `
        ${getNext ? '' : `<div class="progress-line"><div style="width:${(i / list.length) * 100}%"></div></div>`}
        <div class="row small muted" style="margin-bottom:8px"><span>Question ${i + 1}${getNext ? '' : ' of ' + list.length}</span><span class="spacer"></span><span>Session: ${right}/${answered} correct</span></div>
        <div class="card"><div class="qhost"></div>
          <div class="player-nav"><span class="spacer"></span><button class="btn next">${getNext || i < list.length - 1 ? 'Next →' : 'Finish'}</button></div></div>`;
      mountQuestion($('.qhost', el), q, {
        onResult: ok => { answered++; if (ok) right++; record(q, ok, source); }
      });
      $('.next', el).addEventListener('click', () => { i++; show(); window.scrollTo({ top: el.offsetTop - 80, behavior: 'smooth' }); });
    };
    show();
  }

  /* Infinite generated math */
  let presetDomain = null;
  views.infinite = () => {
    app.innerHTML = `
      <div class="page-head"><h1>Infinite Math</h1>
        <p>SAT-style math questions generated on the fly with new numbers every time. Each one comes with a worked solution and a Desmos shortcut. Pick a domain to target a weak spot.</p></div>
      <div class="card"><div class="filters" style="grid-template-columns:repeat(2,minmax(0,1fr)) auto">
        <label class="field">Domain<select id="gDomain"><option value="">Mixed</option>${G.domains.map(d => `<option>${d}</option>`).join('')}</select></label>
        <label class="field">Difficulty<select id="gDiff"><option value="">Mixed</option>${Object.keys(WEIGHT).map(d => `<option>${d}</option>`).join('')}</select></label>
        <button class="btn primary" id="gStart">Generate</button>
      </div></div>
      <div id="gSession" style="margin-top:20px"></div>`;
    if (presetDomain) { $('#gDomain').value = presetDomain; presetDomain = null; }
    $('#gStart').addEventListener('click', () => {
      const d = $('#gDomain').value, df = $('#gDiff').value;
      runSession($('#gSession'), [], 'generated', () => G.generate(d, df));
    });
    $('#gStart').click();
  };

  /* Daily question */
  function dailyQuestion(key = todayKey()) {
    let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return Q[h % Q.length];
  }
  views.daily = () => {
    const key = todayKey(), q = dailyQuestion(key), done = Store.data.daily[key];
    const days = [];
    for (let k = 13; k >= 0; k--) { const d = new Date(); d.setDate(d.getDate() - k); days.push(todayKey(d)); }
    app.innerHTML = `
      <div class="page-head"><h1>Daily Question</h1>
        <p>One question a day. Answer it (right or wrong) to keep your streak going.</p></div>
      <div class="grid cols-3" style="margin-bottom:16px">
        <div class="card stat"><b>🔥 ${streak()}</b><span>day streak</span></div>
        <div class="card stat"><b>${Object.keys(Store.data.daily).length}</b><span>daily questions completed</span></div>
        <div class="card"><div class="small muted" style="margin-bottom:8px">Last 14 days</div>
          <div class="row" style="gap:5px">${days.map(d => `<span title="${d}" style="width:16px;height:16px;border-radius:4px;background:${Store.data.daily[d] ? 'var(--accent)' : 'var(--surface-2)'};border:1px solid var(--border)"></span>`).join('')}</div></div>
      </div>
      <div class="card"><div class="small muted" style="margin-bottom:10px">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${done ? ' · ✓ completed' : ''}</div><div id="dq"></div></div>`;
    mountQuestion($('#dq'), q, {
      onResult: ok => {
        record(q, ok, 'daily');
        if (!Store.data.daily[key]) { Store.data.daily[key] = ok ? 'correct' : 'attempted'; Store.save(); updateStreak(); toast('Streak: ' + streak() + ' 🔥'); }
      }
    });
  };

  /* Mock exams */
  const MOCKS = {
    'sat-math': {
      title: 'SAT Math: Adaptive Mini-Mock', test: 'SAT', section: 'Math', desc: '2 adaptive modules × 11 questions · 35 min', perQ: 95, scale: 'sat',
      build(mod, route) {
        const bank = Q.filter(q => q.test === 'SAT' && q.section === 'Math');
        const tier = mod === 1 ? ['Easy', 'Medium', 'Hard'] : route === 'hard' ? ['Hard', 'Extreme', 'Medium'] : ['Easy', 'Medium'];
        const fromBank = shuffle(bank.filter(q => tier.includes(q.difficulty))).slice(0, 6);
        const gens = [];
        while (fromBank.length + gens.length < 11) gens.push(G.generate(null, tier[gens.length % tier.length]));
        return shuffle(fromBank.concat(gens));
      }
    },
    'sat-rw': {
      title: 'SAT Reading & Writing: Adaptive Mini-Mock', test: 'SAT', section: 'Reading & Writing', desc: '2 adaptive modules × 10 questions · 24 min', perQ: 71, scale: 'sat',
      build(mod, route) {
        const bank = Q.filter(q => q.test === 'SAT' && q.section === 'Reading & Writing');
        const isHard = q => q.difficulty === 'Hard' || q.difficulty === 'Extreme';
        if (mod === 1) {
          const m1 = shuffle(bank.filter(q => !isHard(q))).slice(0, 7).concat(shuffle(bank.filter(isHard)).slice(0, 3));
          this._used = new Set(m1.map(q => q.id));
          return shuffle(m1);
        }
        const rest = bank.filter(q => !this._used.has(q.id));
        const first = route === 'hard' ? rest.filter(isHard) : rest.filter(q => !isHard(q));
        const pickd = shuffle(first).slice(0, 10);
        return shuffle(pickd.concat(shuffle(rest.filter(q => !pickd.includes(q))).slice(0, 10 - pickd.length)));
      }
    },
    'act-mixed': {
      title: 'ACT Mixed-Section Mini-Mock', test: 'ACT', section: 'Mixed', desc: '28 questions across English, Math, Reading and Science · 24 min', perQ: 50, scale: 'act',
      build() {
        const take = (sec, n) => shuffle(Q.filter(q => q.test === 'ACT' && q.section === sec)).slice(0, n);
        return take('English', 8).concat(take('Math', 10), take('Reading', 4), take('Science', 6));
      }, modules: 1
    }
  };

  views.mock = () => {
    const hist = Store.data.mocks.slice(-8).reverse();
    app.innerHTML = `
      <div class="page-head"><h1>Mock Exams</h1>
        <p>Timed and scored. The SAT math mock adapts like the real Digital SAT: how you do on Module 1 decides whether Module 2 is harder or easier, and the harder route has a higher score ceiling.</p></div>
      <div class="grid cols-3">
        ${Object.entries(MOCKS).map(([k, m]) => `
          <div class="card"><span class="tag">${m.test}</span><h3 style="margin-top:10px">${m.title}</h3><p class="muted small">${m.desc}</p>
            <button class="btn primary" data-mock="${k}">Start exam</button></div>`).join('')}
      </div>
      <h2 style="margin-top:40px">Past results</h2>
      ${hist.length ? `<div class="card">${hist.map(r => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--border)">
          <b>${esc(r.title)}</b><span class="spacer"></span><span class="muted small">${new Date(r.t).toLocaleDateString()}</span>
          <span class="tag">${r.correct}/${r.total}</span><b>${r.score}</b></div>`).join('')}</div>`
        : '<p class="muted">No mock exams taken yet.</p>'}`;
    $$('[data-mock]').forEach(b => b.addEventListener('click', () => runMock(b.dataset.mock)));
  };

  function runMock(key) {
    const m = MOCKS[key];
    const totalMods = m.modules || 2;
    const results = [];
    let route = null;

    const startModule = (mod) => {
      const qs = m.build(mod, route);
      const resp = new Array(qs.length).fill(null);
      const flags = new Set();
      let i = 0, left = qs.length * m.perQ;
      const timer = setInterval(() => {
        left--; const t = $('#timer');
        if (t) { t.textContent = fmtTime(left); t.classList.toggle('low', left < 60); }
        if (left <= 0) finish();
      }, 1000);
      cleanup = () => clearInterval(timer);

      const render = () => {
        app.innerHTML = `
          <div class="exam-bar">
            <b>${esc(m.title)}</b><span class="tag">Module ${mod} of ${totalMods}${mod === 2 && route ? ' · ' + route + ' route' : ''}</span>
            <span class="spacer"></span>
            <span class="timer" id="timer">${fmtTime(left)}</span>
            <button class="btn sm" id="flagBtn">${flags.has(i) ? '★ Flagged' : '☆ Flag'}</button>
          </div>
          <div class="card"><div class="small muted" style="margin-bottom:8px">Question ${i + 1} of ${qs.length}</div><div id="eq"></div>
            <div class="player-nav"><button class="btn" id="prevBtn" ${i === 0 ? 'disabled' : ''}>← Back</button><span class="spacer"></span>
              ${i < qs.length - 1 ? '<button class="btn primary" id="nextBtn">Next →</button>' : '<button class="btn primary" id="submitBtn">Submit module</button>'}</div>
            <div class="q-grid">${qs.map((_, j) => `<button data-j="${j}" class="${resp[j] !== null && resp[j] !== '' ? 'answered' : ''} ${j === i ? 'current' : ''} ${flags.has(j) ? 'flagged' : ''}">${j + 1}</button>`).join('')}</div>
          </div>`;
        mountQuestion($('#eq'), qs[i], { mode: 'exam', selected: resp[i], onSelect: v => { resp[i] = v; const b = $(`.q-grid [data-j="${i}"]`); if (b) b.classList.toggle('answered', v !== null && v !== ''); } });
        $('#flagBtn').addEventListener('click', () => { flags.has(i) ? flags.delete(i) : flags.add(i); render(); });
        $('#prevBtn').addEventListener('click', () => { i--; render(); });
        const nb = $('#nextBtn'); if (nb) nb.addEventListener('click', () => { i++; render(); });
        const sb = $('#submitBtn'); if (sb) sb.addEventListener('click', () => {
          const blank = resp.filter(r => r === null || r === '').length;
          if (!blank || sb.dataset.armed) return finish();
          sb.dataset.armed = '1';
          sb.textContent = `${blank} unanswered. Submit anyway?`;
        });
        $$('.q-grid button').forEach(b => b.addEventListener('click', () => { i = Number(b.dataset.j); render(); }));
      };

      let finished = false;
      function finish() {
        if (finished) return; finished = true;
        clearInterval(timer); cleanup = null;
        qs.forEach((q, j) => {
          const ok = resp[j] !== null && resp[j] !== '' && isCorrect(q, resp[j]);
          results.push({ q, resp: resp[j], ok, mod });
          record(q, ok, 'mock');
        });
        if (mod === 1 && totalMods > 1) {
          const acc = results.filter(r => r.ok).length / results.length;
          route = acc >= 0.64 ? 'hard' : 'standard';
          app.innerHTML = `<div class="card center"><h2>Module 1 complete</h2>
            <p class="muted">Module 2 will be the <b>${route}</b> route.</p>
            <button class="btn primary lg" id="m2">Start Module 2</button></div>`;
          $('#m2').addEventListener('click', () => startModule(2));
        } else showResults();
      }
      render();
    };

    const showResults = () => {
      const correct = results.filter(r => r.ok).length;
      let w = 0, wc = 0;
      results.forEach(r => { const k = WEIGHT[r.q.difficulty] || 1; w += k; if (r.ok) wc += k; });
      const ratio = wc / w;
      let score, label;
      if (m.scale === 'sat') {
        const ceiling = route === 'standard' ? 650 : 800;
        score = round10(200 + (ceiling - 200) * ratio);
        label = `${m.section} section score (200–800)`;
      } else {
        score = Math.max(1, Math.round(1 + 35 * ratio));
        label = 'Estimated ACT composite (1–36)';
      }
      Store.data.mocks.push({ key, title: m.title, score, correct, total: results.length, t: Date.now() });
      Store.save();
      app.innerHTML = `
        <div class="card center"><div class="muted">${esc(m.title)}</div>
          <div class="score-big" style="margin:12px 0">${score}</div><div class="muted">${label}</div>
          <p style="margin-top:12px">${correct} of ${results.length} correct${route ? ' · Module 2: ' + route + ' route' : ''}</p>
          ${m.scale === 'sat' ? '<p class="small muted">Tip: pair this with the other SAT section for a full 400–1600 estimate on the Progress page.</p>' : ''}
          <div class="row" style="justify-content:center"><a class="btn primary" href="#progress">View diagnostics</a><a class="btn" href="#mock">Back to exams</a></div>
        </div>
        <h2 style="margin-top:32px">Review</h2>
        <div class="grid" id="review"></div>`;
      results.forEach((r, j) => {
        const d = document.createElement('div');
        d.className = 'card';
        d.innerHTML = `<div class="row" style="margin-bottom:8px"><b>Q${j + 1}</b><span class="tag">Module ${r.mod}</span>
          <span class="tag ${r.ok ? 'Easy' : 'Extreme'}">${r.ok ? 'Correct' : r.resp === null || r.resp === '' ? 'Skipped' : 'Incorrect'}</span></div>
          <div class="q-prompt">${esc(r.q.prompt)}</div>
          <div class="small"><b>Your answer:</b> ${r.resp === null || r.resp === '' ? '—' : esc(r.q.choices ? LETTERS[r.resp] + ') ' + r.q.choices[r.resp] : r.resp)} · <b>Correct:</b> ${esc(answerText(r.q))}</div>
          <details style="margin-top:8px"><summary>Explanation</summary><p style="margin-top:8px">${esc(r.q.explanation)}</p>${r.q.desmos ? `<div class="desmos-tip"><b>Desmos:</b> ${esc(r.q.desmos)}</div>` : ''}</details>`;
        $('#review').appendChild(d);
      });
    };

    startModule(1);
  }

  /* Vocab */
  views.vocab = () => {
    let filter = 'all', deck = [], idx = 0, mode = 'cards';
    const status = w => Store.data.vocab[w] || 'new';
    const build = () => { deck = shuffle(V.filter(v => filter === 'all' || status(v.w) === filter)); idx = 0; };
    build();
    const known = () => V.filter(v => status(v.w) === 'known').length;

    const render = () => {
      app.innerHTML = `
        <div class="page-head"><h1>Vocab Builder</h1><p>${V.length} high-yield words for words in context questions. Mark what you know. We'll keep drilling the rest.</p></div>
        <div class="meter" style="max-width:560px;margin:0 auto 20px"><div class="meter-top"><span>Mastered</span><b>${known()} / ${V.length}</b></div>
          <div class="meter-track"><div class="meter-fill high" style="width:${known() / V.length * 100}%"></div></div></div>
        <div class="row" style="justify-content:center;margin-bottom:20px">
          <button class="btn sm ${mode === 'cards' ? 'brand' : ''}" data-mode="cards">Flashcards</button>
          <button class="btn sm ${mode === 'quiz' ? 'brand' : ''}" data-mode="quiz">Quiz</button>
          <select id="vf" style="width:auto"><option value="all">All words</option><option value="new">New</option><option value="learning">Still learning</option><option value="known">Known</option></select>
        </div>
        <div id="vbody"></div>`;
      $('#vf').value = filter;
      $('#vf').addEventListener('change', e => { filter = e.target.value; build(); render(); });
      $$('[data-mode]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.mode; render(); }));
      mode === 'cards' ? cards() : quiz();
    };

    const cards = () => {
      const body = $('#vbody');
      if (!deck.length) { body.innerHTML = '<p class="center muted">No words in this filter.</p>'; return; }
      const v = deck[idx % deck.length];
      body.innerHTML = `
        <div class="flash-wrap"><div class="flash" id="flash" tabindex="0" role="button" aria-label="Flip card">
          <div class="flash-face"><div class="flash-word">${esc(v.w)}</div><div class="muted">${esc(v.pos)}</div><div class="small muted" style="margin-top:18px">Click or press Space to flip</div></div>
          <div class="flash-face back"><div style="font-size:1.2rem;font-weight:600">${esc(v.d)}</div><p class="muted" style="margin-top:14px;font-style:italic">"${esc(v.ex)}"</p></div>
        </div></div>
        <div class="row" style="justify-content:center;margin-top:20px">
          <button class="btn" id="vl">Still learning</button>
          <span class="muted small">${idx % deck.length + 1} / ${deck.length} · <span class="tag">${status(v.w)}</span></span>
          <button class="btn primary" id="vk">I know it ✓</button>
        </div>`;
      const flash = $('#flash');
      const flip = () => flash.classList.toggle('flipped');
      flash.addEventListener('click', flip);
      flash.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
      const mark = s => { Store.data.vocab[v.w] = s; Store.save(); idx++; render(); };
      $('#vl').addEventListener('click', () => mark('learning'));
      $('#vk').addEventListener('click', () => mark('known'));
    };

    const quiz = () => {
      const body = $('#vbody');
      const pool = deck.length >= 4 ? deck : V;
      const v = pool[Math.floor(Math.random() * pool.length)];
      const opts = shuffle([v].concat(shuffle(V.filter(x => x.w !== v.w)).slice(0, 3)));
      body.innerHTML = `<div class="card" style="max-width:640px;margin:0 auto">
        <div class="small muted">Choose the best definition</div><h2 style="margin:8px 0 16px">${esc(v.w)} <span class="muted small">${esc(v.pos)}</span></h2>
        <div class="choices">${opts.map((o, i) => `<button class="choice" data-w="${esc(o.w)}"><span class="letter">${LETTERS[i]}</span><span>${esc(o.d)}</span></button>`).join('')}</div>
        <div id="vq"></div></div>`;
      $$('.choice', body).forEach(b => b.addEventListener('click', () => {
        const ok = b.dataset.w === v.w;
        $$('.choice', body).forEach(x => { x.disabled = true; if (x.dataset.w === v.w) x.classList.add('correct'); });
        if (!ok) b.classList.add('wrong');
        Store.data.vocab[v.w] = ok ? 'known' : 'learning';
        Store.save();
        $('#vq').innerHTML = `<p class="muted" style="margin-top:14px;font-style:italic">"${esc(v.ex)}"</p><button class="btn primary" id="vn">Next word →</button>`;
        $('#vn').addEventListener('click', quiz);
      }));
    };
    render();
  };

  /* Course */
  views.learn = (id) => {
    if (id) {
      const l = L.find(x => x.id === id);
      if (!l) { location.hash = '#learn'; return; }
      const idx = L.indexOf(l), next = L[idx + 1];
      app.innerHTML = `
        <a href="#learn" class="small">← All modules</a>
        <div class="page-head" style="margin-top:12px"><span class="tag">${esc(l.track)}</span><h1 style="margin-top:10px">${esc(l.title)}</h1><p>${esc(l.summary)} · ${l.mins} min</p></div>
        <div class="card lesson-body">
          ${l.body.map(b => b.t === 'p' ? `<p>${esc(b.v)}</p>`
            : b.t === 'steps' ? `<ol>${b.v.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`
            : b.t === 'code' ? `<pre class="code">${esc(b.v)}</pre><button class="btn sm brand try-desmos" data-code="${esc(b.v)}">Try it in Desmos</button>`
            : b.t === 'tip' ? `<div class="tipbox"><b>Pro tip:</b> ${esc(b.v)}</div>` : '').join('')}
        </div>
        <div class="row" style="margin-top:20px">
          <button class="btn ${Store.data.lessons[l.id] ? '' : 'primary'}" id="doneBtn">${Store.data.lessons[l.id] ? '✓ Completed' : 'Mark complete'}</button>
          <span class="spacer"></span>
          ${next ? `<a class="btn" href="#learn.${next.id}">Next: ${esc(next.title)} →</a>` : ''}
        </div>`;
      $('#doneBtn').addEventListener('click', () => { Store.data.lessons[l.id] = true; Store.save(); toast('Module completed'); views.learn(id); });
      $$('.try-desmos').forEach(b => b.addEventListener('click', () => {
        openCalc(b.dataset.code.split('\n'));
      }));
      return;
    }
    const tracks = [...new Set(L.map(l => l.track))];
    const done = L.filter(l => Store.data.lessons[l.id]).length;
    app.innerHTML = `
      <div class="page-head"><h1>Course</h1><p>Short modules on the strategies behind a top score, starting with the Desmos techniques most tutoring programs don't teach.</p></div>
      <div class="meter" style="max-width:480px"><div class="meter-top"><span>Course progress</span><b>${done} / ${L.length}</b></div>
        <div class="meter-track"><div class="meter-fill high" style="width:${done / L.length * 100}%"></div></div></div>
      ${tracks.map(t => `<h2 class="track-title">${esc(t)}</h2><div class="grid cols-3">${L.filter(l => l.track === t).map(l => `
        <a class="card lesson-card" href="#learn.${l.id}"><div class="row"><span class="small muted">${l.mins} min</span><span class="spacer"></span>${Store.data.lessons[l.id] ? '<span class="done-badge">✓ Done</span>' : ''}</div>
          <h3 style="margin-top:8px">${esc(l.title)}</h3><p class="muted small" style="margin:0">${esc(l.summary)}</p></a>`).join('')}</div>`).join('')}`;
  };

  /* Progress / diagnostics */
  views.progress = () => {
    const p = predict();
    const at = Store.data.attempts;
    const acc = at.length ? Math.round(at.filter(a => a.correct).length / at.length * 100) : 0;
    const meter = (label, s) => {
      const pct = Math.round(s.c / s.n * 100);
      return `<div class="meter"><div class="meter-top"><span>${esc(label)}</span><span><b>${pct}%</b> <span class="muted small">(${s.c}/${s.n})</span></span></div>
        <div class="meter-track"><div class="meter-fill ${pct < 50 ? 'low' : pct < 75 ? 'mid' : 'high'}" style="width:${pct}%"></div></div></div>`;
    };
    const block = t => {
      const ds = domainStats(t), keys = Object.keys(ds);
      return keys.length ? keys.sort().map(k => meter(k, ds[k])).join('') : '<p class="muted small">No questions answered yet.</p>';
    };
    const weak = weakest(3);
    app.innerHTML = `
      <div class="page-head"><h1>Progress & Diagnostics</h1><p>Score predictions weight accuracy by difficulty and update as you practice. Answer at least 5 questions in a section to unlock its estimate.</p></div>
      <div class="grid cols-4">
        <div class="card stat"><b>${p.sat ?? '—'}</b><span>Predicted SAT (400–1600)</span></div>
        <div class="card stat"><b>${p.act ?? '—'}</b><span>Predicted ACT (1–36)</span></div>
        <div class="card stat"><b>${at.length}</b><span>questions answered</span></div>
        <div class="card stat"><b>${acc}%</b><span>overall accuracy</span></div>
      </div>
      <div class="grid cols-2" style="margin-top:16px">
        <div class="card"><h3>SAT sections</h3>
          <div class="row"><span>Math</span><span class="spacer"></span><b>${p.satMath ?? 'answer 5+ questions'}</b></div>
          <div class="row"><span>Reading & Writing</span><span class="spacer"></span><b>${p.satRW ?? 'answer 5+ questions'}</b></div>
          <h3 style="margin-top:20px">SAT domains</h3>${block('SAT')}</div>
        <div class="card"><h3>ACT sections</h3>
          ${['English', 'Math', 'Reading', 'Science'].map(s => `<div class="row"><span>${s}</span><span class="spacer"></span><b>${p.actParts[s] ?? '—'}</b></div>`).join('')}
          <h3 style="margin-top:20px">ACT domains</h3>${block('ACT')}</div>
      </div>
      <div class="card" style="margin-top:16px"><h3>Your study path</h3>
        ${weak.length ? `<p class="muted">Focus on your weakest domains first:</p><ol>${weak.map(w => `<li><b>${esc(w.domain)}</b> (${w.test}): ${Math.round(w.acc * 100)}% over ${w.n} questions.
          ${G.domains.includes(w.domain) && w.test === 'SAT' ? ` <a href="#infinite" data-domain="${esc(w.domain)}">Drill with Infinite Math →</a>` : ' <a href="#practice">Practice in the bank →</a>'}</li>`).join('')}</ol>`
          : '<p class="muted">Answer a few questions and we will build a study path from your weakest domains.</p>'}
      </div>
      <div class="row" style="margin-top:24px"><span class="spacer"></span><button class="btn sm" id="exportBtn">Export progress</button><button class="btn sm" id="resetBtn">Reset all progress</button></div>`;
    $$('[data-domain]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault(); presetDomain = a.dataset.domain; location.hash = '#infinite';
    }));
    $('#resetBtn').addEventListener('click', e => {
      const b = e.currentTarget;
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Click again to erase everything'; b.classList.add('danger'); return; }
      Store.reset(); updateStreak(); views.progress(); toast('Progress erased');
    });
    $('#exportBtn').addEventListener('click', () => {
      if (IN_CLAUDE) { copyText(JSON.stringify(Store.data)); return; }
      const blob = new Blob([JSON.stringify(Store.data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'openscore-progress.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  };

  /* Atlas tutor: an offline, rule-based study assistant. */
  views.tutor = () => {
    let pending = null, busy = false, ctl = null;
    const history = []; // plain-text turns for the AI
    app.innerHTML = `
      <div class="page-head"><h1>Atlas Tutor</h1><p id="atlasSub">Ask for Desmos strategies, request practice on any topic, look up a word, or ask what to study next.</p></div>
      <div class="card chat">
        <div class="chat-top"><span class="ai-pill" id="aiPill">Built-in mode</span><span class="spacer"></span><button class="btn sm ghost" id="stopBtn" hidden>Stop</button></div>
        <div class="chat-log" id="log" aria-live="polite"></div>
        <div class="chips">${['Give me a hard quadratic question', 'Quiz me on a grammar question', 'How do I do quadratic regression?', 'What should I study?', 'Define "mitigate"', 'Predict my score'].map(c => `<button class="chip" type="button">${c}</button>`).join('')}</div>
        <form class="chat-form" id="chatForm"><input type="text" id="chatIn" placeholder="Ask Atlas anything…" autocomplete="off" aria-label="Message"><button class="btn primary">Send</button></form>
      </div>`;
    const log = $('#log');
    const say = (who, html) => { const m = document.createElement('div'); m.className = 'msg ' + who; m.innerHTML = html; log.appendChild(m); log.scrollTop = log.scrollHeight; return m; };
    const paintMode = () => {
      const pill = $('#aiPill'); if (!pill) return;
      pill.textContent = sampleFn ? 'AI mode · powered by Claude' : 'Built-in mode';
      pill.classList.toggle('on', !!sampleFn);
    };
    paintMode();
    document.addEventListener('ai-ready', paintMode, { once: true });
    say('bot', 'Hi, I\'m Atlas. I can:\n• explain Desmos regression tricks\n• quiz you on any topic ("give me a circle question", "quiz me on transitions")\n• check your answers and give hints\n• define vocab words\n• build a study plan from your results' +
      (IN_CLAUDE ? '\n\nWhen AI mode is on, you can also ask me anything about the SAT or ACT in your own words.' : ''));

    const topicMap = [
      [/quadratic regression|3 points|three points|parabola.*points/, 'd3'], [/linear regression|regress|line of best|best fit/, 'd2'],
      [/exponential regression/, 'd4'], [/slider|no solution|infinite(ly)? many|constant k|value of k/, 'd5'],
      [/equivalent|transform/, 'd6'], [/mean|median|stdev|standard deviation|statistic/, 'd7'], [/circle|inequalit/, 'd8'],
      [/backsolv|answer choices|plug in/, 'd9'], [/desmos|calculator|graph/, 'd1'], [/comma|semicolon|colon|boundar|splice/, 'r1'], [/transition/, 'r2'],
      [/words? in context|vocab strategy/, 'r3'], [/notes|synthesis/, 'r4'], [/evidence|quotation/, 'r5'], [/cross.?text|text 1|text 2/, 'r6'],
      [/act english|omit|wordy|redundan/, 'a1'], [/act science|science/, 'a2'], [/act reading|passage/, 'a4'], [/pacing|time|act math/, 'a3']
    ];
    const genMap = [
      [/quadratic regression|parabola|3 points/, ['Advanced Math', 'Extreme']], [/vertex|minimum|maximum/, ['Advanced Math', 'Medium']],
      [/quadratic|roots|zeros/, ['Advanced Math', null]], [/exponential|growth|decay|bacteria/, ['Advanced Math', 'Hard']],
      [/system/, ['Algebra', 'Medium']], [/slope|intercept|linear|line/, ['Algebra', null]], [/algebra/, ['Algebra', null]],
      [/percent|discount|tax/, ['Problem Solving & Data Analysis', 'Medium']], [/mean|average|data|statistic/, ['Problem Solving & Data Analysis', null]],
      [/circle|radius/, ['Geometry & Trigonometry', 'Hard']], [/triangle|pythag|geometry|trig/, ['Geometry & Trigonometry', null]],
      [/advanced|math/, ['Advanced Math', null]]
    ];
    const verbalMap = [
      [/grammar|punctuat|comma|semicolon|convention|agreement|modifier/, { test: 'SAT', section: 'Reading & Writing', domain: 'Standard English Conventions' }],
      [/transition|synthesis|notes|expression/, { test: 'SAT', section: 'Reading & Writing', domain: 'Expression of Ideas' }],
      [/words? in context|vocab|craft|structure|purpose|cross.?text/, { test: 'SAT', section: 'Reading & Writing', domain: 'Craft and Structure' }],
      [/reading|main idea|inference|evidence|passage/, { test: 'SAT', section: 'Reading & Writing' }],
      [/act english|english/, { test: 'ACT', section: 'English' }], [/science/, { test: 'ACT', section: 'Science' }],
      [/act reading/, { test: 'ACT', section: 'Reading' }]
    ];

    const poseMC = (q, intro) => {
      pending = q;
      return `${intro}\n\n` + (q.passage ? `<span class="muted">${esc(q.passage)}</span>\n\n` : '') + `${esc(q.prompt)}\n\n` +
        q.choices.map((c, i) => `${LETTERS[i]}) ${esc(c)}`).join('\n') + '\n\nReply with a letter, "hint", or "skip".';
    };

    // Returns HTML for the built-in handlers, or null when the message needs the AI (or the fallback).
    const reply = (raw) => {
      const t = raw.toLowerCase().trim();
      if (pending) {
        if (/^(hint|help|stuck)\b/.test(t)) return pending.desmos ? `Hint: ${esc(pending.desmos)}` : pending.choices ? 'Eliminate choices that don\'t answer exactly what the question asks, then compare the last two word by word.' : 'Reread the last line: what exactly is being asked?';
        if (/^(skip|show|answer|give up)\b/.test(t)) { const q = pending; pending = null; return `The answer is <b>${esc(answerText(q))}</b>.\n${esc(q.explanation)}`; }
        const letter = pending.choices && t.match(/^\(?([a-e])\)?[.)]?$/);
        if (letter || (!pending.choices && !Number.isNaN(parseNum(t)))) {
          const q = pending, resp = letter ? LETTERS.indexOf(letter[1].toUpperCase()) : t;
          const ok = isCorrect(q, resp); if (!q.ai) record(q, ok, 'tutor'); pending = null;
          return (ok ? '✅ Correct! ' : `❌ Not quite. The answer is <b>${esc(answerText(q))}</b>. `) + esc(q.explanation) + (q.desmos ? `\n\n<b>Desmos:</b> ${esc(q.desmos)}` : '') + '\n\nWant another? Say "another".';
        }
      }
      const wantsQ = /(give|generate|another|practice|quiz|question|problem|drill|test me)/.test(t);
      if (wantsQ) {
        const verbal = verbalMap.find(([re]) => re.test(t));
        const isMath = genMap.some(([re]) => re.test(t)) || (/another/.test(t) && pending === null && lastKind === 'math');
        if (verbal && !isMath) { lastKind = 'verbal'; lastVerbal = verbal[1]; return sampleFn ? null : serveBank(verbal[1]); }
        if (/another/.test(t) && lastKind === 'verbal') return sampleFn ? null : serveBank(lastVerbal);
        let dom = null, diff = null;
        for (const [re, v] of genMap) if (re.test(t)) { [dom, diff] = v; break; }
        if (/extreme|hardest/.test(t)) diff = 'Extreme'; else if (/hard/.test(t)) diff = diff || 'Hard'; else if (/easy/.test(t)) diff = 'Easy';
        if (!dom && /weak/.test(t)) { const w = weakest(5).find(x => G.domains.includes(x.domain)); if (w) dom = w.domain; }
        const q = G.generate(dom, diff); pending = q; lastKind = 'math';
        return `Here's a <b>${esc(q.difficulty)}</b> ${esc(q.domain)} question (${esc(q.skill)}):\n\n${esc(q.prompt)}\n\nType your answer, "hint", or "skip".`;
      }
      const def = t.match(/(?:define|definition of|meaning of|what does)\s+"?([a-z]+)"?/);
      if (def) {
        const v = V.find(x => x.w === def[1]);
        if (v) return `<b>${esc(v.w)}</b> (${esc(v.pos)}): ${esc(v.d)}.\n<i>"${esc(v.ex)}"</i>`;
        return sampleFn ? null : `"${esc(def[1])}" isn't in the vocab list yet. Try the <a href="#vocab">Vocab Builder</a>.`;
      }
      if (/predict|my score|what.*score/.test(t)) {
        const p = predict();
        if (!p.sat && !p.act) return 'I need more data. Answer at least 5 SAT Math and 5 SAT Reading & Writing questions (or some ACT questions) and ask again.';
        return `Based on your recent work:\n• SAT: <b>${p.sat ?? '—'}</b> (Math ${p.satMath ?? '—'}, R&W ${p.satRW ?? '—'})\n• ACT composite: <b>${p.act ?? '—'}</b>\nFor a sharper estimate, take a <a href="#mock">mock exam</a>.`;
      }
      if (/weak|what should i study|study plan|plan|focus|recommend/.test(t)) {
        const w = weakest(3);
        if (!w.length) return 'Answer some questions first, or take a <a href="#mock">mock exam</a>, and I\'ll find your weak spots. Meanwhile, start with <a href="#learn.d1">Desmos basics</a>.';
        return 'Your weakest areas right now:\n' + w.map((x, i) => `${i + 1}. ${esc(x.domain)} (${x.test}): ${Math.round(x.acc * 100)}%`).join('\n') +
          `\n\nPlan: 20 minutes of targeted practice on #1 each day, one course module, and 10 vocab cards. Say "give me a question on my weak area" to start.`;
      }
      if (sampleFn) return null; // let Claude handle open questions
      for (const [re, id] of topicMap) if (re.test(t)) {
        const l = L.find(x => x.id === id);
        const steps = l.body.find(b => b.t === 'steps'), code = l.body.find(b => b.t === 'code'), tip = l.body.find(b => b.t === 'tip');
        return `<b>${esc(l.title)}</b>\n${esc(l.summary)}` +
          (steps ? '\n\n' + steps.v.map((s, i) => `${i + 1}. ${esc(s)}`).join('\n') : '') +
          (code ? `\n\n<code>${esc(code.v)}</code>` : '') + (tip ? `\n\n💡 ${esc(tip.v)}` : '') +
          `\n\n<a href="#learn.${l.id}">Open the full module →</a>`;
      }
      if (/^(hi|hello|hey)\b/.test(t)) return 'Hey! What are we working on today?';
      if (/thank/.test(t)) return 'Anytime. Keep the streak alive 🔥';
      return 'I\'m not sure about that one. Try:\n• "give me a hard systems question"\n• "quiz me on transitions"\n• "how does linear regression work in Desmos?"\n• "define ephemeral"\n• "what should I study?"';
    };
    let lastKind = null, lastVerbal = null;
    const serveBank = (f) => {
      const pool = Q.filter(q => q.choices && q.test === f.test && q.section === f.section && (!f.domain || q.domain === f.domain));
      const q = pool[Math.floor(Math.random() * pool.length)];
      return poseMC(q, `Here's a <b>${esc(q.difficulty)}</b> ${esc(q.test)} ${esc(q.domain)} question (${esc(q.skill)}):`);
    };

    // AI turn: either an open chat answer or a freshly written multiple-choice question.
    const aiTurn = async (text) => {
      const wantsQ = /(give|generate|another|practice|quiz|question|problem|drill|test me)/i.test(text);
      const bubble = say('bot', '<span class="muted">Thinking…</span>');
      busy = true; ctl = new AbortController(); $('#stopBtn').hidden = false;
      try {
        if (wantsQ) {
          const f = lastVerbal || { test: 'SAT', section: 'Reading & Writing' };
          const data = await sampleFn.json(`${AI_PREAMBLE}\n\n${studentContext()}\n\nWrite ONE new, original ${f.test} ${f.section} multiple-choice practice question` +
            (f.domain ? ` in the domain "${f.domain}"` : '') + ` matching this request: "${text}". Match the style and difficulty of the real ${f.test}. ` +
            `Include a short passage if the question type uses one. ${f.test === 'ACT' ? 'Use 4 choices; for English questions use "NO CHANGE" as choice A and put the underlined portion in [brackets].' : 'Use exactly 4 choices.'} ` +
            'Exactly one choice must be correct. Return only JSON: {"passage": string or "", "prompt": string, "choices": [4 strings], "answer": index 0-3, "explanation": string, "domain": string, "skill": string, "difficulty": "Easy"|"Medium"|"Hard"}',
            { signal: ctl.signal, cache: false });
          if (!data || !Array.isArray(data.choices) || data.choices.length < 2 || !(data.answer >= 0 && data.answer < data.choices.length) || !data.prompt) throw { code: 'invalid_json' };
          const q = { id: 'ai-' + Date.now(), ai: true, test: f.test, section: f.section, domain: String(data.domain || f.domain || f.section), skill: String(data.skill || ''),
            difficulty: ['Easy', 'Medium', 'Hard'].includes(data.difficulty) ? data.difficulty : 'Medium', passage: data.passage ? String(data.passage) : '',
            prompt: String(data.prompt), choices: data.choices.map(String), answer: Number(data.answer), explanation: String(data.explanation || '') };
          bubble.innerHTML = poseMC(q, `Here's a new <b>${esc(q.difficulty)}</b> ${esc(q.test)} question Atlas wrote for you (${esc(q.skill || q.domain)}):`);
          history.push({ role: 'user', content: text }, { role: 'assistant', content: `(Posed a practice question: ${q.prompt})` });
        } else {
          history.push({ role: 'user', content: text });
          const turns = history.slice(-12);
          while (turns.length && turns[0].role !== 'user') turns.shift();
          turns[0] = { role: 'user', content: `${AI_PREAMBLE}\n\n${studentContext()}\n\nThe site has these lessons the student can open: ${L.map(l => l.title).join('; ')}.\n\nStudent: ${turns[0].content}` };
          const { text: answer } = await sampleFn(turns, { signal: ctl.signal, cache: false, onText: ({ text }) => { bubble.innerHTML = renderAi(text); log.scrollTop = log.scrollHeight; } });
          bubble.innerHTML = renderAi(answer);
          history.push({ role: 'assistant', content: answer });
        }
      } catch (e) {
        if (history.length && history[history.length - 1].role === 'user') history.pop();
        const code = e && e.code;
        if (code === 'not_granted' || code === 'sampling_disabled' || code === 'capability_disabled') { sampleFn = null; paintMode(); }
        bubble.innerHTML = (e && e.text ? renderAi(e.text) + '\n\n' : '') + `<span class="muted">${esc(aiErrorCopy(code))}</span>`;
        if (!sampleFn) { const r = reply(text); if (r) say('bot', r); }
      } finally {
        busy = false; ctl = null; const sb = $('#stopBtn'); if (sb) sb.hidden = true; log.scrollTop = log.scrollHeight;
      }
    };

    const send = text => {
      if (!text.trim() || busy) return;
      say('me', esc(text));
      const r = reply(text);
      if (r !== null) { setTimeout(() => say('bot', r), 200); return; }
      aiTurn(text);
    };
    $('#stopBtn').addEventListener('click', () => ctl && ctl.abort());
    $('#chatForm').addEventListener('submit', e => { e.preventDefault(); const i = $('#chatIn'); send(i.value); i.value = ''; });
    $$('.chip').forEach(c => c.addEventListener('click', () => send(c.textContent)));
  };

  /* ───────────── router ───────────── */
  function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    const [name = '', arg] = (location.hash || '').replace(/^#/, '').split('.');
    const view = views[name] ? name : 'home';
    $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.route === view));
    $('#nav').classList.remove('open');
    views[view](arg);
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
  }

  /* ───────────── boot ───────────── */
  function applyTheme() {
    if (Store.data.theme) document.documentElement.setAttribute('data-theme', Store.data.theme);
    else document.documentElement.removeAttribute('data-theme');
  }
  $('#themeBtn').addEventListener('click', () => {
    const dark = Store.data.theme ? Store.data.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    Store.data.theme = dark ? 'light' : 'dark'; Store.save(); applyTheme();
  });
  $('#menuBtn').addEventListener('click', () => $('#nav').classList.toggle('open'));
  $('#calcFab').addEventListener('click', () => $('#calcDrawer').classList.contains('hidden') ? openCalc() : closeCalc());
  $('#calcClose').addEventListener('click', closeCalc);
  $('#year').textContent = new Date().getFullYear();
  window.addEventListener('hashchange', route);
  // Links to the current hash (e.g. "Back to exams" after a mock) don't fire hashchange, so re-route manually.
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (a && a.getAttribute('href') === (location.hash || '#home') && !e.defaultPrevented) { e.preventDefault(); route(); }
  });
  applyTheme();
  updateStreak();
  route();
})();
