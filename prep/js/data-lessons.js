/* Course modules. Each lesson: id, track, title, mins, summary, body (array of blocks).
 * Block types: p (paragraph), steps (ordered list), code (Desmos input), tip. */
window.LESSONS = [
  /* ───────── Desmos mastery track ───────── */
  {
    id: 'd1', track: 'Desmos Mastery', title: 'Desmos basics: graph, click, done', mins: 8,
    summary: 'Most SAT algebra can be solved by graphing and clicking points of interest.',
    body: [
      { t: 'p', v: 'The Digital SAT has a built-in Desmos graphing calculator on every math question. Most students only use it for arithmetic. Top scorers use it to skip algebra altogether.' },
      { t: 'steps', v: [
        'Type each equation exactly as written. Desmos accepts implicit equations such as 2x + 3y = 12.',
        'Click on gray dots to reveal intercepts, intersections, and vertices.',
        'Use the zoom-fit (house) button when a graph goes off screen.',
        'For an equation in one variable, graph each side as its own y = … and find where they cross.'
      ]},
      { t: 'code', v: 'y = √(2x+7)\ny = x + 2' },
      { t: 'tip', v: 'Graphing both sides of a radical equation shows only real solutions, so extraneous roots never appear.' }
    ]
  },
  {
    id: 'd2', track: 'Desmos Mastery', title: 'Linear regression: finding a line from points', mins: 10,
    summary: 'Use the ~ operator to have Desmos find slope and intercept for you.',
    body: [
      { t: 'p', v: 'When a question gives you two or more points (or a table) and asks for a slope, intercept, or a missing value, run a regression instead of computing it by hand.' },
      { t: 'steps', v: [
        'Click + and choose "table".',
        'Enter x values in column x₁ and y values in column y₁.',
        'On a new line type: y₁ ~ m x₁ + b',
        'Desmos shows m and b. With exact data, R² = 1.',
        'Use m and b in later lines, e.g. type m·40 + b to predict y at x = 40.'
      ]},
      { t: 'code', v: 'y₁ ~ m x₁ + b' },
      { t: 'tip', v: 'Type the subscript with an underscore: y_1 ~ m x_1 + b.' }
    ]
  },
  {
    id: 'd3', track: 'Desmos Mastery', title: 'Quadratic regression: 3 points → a, b, c', mins: 12,
    summary: 'The fastest way to solve "the parabola passes through…" questions.',
    body: [
      { t: 'p', v: 'Three points determine a parabola. The hardest SAT questions give three points and ask for a coefficient or a later output. That normally takes a 3×3 system of equations. With Desmos it takes 20 seconds.' },
      { t: 'steps', v: [
        'Enter the three points in a table (x₁, y₁).',
        'Type y₁ ~ a x₁² + b x₁ + c',
        'Read a, b, and c from the regression panel.',
        'Evaluate what the question asks, e.g. a·5² + b·5 + c.'
      ]},
      { t: 'code', v: 'y₁ ~ a x₁² + b x₁ + c' },
      { t: 'tip', v: 'Vertex form works too: y₁ ~ a(x₁ − h)² + k gives the vertex (h, k) directly.' }
    ]
  },
  {
    id: 'd4', track: 'Desmos Mastery', title: 'Exponential regression', mins: 10,
    summary: 'Find initial value and growth factor from any two points.',
    body: [
      { t: 'p', v: 'For exponential models y = a·bˣ, enter the data and regress. Desmos returns the initial value a and the growth factor b.' },
      { t: 'code', v: 'y₁ ~ a·b^(x₁)' },
      { t: 'steps', v: [
        'If b > 1 it is growth: percent increase = (b − 1) × 100%.',
        'If 0 < b < 1 it is decay: percent decrease = (1 − b) × 100%.',
        'For "doubles every k years" models, try y₁ ~ a·2^(x₁/k).'
      ]}
    ]
  },
  {
    id: 'd5', track: 'Desmos Mastery', title: 'Sliders: solve for unknown constants', mins: 12,
    summary: 'No solution, infinitely many, exactly one: drag a slider and look.',
    body: [
      { t: 'p', v: 'When an equation has a constant like k, Desmos offers to add a slider. Drag it and watch the graph change. This handles many "for what value of k…" questions.' },
      { t: 'steps', v: [
        'No solution (linear system): drag until the lines are parallel.',
        'Infinitely many solutions: drag until the lines sit on top of each other.',
        'Exactly one solution (quadratic): drag until the vertex touches the x-axis.',
        'Set slider bounds and step size (click the numbers at each end) for exact values.'
      ]},
      { t: 'tip', v: 'Rename k to x inside an expression like the discriminant, then graph it. The zeros are the k values you want.' }
    ]
  },
  {
    id: 'd6', track: 'Desmos Mastery', title: 'Equivalent expressions & function tricks', mins: 8,
    summary: 'Graph the original and each answer choice. The one that overlaps wins.',
    body: [
      { t: 'p', v: 'For "which expression is equivalent" questions, graph the original, then each choice. Equivalent expressions produce the same graph.' },
      { t: 'steps', v: [
        'Define functions: f(x) = …, then g(x) = f(x − 3) to test transformations.',
        'Use a table to check f at specific inputs.',
        'Toggle a line on and off by clicking its colored circle.'
      ]},
      { t: 'code', v: 'f(x) = (x−2)(x+4)\ng(x) = f(x−3)' }
    ]
  },
  {
    id: 'd7', track: 'Desmos Mastery', title: 'Statistics in one line', mins: 6,
    summary: 'mean(), median(), stdev() and more on raw lists.',
    body: [
      { t: 'code', v: 'L = [3, 7, 7, 9, 14]\nmean(L)\nmedian(L)\nstdev(L)' },
      { t: 'p', v: 'Desmos computes list statistics instantly. Use it to check how changing a single value affects the mean and median.' }
    ]
  },
  {
    id: 'd8', track: 'Desmos Mastery', title: 'Systems of inequalities & circles', mins: 9,
    summary: 'Shaded regions and completing the square without the algebra.',
    body: [
      { t: 'p', v: 'Type inequalities directly. The overlapping shaded region is the solution set. For circles in general form, graph the equation as given and click the extreme points to read the center and radius.' },
      { t: 'code', v: 'x² + y² − 6x + 8y = 11' }
    ]
  },

  /* ───────── SAT Reading & Writing track ───────── */
  {
    id: 'r1', track: 'SAT Reading & Writing', title: 'Boundaries: commas, semicolons, colons', mins: 12,
    summary: 'The most-tested grammar rule on the Digital SAT.',
    body: [
      { t: 'steps', v: [
        'Two independent clauses: join with a period, a semicolon, or a comma + FANBOYS conjunction.',
        'A comma alone between two independent clauses is a comma splice, which is always wrong.',
        'A colon must follow a complete sentence and introduces an explanation, a list, or an example.',
        'Never put a single comma between a subject and its verb.'
      ]},
      { t: 'tip', v: 'If a period and a semicolon both appear in the choices and both would work, they are equivalent, so the answer is a third option.' }
    ]
  },
  {
    id: 'r2', track: 'SAT Reading & Writing', title: 'Transitions without guessing', mins: 8,
    summary: 'Classify the relationship first, then pick the word.',
    body: [
      { t: 'steps', v: [
        'Contrast: however, nevertheless, by contrast, yet.',
        'Continuation: moreover, furthermore, additionally, similarly.',
        'Cause/effect: therefore, consequently, as a result, thus.',
        'Example/specification: for instance, specifically, in particular.'
      ]},
      { t: 'tip', v: 'Cover the choices. Decide the relationship between the sentences in your own words before you look.' }
    ]
  },
  {
    id: 'r3', track: 'SAT Reading & Writing', title: 'Words in context', mins: 10,
    summary: 'Predict a word, then match it to a choice.',
    body: [
      { t: 'p', v: 'Read the sentence with a blank and come up with your own simple word based on the clues. Contrast words such as "although" and "yet" and colons are the strongest clues.' },
      { t: 'tip', v: 'Use the Vocab Builder daily. Many words in context questions use the same set of academic words.' }
    ]
  },
  {
    id: 'r4', track: 'SAT Reading & Writing', title: 'Rhetorical synthesis (notes questions)', mins: 7,
    summary: 'Read the goal first. Ignore the notes until you need them.',
    body: [
      { t: 'steps', v: [
        'Read the question\'s goal: "emphasize a difference," "introduce the study to an audience unfamiliar with…"',
        'Eliminate any choice that does not accomplish that exact goal, even if it is true.',
        'A "difference" goal needs a contrast word; a "similarity" goal needs a comparison.'
      ]}
    ]
  },

  /* ───────── ACT track ───────── */
  {
    id: 'a1', track: 'ACT Strategy', title: 'ACT English: shortest is often right', mins: 8,
    summary: 'Redundancy, wordiness, and OMIT.',
    body: [
      { t: 'p', v: 'The ACT rewards concise writing. When choices differ only in length and all are grammatical, the shortest one that keeps the meaning is usually correct.' },
      { t: 'tip', v: 'When "DELETE" or "OMIT" is a choice, it is correct more often than students expect.' }
    ]
  },
  {
    id: 'a2', track: 'ACT Strategy', title: 'ACT Science is a reading test', mins: 10,
    summary: 'Go straight to the figures. Skim the passage.',
    body: [
      { t: 'steps', v: [
        'Read the question first, then find the figure or table it refers to.',
        'Check axis labels and units before anything else.',
        'For "if the trend continues," extend the pattern. A linear regression in Desmos helps here.',
        'For conflicting viewpoints, summarize each scientist\'s view in 5 words.'
      ]}
    ]
  },
  {
    id: 'a3', track: 'ACT Strategy', title: 'ACT Math pacing', mins: 6,
    summary: 'Early questions are easier. Bank time there.',
    body: [
      { t: 'p', v: 'ACT math questions roughly increase in difficulty. Aim to finish the first 30 in about 25 minutes so you have extra time for the hardest ones at the end.' },
      { t: 'tip', v: 'The ACT allows many graphing calculators. Learn the regression features on yours, or practice with Desmos here.' }
    ]
  }
];
