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

  /* ───────────── Desmos calculator drawer ───────────── */
  // Desmos's public demo key. For a production deployment request your own free key at https://www.desmos.com/api
  const DESMOS_KEY = 'dcb31709b452b1cf9dc26972add0fda6';
  let calc = null, calcLoading = false;
  function openCalc(expressions) {
    $('#calcDrawer').classList.remove('hidden');
    $('#calcFab').setAttribute('aria-expanded', 'true');
    const apply = () => {
      if (calc && expressions) expressions.forEach((latex, i) => calc.setExpression({ id: 'q' + i, latex }));
    };
    if (calc) return apply();
    if (calcLoading) return;
    calcLoading = true;
    const s = document.createElement('script');
    s.src = 'https://www.desmos.com/api/v1.10/calculator.js?apiKey=' + DESMOS_KEY;
    s.onload = () => {
      calc = window.Desmos.GraphingCalculator($('#calculator'), { expressionsCollapsed: false, settingsMenu: true });
      apply();
    };
    s.onerror = () => {
      $('#calculator').innerHTML = '<div class="calc-fallback"><p>The embedded calculator couldn\'t load.</p><a class="btn brand" href="https://www.desmos.com/calculator" target="_blank" rel="noopener">Open Desmos in a new tab ↗</a></div>';
    };
    document.head.appendChild(s);
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
        <div class="eyebrow">★ 100% free: every feature, no credit card, no paywall</div>
        <h1>Cook the SAT & ACT<br><span>without paying a cent.</span></h1>
        <p class="lead">Question banks, Desmos regression shortcuts, adaptive mock exams, score diagnostics, a vocab builder and a study tutor. Everything other prep sites charge up to $88/month for is free here.</p>
        <div class="row">
          <a class="btn primary lg" href="#/daily">Start today's question →</a>
          <a class="btn lg" href="#/mock">Take a mock exam</a>
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
            ['📚', 'Question Bank', 'SAT & ACT questions sorted by official domain and skill, from Easy to Extreme.', '#/practice'],
            ['ƒ', 'Desmos Solutions', 'Math questions include a Desmos regression or graphing shortcut, with the calculator built in.', '#/learn'],
            ['♾️', 'Infinite Math', 'Procedurally generated SAT math. You will never run out of practice problems.', '#/infinite'],
            ['⏱️', 'Adaptive Mock Exams', 'Timed modules that adapt like the Digital SAT, scored on the 400–1600 scale.', '#/mock'],
            ['📈', 'Diagnostics', 'Accuracy by domain, predicted SAT and ACT scores, and your weakest areas.', '#/progress'],
            ['🔤', 'Vocab Builder', 'Flashcards and quizzes for words that keep appearing on the test.', '#/vocab'],
            ['🔥', 'Daily Question', 'A new question every day with streak tracking to keep you consistent.', '#/daily'],
            ['🤖', 'Atlas Tutor', 'Ask for Desmos strategies, targeted practice, word definitions, or a study plan.', '#/tutor'],
            ['🎓', 'Course Modules', 'Short, focused lessons on Desmos, SAT Reading & Writing, and ACT strategy.', '#/learn']
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
            ['Premium', '$44', 'Study smarter', ['Everything in Plus', 'All mock exams', 'Full course modules', 'Atlas tutor']],
            ['Max', '$88', 'All-inclusive', ['Everything in Premium', 'Advanced Desmos regression modules', 'Infinite generated practice', 'Personalized study plan']]
          ].map(([n, was, sub, items], i) => `
            <div class="card price-card ${i === 3 ? 'featured' : ''}">
              ${i === 3 ? '<span class="ribbon">Everything</span>' : ''}
              <h3>${n}</h3><div class="muted small">${sub}</div>
              <div class="price">${was ? `<s>${was}/mo</s>` : ''}$0</div>
              <ul>${items.map(x => `<li>${x}</li>`).join('')}</ul>
              <a class="btn ${i === 3 ? 'primary' : ''}" href="#/practice">Start free</a>
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
          <div class="row" style="justify-content:center"><a class="btn primary" href="#/progress">View diagnostics</a><button class="btn" id="again">Practice again</button></div></div>`;
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
      title: 'SAT Reading & Writing: Mini-Mock', test: 'SAT', section: 'Reading & Writing', desc: '2 modules × 6 questions · 14 min', perQ: 71, scale: 'sat',
      build(mod) {
        const bank = Q.filter(q => q.test === 'SAT' && q.section === 'Reading & Writing');
        const easy = bank.filter(q => q.difficulty === 'Easy' || q.difficulty === 'Medium');
        const hard = bank.filter(q => q.difficulty === 'Hard' || q.difficulty === 'Extreme');
        // Module 1 leans easier; module 2 gets whatever remains.
        const m1 = shuffle(easy).slice(0, 4).concat(shuffle(hard).slice(0, 2));
        this._m1 = new Set(m1.map(q => q.id));
        return mod === 1 ? shuffle(m1) : shuffle(bank.filter(q => !this._m1.has(q.id))).slice(0, 6);
      }
    },
    'act-mixed': {
      title: 'ACT Mixed-Section Mini-Mock', test: 'ACT', section: 'Mixed', desc: '1 module × all ACT questions · ~16 min', perQ: 50, scale: 'act',
      build() { return Q.filter(q => q.test === 'ACT'); }, modules: 1
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
          if (!blank || confirm(`${blank} question(s) unanswered. Submit anyway?`)) finish();
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
          <div class="row" style="justify-content:center"><a class="btn primary" href="#/progress">View diagnostics</a><a class="btn" href="#/mock">Back to exams</a></div>
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
      if (!l) { location.hash = '#/learn'; return; }
      const idx = L.indexOf(l), next = L[idx + 1];
      app.innerHTML = `
        <a href="#/learn" class="small">← All modules</a>
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
          ${next ? `<a class="btn" href="#/learn/${next.id}">Next: ${esc(next.title)} →</a>` : ''}
        </div>`;
      $('#doneBtn').addEventListener('click', () => { Store.data.lessons[l.id] = true; Store.save(); toast('Module completed'); views.learn(id); });
      $$('.try-desmos').forEach(b => b.addEventListener('click', () => {
        const lines = b.dataset.code.split('\n').map(s => s.replace(/₁/g, '_1').replace(/²/g, '^2').replace(/√\(([^)]*)\)/g, '\\sqrt{$1}').replace(/·/g, '\\cdot ').replace(/−/g, '-')
          .replace(/~/g, '\\sim ').replace(/\^\(([^)]*)\)/g, '^{$1}'));
        openCalc(lines);
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
        <a class="card lesson-card" href="#/learn/${l.id}"><div class="row"><span class="small muted">${l.mins} min</span><span class="spacer"></span>${Store.data.lessons[l.id] ? '<span class="done-badge">✓ Done</span>' : ''}</div>
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
          ${G.domains.includes(w.domain) && w.test === 'SAT' ? ` <a href="#/infinite" data-domain="${esc(w.domain)}">Drill with Infinite Math →</a>` : ' <a href="#/practice">Practice in the bank →</a>'}</li>`).join('')}</ol>`
          : '<p class="muted">Answer a few questions and we will build a study path from your weakest domains.</p>'}
      </div>
      <div class="row" style="margin-top:24px"><span class="spacer"></span><button class="btn sm" id="exportBtn">Export progress</button><button class="btn sm" id="resetBtn">Reset all progress</button></div>`;
    $$('[data-domain]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault(); presetDomain = a.dataset.domain; location.hash = '#/infinite';
    }));
    $('#resetBtn').addEventListener('click', () => { if (confirm('Erase all progress saved in this browser?')) { Store.reset(); updateStreak(); views.progress(); } });
    $('#exportBtn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(Store.data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'openscore-progress.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  };

  /* Atlas tutor: an offline, rule-based study assistant. */
  views.tutor = () => {
    let pending = null;
    app.innerHTML = `
      <div class="page-head"><h1>Atlas Tutor</h1><p>Your study assistant. Ask for Desmos strategies, request practice on a topic, look up a word, or ask what to study next. Atlas runs entirely in your browser.</p></div>
      <div class="card chat">
        <div class="chat-log" id="log" aria-live="polite"></div>
        <div class="chips">${['Give me a hard quadratic question', 'How do I do quadratic regression?', 'What should I study?', 'Define "mitigate"', 'Predict my score', 'Comma vs semicolon'].map(c => `<button class="chip">${c}</button>`).join('')}</div>
        <form class="chat-form" id="chatForm"><input type="text" id="chatIn" placeholder="Ask Atlas anything…" autocomplete="off" aria-label="Message"><button class="btn primary">Send</button></form>
      </div>`;
    const log = $('#log');
    const say = (who, html) => { const m = document.createElement('div'); m.className = 'msg ' + who; m.innerHTML = html; log.appendChild(m); log.scrollTop = log.scrollHeight; return m; };
    say('bot', 'Hi, I\'m Atlas 👋 I can:\n• explain Desmos regression tricks\n• generate practice on any SAT math topic ("give me a circle question")\n• check your answers and give hints\n• define vocab words\n• build a study plan from your results');

    const topicMap = [
      [/quadratic regression|3 points|three points|parabola.*points/, 'd3'], [/linear regression|regress|line of best|best fit/, 'd2'],
      [/exponential regression/, 'd4'], [/slider|no solution|infinite(ly)? many|constant k|value of k/, 'd5'],
      [/equivalent|transform/, 'd6'], [/mean|median|stdev|standard deviation|statistic/, 'd7'], [/circle|inequalit/, 'd8'],
      [/desmos|calculator|graph/, 'd1'], [/comma|semicolon|colon|boundar|splice/, 'r1'], [/transition/, 'r2'],
      [/words? in context|vocab strategy/, 'r3'], [/notes|synthesis/, 'r4'], [/act english|omit|wordy|redundan/, 'a1'],
      [/act science|science/, 'a2'], [/pacing|time|act math/, 'a3']
    ];
    const genMap = [
      [/quadratic regression|parabola|3 points/, ['Advanced Math', 'Extreme']], [/vertex|minimum|maximum/, ['Advanced Math', 'Medium']],
      [/quadratic|roots|zeros/, ['Advanced Math', null]], [/exponential|growth|decay|bacteria/, ['Advanced Math', 'Hard']],
      [/system/, ['Algebra', 'Medium']], [/slope|intercept|linear|line/, ['Algebra', null]], [/algebra/, ['Algebra', null]],
      [/percent|discount|tax/, ['Problem Solving & Data Analysis', 'Medium']], [/mean|average|data|statistic/, ['Problem Solving & Data Analysis', null]],
      [/circle|radius/, ['Geometry & Trigonometry', 'Hard']], [/triangle|pythag|geometry|trig/, ['Geometry & Trigonometry', null]],
      [/advanced/, ['Advanced Math', null]]
    ];

    const reply = (raw) => {
      const t = raw.toLowerCase().trim();
      // Answering a pending question
      if (pending) {
        if (/^(hint|help|stuck)/.test(t)) return pending.desmos ? `Hint: ${esc(pending.desmos)}` : 'Try working backward from what the question asks.';
        if (/^(skip|show|answer|give up)/.test(t)) { const q = pending; pending = null; return `The answer is <b>${esc(answerText(q))}</b>.\n${esc(q.explanation)}`; }
        if (!Number.isNaN(parseNum(t))) {
          const q = pending, ok = isCorrect(q, t); record(q, ok, 'tutor'); pending = null;
          return (ok ? '✅ Correct! ' : `❌ Not quite. The answer is <b>${esc(answerText(q))}</b>. `) + esc(q.explanation) + (q.desmos ? `\n\n<b>Desmos:</b> ${esc(q.desmos)}` : '') + '\n\nWant another? Say "another".';
        }
      }
      const wantsQ = /(give|generate|another|practice|quiz|question|problem|drill|test me)/.test(t);
      if (wantsQ) {
        let dom = null, diff = null;
        for (const [re, v] of genMap) if (re.test(t)) { [dom, diff] = v; break; }
        if (/extreme|hardest/.test(t)) diff = 'Extreme'; else if (/hard/.test(t)) diff = diff || 'Hard'; else if (/easy/.test(t)) diff = 'Easy';
        if (!dom && /weak/.test(t)) { const w = weakest(5).find(x => G.domains.includes(x.domain)); if (w) dom = w.domain; }
        const q = G.generate(dom, diff); pending = q;
        return `Here's a <b>${esc(q.difficulty)}</b> ${esc(q.domain)} question (${esc(q.skill)}):\n\n${esc(q.prompt)}\n\nType your answer, "hint", or "skip".`;
      }
      const def = t.match(/(?:define|definition of|meaning of|what does)\s+"?([a-z]+)"?/);
      if (def) {
        const v = V.find(x => x.w === def[1]);
        return v ? `<b>${esc(v.w)}</b> (${esc(v.pos)}): ${esc(v.d)}.\n<i>"${esc(v.ex)}"</i>` : `"${esc(def[1])}" isn't in the vocab list yet. Try the <a href="#/vocab">Vocab Builder</a>.`;
      }
      if (/predict|my score|what.*score/.test(t)) {
        const p = predict();
        if (!p.sat && !p.act) return 'I need more data. Answer at least 5 SAT Math and 5 SAT Reading & Writing questions (or some ACT questions) and ask again.';
        return `Based on your recent work:\n• SAT: <b>${p.sat ?? '—'}</b> (Math ${p.satMath ?? '—'}, R&W ${p.satRW ?? '—'})\n• ACT composite: <b>${p.act ?? '—'}</b>\nFor a sharper estimate, take a <a href="#/mock">mock exam</a>.`;
      }
      if (/weak|study|plan|focus|improve|next|recommend/.test(t)) {
        const w = weakest(3);
        if (!w.length) return 'Answer some questions first, or take a <a href="#/mock">mock exam</a>, and I\'ll find your weak spots. Meanwhile, start with <a href="#/learn/d1">Desmos basics</a>.';
        return 'Your weakest areas right now:\n' + w.map((x, i) => `${i + 1}. ${esc(x.domain)} (${x.test}): ${Math.round(x.acc * 100)}%`).join('\n') +
          `\n\nPlan: 20 minutes of targeted practice on #1 each day, one course module, and 10 vocab cards. Say "give me a question on my weak area" to start.`;
      }
      for (const [re, id] of topicMap) if (re.test(t)) {
        const l = L.find(x => x.id === id);
        const steps = l.body.find(b => b.t === 'steps'), code = l.body.find(b => b.t === 'code'), tip = l.body.find(b => b.t === 'tip');
        return `<b>${esc(l.title)}</b>\n${esc(l.summary)}` +
          (steps ? '\n\n' + steps.v.map((s, i) => `${i + 1}. ${esc(s)}`).join('\n') : '') +
          (code ? `\n\n<code>${esc(code.v)}</code>` : '') + (tip ? `\n\n💡 ${esc(tip.v)}` : '') +
          `\n\n<a href="#/learn/${l.id}">Open the full module →</a>`;
      }
      if (/^(hi|hello|hey)/.test(t)) return 'Hey! What are we working on today?';
      if (/thank/.test(t)) return 'Anytime. Keep the streak alive 🔥';
      return 'I\'m not sure about that one. Try:\n• "give me a hard systems question"\n• "how does linear regression work in Desmos?"\n• "define ephemeral"\n• "what should I study?"';
    };

    const send = text => {
      if (!text.trim()) return;
      say('me', esc(text));
      setTimeout(() => say('bot', reply(text)), 250);
    };
    $('#chatForm').addEventListener('submit', e => { e.preventDefault(); const i = $('#chatIn'); send(i.value); i.value = ''; });
    $$('.chip').forEach(c => c.addEventListener('click', () => send(c.textContent)));
  };

  /* ───────────── router ───────────── */
  function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    const [, name = '', arg] = (location.hash || '#/').split('/');
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
    const a = e.target.closest('a[href^="#/"]');
    if (a && a.getAttribute('href') === (location.hash || '#/') && !e.defaultPrevented) { e.preventDefault(); route(); }
  });
  applyTheme();
  updateStreak();
  route();
})();
