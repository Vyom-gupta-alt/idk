/* Procedural SAT-style math question generator ("Infinite Practice").
 * Every generated question has an integer or terminating-decimal answer,
 * so it can be checked like a grid-in response. */
(function () {
  const ri = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const nz = (a, b) => { let v = 0; while (v === 0) v = ri(a, b); return v; };
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const sgn = (n, first) => (n < 0 ? (first ? '−' : ' − ') + Math.abs(n) : (first ? '' : ' + ') + n);
  const term = (coef, v, first) => {
    if (coef === 0) return '';
    const abs = Math.abs(coef);
    const c = abs === 1 ? '' : abs;
    if (first) return (coef < 0 ? '−' : '') + c + v;
    return (coef < 0 ? ' − ' : ' + ') + c + v;
  };
  const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
  let seq = 0;
  const minus = t => t.replace(/(^|[\s(,=])-(\d)/g, '$1−$2');
  const mk = (o) => Object.assign({ id: 'gen-' + Date.now().toString(36) + '-' + (seq++), test: 'SAT', section: 'Math', choices: null, generated: true }, o,
    { prompt: minus(o.prompt), explanation: minus(o.explanation) });

  const templates = {
    linear() {
      const x = ri(-9, 12), a = nz(2, 9), b = ri(-15, 15), c = a * x + b;
      const k = ri(2, 4);
      return mk({
        domain: 'Algebra', skill: 'Linear equations in one variable', difficulty: 'Easy',
        prompt: `If ${a}x${sgn(b)} = ${c}, what is the value of ${k * a}x${sgn(k * b)}?`,
        answer: [String(k * c)],
        explanation: `The expression is ${k} × (${a}x${sgn(b)}), so its value is ${k} × ${c} = ${k * c}. (Here x = ${x}.)`,
        desmos: `Type ${a}x${sgn(b)}=${c} to get x = ${x}, then evaluate the expression.`
      });
    },
    system() {
      const x = ri(-6, 8), y = ri(-6, 8);
      let a1 = nz(-5, 5), b1 = nz(-5, 5), a2 = nz(-5, 5), b2 = nz(-5, 5);
      while (a1 * b2 - a2 * b1 === 0) { a2 = nz(-5, 5); b2 = nz(-5, 5); }
      const c1 = a1 * x + b1 * y, c2 = a2 * x + b2 * y;
      const ask = pick(['x + y', 'x − y', 'xy']);
      const val = ask === 'x + y' ? x + y : ask === 'x − y' ? x - y : x * y;
      return mk({
        domain: 'Algebra', skill: 'Systems of linear equations', difficulty: 'Medium',
        prompt: `${term(a1, 'x', true)}${term(b1, 'y')} = ${c1}\n${term(a2, 'x', true)}${term(b2, 'y')} = ${c2}\n\nIf (x, y) is the solution to the system, what is the value of ${ask}?`,
        answer: [String(val)],
        explanation: `Solving by elimination gives x = ${x} and y = ${y}, so ${ask} = ${val}.`,
        desmos: `Graph both lines and click the intersection: (${x}, ${y}).`
      });
    },
    slope() {
      const m = nz(-6, 6), b = ri(-10, 10), x1 = ri(-5, 3), x2 = x1 + ri(1, 6);
      const y1 = m * x1 + b, y2 = m * x2 + b;
      const ask = pick(['slope', 'y-intercept']);
      return mk({
        domain: 'Algebra', skill: 'Linear functions', difficulty: 'Easy',
        prompt: `A line in the xy-plane passes through (${x1}, ${y1}) and (${x2}, ${y2}). What is the ${ask} of the line?`,
        answer: [String(ask === 'slope' ? m : b)],
        explanation: `Slope = (${y2} − ${y1 < 0 ? '(' + y1 + ')' : y1})/(${x2} − ${x1 < 0 ? '(' + x1 + ')' : x1}) = ${m}. Then b = y − mx = ${b}.`,
        desmos: 'Table with the two points, then y₁ ~ m x₁ + b.'
      });
    },
    quadRoots() {
      const r1 = ri(-9, 9), r2 = ri(-9, 9), a = pick([1, 1, 2, 3]);
      const B = -a * (r1 + r2), C = a * r1 * r2;
      const ask = pick(['sum', 'product']);
      const val = ask === 'sum' ? r1 + r2 : r1 * r2;
      return mk({
        domain: 'Advanced Math', skill: 'Quadratic equations', difficulty: 'Medium',
        prompt: `What is the ${ask} of the solutions to ${term(a, 'x²', true)}${term(B, 'x')}${C ? sgn(C) : ''} = 0?`,
        answer: [String(val)],
        explanation: `The solutions are x = ${r1} and x = ${r2}. Alternatively, sum = −b/a and product = c/a. The ${ask} is ${val}.`,
        desmos: 'Graph y = (left side) and click the x-intercepts.'
      });
    },
    vertex() {
      const h = ri(-6, 6), k = ri(-12, 12), a = pick([1, 1, 2, -1, -2]);
      const B = -2 * a * h, C = a * h * h + k;
      const kind = a > 0 ? 'minimum' : 'maximum';
      return mk({
        domain: 'Advanced Math', skill: 'Quadratic functions', difficulty: 'Medium',
        prompt: `f(x) = ${term(a, 'x²', true)}${term(B, 'x')}${C ? sgn(C) : ''}. What is the ${kind} value of f?`,
        answer: [String(k)],
        explanation: `Vertex x = −b/(2a) = ${h}. f(${h}) = ${k}.`,
        desmos: `Graph it and click the vertex: (${h}, ${k}).`
      });
    },
    quadReg() {
      const a = nz(-3, 3), b = ri(-6, 6), c = ri(-9, 9);
      const f = x => a * x * x + b * x + c;
      const xs = [];
      while (xs.length < 3) { const v = ri(-3, 4); if (!xs.includes(v)) xs.push(v); }
      xs.sort((p, q) => p - q);
      const t = ri(5, 7);
      return mk({
        domain: 'Advanced Math', skill: 'Quadratic regression', difficulty: 'Extreme',
        prompt: `The graph of y = ax² + bx + c passes through the points ${xs.map(x => `(${x}, ${f(x)})`).join(', ')}. What is the value of y when x = ${t}?`,
        answer: [String(f(t))],
        explanation: `Solving the system gives a = ${a}, b = ${b}, c = ${c}. y(${t}) = ${f(t)}.`,
        desmos: `Table: x₁ = ${xs.join(', ')}; y₁ = ${xs.map(f).join(', ')}. Type y₁ ~ a x₁² + b x₁ + c, then a·${t}² + b·${t} + c.`
      });
    },
    percent() {
      const base = pick([40, 50, 60, 80, 120, 150, 200, 240, 250, 400]);
      const p = pick([5, 10, 15, 20, 25, 30, 40]);
      const q = pick([5, 10, 20, 25]);
      const up = Math.random() < 0.5;
      const val = round(base * (1 - p / 100) * (up ? 1 + q / 100 : 1 - q / 100));
      return mk({
        domain: 'Problem Solving & Data Analysis', skill: 'Percentages', difficulty: 'Medium',
        prompt: `An item originally costs $${base}. Its price is decreased by ${p}%, and the new price is then ${up ? 'increased' : 'decreased'} by ${q}%. What is the final price, in dollars?`,
        answer: [String(val)],
        explanation: `${base} × ${round(1 - p / 100)} × ${round(up ? 1 + q / 100 : 1 - q / 100)} = ${val}. Percent changes multiply; they do not add.`
      });
    },
    exponential() {
      const a = pick([100, 200, 500, 1000, 50]), r = pick([2, 3]), n = ri(2, 5), k = pick([2, 3, 4, 5]);
      const t = n * k;
      const val = a * r ** n;
      return mk({
        domain: 'Advanced Math', skill: 'Exponential models', difficulty: 'Hard',
        prompt: `A bacteria culture starts with ${a} cells and ${r === 2 ? 'doubles' : 'triples'} every ${k} hours. How many cells are present after ${t} hours?`,
        answer: [String(val)],
        explanation: `P(t) = ${a}·${r}^(t/${k}). At t = ${t}: ${a}·${r}^${n} = ${val}.`,
        desmos: `Type ${a}·${r}^(${t}/${k}).`
      });
    },
    pythag() {
      const [p, q, r] = pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]]);
      const s = ri(1, 4);
      const hide = pick([0, 1, 2]);
      const sides = [p * s, q * s, r * s];
      const labels = ['one leg', 'the other leg', 'the hypotenuse'];
      const given = [0, 1, 2].filter(i => i !== hide).map(i => `${labels[i]} is ${sides[i]}`).join(' and ');
      return mk({
        domain: 'Geometry & Trigonometry', skill: 'Right triangles', difficulty: 'Easy',
        prompt: `In a right triangle, ${given}. What is the length of ${labels[hide]}?`,
        answer: [String(sides[hide])],
        explanation: `This is a ${p}-${q}-${r} triangle scaled by ${s}, so the missing side is ${sides[hide]}.`
      });
    },
    circle() {
      const h = ri(-6, 6), k = ri(-6, 6), r = ri(2, 9);
      const D = -2 * h, E = -2 * k, F = h * h + k * k - r * r;
      const rhs = -F;
      return mk({
        domain: 'Geometry & Trigonometry', skill: 'Circles', difficulty: 'Hard',
        prompt: `A circle in the xy-plane has equation x² + y²${term(D, 'x')}${term(E, 'y')} = ${rhs}. What is the radius of the circle?`,
        answer: [String(r)],
        explanation: `Completing the square: (x ${h < 0 ? '+ ' + -h : '− ' + h})² + (y ${k < 0 ? '+ ' + -k : '− ' + k})² = ${r * r}, so r = ${r}.`,
        desmos: 'Graph the equation and click the leftmost and rightmost points. Half their distance is r.'
      });
    },
    mean() {
      const n = ri(4, 6), m = ri(8, 30);
      const vals = Array.from({ length: n - 1 }, () => ri(m - 8, m + 8));
      const missing = n * m - vals.reduce((s, v) => s + v, 0);
      return mk({
        domain: 'Problem Solving & Data Analysis', skill: 'Mean', difficulty: 'Easy',
        prompt: `The mean of ${n} numbers is ${m}. ${n - 1} of the numbers are ${vals.join(', ')}. What is the remaining number?`,
        answer: [String(missing)],
        explanation: `The total must be ${n} × ${m} = ${n * m}. Subtract the known sum ${n * m - missing} to get ${missing}.`
      });
    }
  };

  const byDomain = {
    'Algebra': ['linear', 'system', 'slope'],
    'Advanced Math': ['quadRoots', 'vertex', 'quadReg', 'exponential'],
    'Problem Solving & Data Analysis': ['percent', 'mean'],
    'Geometry & Trigonometry': ['pythag', 'circle']
  };

  window.Generator = {
    domains: Object.keys(byDomain),
    generate(domain, difficulty) {
      let keys = domain && byDomain[domain] ? byDomain[domain] : Object.keys(templates);
      if (difficulty) {
        const filtered = keys.filter(k => templates[k]().difficulty === difficulty);
        if (filtered.length) keys = filtered;
      }
      return templates[pick(keys)]();
    }
  };
})();
