/* OpenScore question bank.
 * Schema:
 *   id, test ('SAT'|'ACT'), section, domain, skill,
 *   difficulty ('Easy'|'Medium'|'Hard'|'Extreme'),
 *   passage (optional), prompt,
 *   choices (array) + answer (index)   -> multiple choice
 *   choices null + answer (string[])   -> student-produced response (grid-in)
 *   explanation, desmos (optional Desmos shortcut)
 */
window.QUESTIONS = [
  /* ───────────── SAT MATH · ALGEBRA ───────────── */
  {
    id: 'sat-m-001', test: 'SAT', section: 'Math', domain: 'Algebra', skill: 'Linear equations in one variable', difficulty: 'Easy',
    prompt: 'If 3x + 7 = 22, what is the value of 6x − 4?',
    choices: ['11', '26', '30', '34'], answer: 1,
    explanation: '3x = 15, so x = 5. Then 6x − 4 = 30 − 4 = 26. Shortcut: 6x = 2(3x) = 30 without solving for x.',
    desmos: 'Type 3x+7=22 — Desmos shows x = 5. Then type 6(5)−4.'
  },
  {
    id: 'sat-m-002', test: 'SAT', section: 'Math', domain: 'Algebra', skill: 'Linear functions', difficulty: 'Easy',
    prompt: 'A line passes through the points (2, 5) and (6, 13). What is the y-intercept of the line?',
    choices: ['−1', '1', '2', '3'], answer: 1,
    explanation: 'Slope = (13 − 5)/(6 − 2) = 2. Using y = 2x + b with (2, 5): 5 = 4 + b, so b = 1.',
    desmos: 'Make a table with x₁ = 2, 6 and y₁ = 5, 13, then type y₁ ~ m x₁ + b. Desmos reports b = 1.'
  },
  {
    id: 'sat-m-003', test: 'SAT', section: 'Math', domain: 'Algebra', skill: 'Systems of linear equations', difficulty: 'Medium',
    prompt: '2x + y = 11 and x − y = 1. If (x, y) is the solution to the system, what is the value of xy?',
    choices: null, answer: ['12'],
    explanation: 'Add the equations: 3x = 12, so x = 4 and y = 3. xy = 12.',
    desmos: 'Graph both equations and click the intersection point: (4, 3).'
  },
  {
    id: 'sat-m-004', test: 'SAT', section: 'Math', domain: 'Algebra', skill: 'Systems of linear equations', difficulty: 'Hard',
    prompt: 'In the system 4x − 6y = 10 and 6x + ky = 7, k is a constant. For what value of k does the system have no solution?',
    choices: null, answer: ['-9'],
    explanation: 'No solution means parallel lines: the x- and y-coefficients are proportional but the constants are not. 4/6 = −6/k gives k = −9. Check: 10/7 ≠ 4/6, so the lines are distinct.',
    desmos: 'Graph both equations, let Desmos add a slider for k, and drag it until the lines are parallel (k = −9).'
  },
  {
    id: 'sat-m-005', test: 'SAT', section: 'Math', domain: 'Algebra', skill: 'Linear models', difficulty: 'Easy',
    prompt: 'A gym charges a one-time $35 sign-up fee plus $22 per month. Which equation gives the total cost C, in dollars, of a membership for m months?',
    choices: ['C = 35m + 22', 'C = 22m + 35', 'C = 57m', 'C = 22(m + 35)'], answer: 1,
    explanation: 'The fixed fee is the constant (35) and the monthly charge is the rate (22 per month).'
  },
  {
    id: 'sat-m-006', test: 'SAT', section: 'Math', domain: 'Algebra', skill: 'Linear inequalities', difficulty: 'Easy',
    prompt: 'Which of the following values of x satisfies 5 − 2x > 11?',
    choices: ['−3', '−2', '−4', '0'], answer: 2,
    explanation: '−2x > 6, so x < −3 (the inequality flips when dividing by a negative). Only −4 is less than −3.',
    desmos: 'Type 5−2x>11. The shaded region starts left of x = −3 (dashed, so −3 itself is excluded).'
  },

  /* ───────────── SAT MATH · ADVANCED MATH ───────────── */
  {
    id: 'sat-m-007', test: 'SAT', section: 'Math', domain: 'Advanced Math', skill: 'Quadratic functions', difficulty: 'Medium',
    prompt: 'f(x) = x² − 6x + 5. What is the minimum value of f?',
    choices: ['−5', '−4', '3', '5'], answer: 1,
    explanation: 'The vertex is at x = −b/(2a) = 3. f(3) = 9 − 18 + 5 = −4.',
    desmos: 'Graph y = x²−6x+5 and click the vertex: (3, −4).'
  },
  {
    id: 'sat-m-008', test: 'SAT', section: 'Math', domain: 'Advanced Math', skill: 'Discriminant', difficulty: 'Medium',
    prompt: '2x² − 8x + c = 0, where c is a constant, has exactly one real solution. What is the value of c?',
    choices: null, answer: ['8'],
    explanation: 'Exactly one solution means the discriminant is 0: (−8)² − 4(2)(c) = 64 − 8c = 0, so c = 8.',
    desmos: 'Graph y = 2x²−8x+c with a slider for c. The parabola touches the x-axis exactly once at c = 8.'
  },
  {
    id: 'sat-m-009', test: 'SAT', section: 'Math', domain: 'Advanced Math', skill: 'Quadratic equations', difficulty: 'Medium',
    prompt: 'What is the sum of the solutions to 3x² − 12x − 7 = 0?',
    choices: ['−4', '−7/3', '4', '12'], answer: 2,
    explanation: 'For ax² + bx + c = 0 the sum of the roots is −b/a = 12/3 = 4.',
    desmos: 'Graph y = 3x²−12x−7, click both x-intercepts (≈ −0.52 and ≈ 4.52) and add them: 4.'
  },
  {
    id: 'sat-m-010', test: 'SAT', section: 'Math', domain: 'Advanced Math', skill: 'Exponential models', difficulty: 'Easy',
    prompt: 'A town has 800 residents and its population grows by 5% each year. Which expression gives the population after t years?',
    choices: ['800(0.05)ᵗ', '800(1.5)ᵗ', '800(1.05)ᵗ', '800 + 0.05t'], answer: 2,
    explanation: 'Growth of 5% per year means multiplying by 1 + 0.05 = 1.05 each year.'
  },
  {
    id: 'sat-m-011', test: 'SAT', section: 'Math', domain: 'Advanced Math', skill: 'Function notation', difficulty: 'Easy',
    prompt: 'f(x) = 3 · 2ˣ. What is the value of f(4)?',
    choices: null, answer: ['48'],
    explanation: '2⁴ = 16, and 3 · 16 = 48.'
  },
  {
    id: 'sat-m-012', test: 'SAT', section: 'Math', domain: 'Advanced Math', skill: 'Quadratic regression', difficulty: 'Extreme',
    prompt: 'The graph of y = ax² + bx + c passes through (0, 4), (1, 3), and (3, 7). What is the value of y when x = 5?',
    choices: null, answer: ['19'],
    explanation: 'c = 4. From (1, 3): a + b = −1. From (3, 7): 9a + 3b = 3, so 3a + b = 1. Subtracting gives 2a = 2, so a = 1 and b = −2. Then y(5) = 25 − 10 + 4 = 19.',
    desmos: 'Table: x₁ = 0, 1, 3 and y₁ = 4, 3, 7. Type y₁ ~ a x₁² + b x₁ + c. Desmos returns a = 1, b = −2, c = 4. Then type f(x) = x² − 2x + 4 and evaluate f(5) — or just type a·5²+b·5+c right after the regression.'
  },
  {
    id: 'sat-m-013', test: 'SAT', section: 'Math', domain: 'Advanced Math', skill: 'Discriminant', difficulty: 'Extreme',
    prompt: 'In x² − 2kx + k + 6 = 0, k is a positive constant. The equation has exactly one real solution. What is the value of k?',
    choices: null, answer: ['3'],
    explanation: 'Discriminant = 4k² − 4(k + 6) = 0, so k² − k − 6 = 0 and (k − 3)(k + 2) = 0. Since k > 0, k = 3.',
    desmos: 'Graph y = x² − 2kx + k + 6 with a slider for k and drag until the vertex sits on the x-axis. Faster: graph y = (2x)² − 4(x+6) (the discriminant with k renamed to x) and read the positive zero, x = 3.'
  },
  {
    id: 'sat-m-014', test: 'SAT', section: 'Math', domain: 'Advanced Math', skill: 'Rational expressions', difficulty: 'Easy',
    prompt: 'For x ≠ 3, which expression is equivalent to (x² − 9)/(x − 3)?',
    choices: ['x − 3', 'x + 3', 'x² − 3', 'x + 9'], answer: 1,
    explanation: 'x² − 9 = (x − 3)(x + 3). Cancel the (x − 3).',
    desmos: 'Graph the original and each choice. The one whose graph lies exactly on top is equivalent.'
  },
  {
    id: 'sat-m-015', test: 'SAT', section: 'Math', domain: 'Advanced Math', skill: 'Radical equations', difficulty: 'Hard',
    prompt: 'What is the solution to √(2x + 7) = x + 2?',
    choices: ['−3', '1', '−3 and 1', 'There is no solution'], answer: 1,
    explanation: 'Squaring: 2x + 7 = x² + 4x + 4, so x² + 2x − 3 = 0 and x = 1 or x = −3. Check: x = −3 gives √1 = 1 on the left but −1 on the right, so it is extraneous. Only x = 1 works.',
    desmos: 'Graph y = √(2x+7) and y = x+2. They cross only once, at x = 1 — no extraneous-root checking needed.'
  },
  {
    id: 'sat-m-016', test: 'SAT', section: 'Math', domain: 'Advanced Math', skill: 'Function transformations', difficulty: 'Extreme',
    prompt: 'f(x) = (x − 2)(x + 4) and g(x) = f(x − 3). What is the sum of the zeros of g?',
    choices: null, answer: ['4'],
    explanation: 'The zeros of f are 2 and −4. Replacing x with x − 3 shifts the graph 3 units right, so the zeros of g are 5 and −1. Their sum is 4.',
    desmos: 'Type f(x)=(x−2)(x+4) and then g(x)=f(x−3). Click the x-intercepts of g.'
  },

  /* ───────────── SAT MATH · PROBLEM SOLVING & DATA ANALYSIS ───────────── */
  {
    id: 'sat-m-017', test: 'SAT', section: 'Math', domain: 'Problem Solving & Data Analysis', skill: 'Percentages', difficulty: 'Medium',
    prompt: 'A jacket priced at $80 is discounted by 25%. An 8% sales tax is then applied to the discounted price. What is the final cost, in dollars?',
    choices: ['$60.00', '$63.20', '$64.80', '$66.40'], answer: 2,
    explanation: '80 × 0.75 = 60. Then 60 × 1.08 = 64.80.'
  },
  {
    id: 'sat-m-018', test: 'SAT', section: 'Math', domain: 'Problem Solving & Data Analysis', skill: 'Mean', difficulty: 'Easy',
    prompt: 'The mean of five numbers is 12. Four of the numbers are 10, 14, 9, and 15. What is the fifth number?',
    choices: null, answer: ['12'],
    explanation: 'The total is 5 × 12 = 60. The four known numbers add to 48, so the fifth is 12.'
  },
  {
    id: 'sat-m-019', test: 'SAT', section: 'Math', domain: 'Problem Solving & Data Analysis', skill: 'Unit conversion', difficulty: 'Medium',
    prompt: 'Use 1 mile = 1.6 kilometers. A car travels at 45 miles per hour. What is its speed in kilometers per minute?',
    choices: null, answer: ['1.2', '6/5'],
    explanation: '45 × 1.6 = 72 km per hour. 72 ÷ 60 = 1.2 km per minute.'
  },
  {
    id: 'sat-m-020', test: 'SAT', section: 'Math', domain: 'Problem Solving & Data Analysis', skill: 'Measures of center', difficulty: 'Medium',
    prompt: 'A data set is 3, 7, 7, 9, 14. If the value 14 is replaced with 40, which statement is true?',
    choices: ['Only the mean increases.', 'Only the median increases.', 'Both the mean and median increase.', 'Neither the mean nor the median changes.'], answer: 0,
    explanation: 'The median is the middle value, 7, which does not change. The total grows, so the mean increases.'
  },
  {
    id: 'sat-m-021', test: 'SAT', section: 'Math', domain: 'Problem Solving & Data Analysis', skill: 'Probability', difficulty: 'Easy',
    prompt: 'A bag has 4 red, 6 blue, and 5 green marbles. If one marble is chosen at random, what is the probability that it is NOT blue?',
    choices: ['2/5', '3/5', '1/3', '6/15'], answer: 1,
    explanation: '9 of the 15 marbles are not blue. 9/15 = 3/5.'
  },
  {
    id: 'sat-m-022', test: 'SAT', section: 'Math', domain: 'Problem Solving & Data Analysis', skill: 'Percent change', difficulty: 'Easy',
    prompt: 'The number of members in a club grew from 250 to 310. By what percent did membership increase?',
    choices: ['19.4%', '24%', '60%', '124%'], answer: 1,
    explanation: 'Change ÷ original = 60 ÷ 250 = 0.24, which is 24%.'
  },
  {
    id: 'sat-m-023', test: 'SAT', section: 'Math', domain: 'Problem Solving & Data Analysis', skill: 'Line of best fit', difficulty: 'Medium',
    prompt: 'A scatterplot\'s line of best fit is y = 1.8x + 12. Based on the line, what is the predicted value of y when x = 20?',
    choices: ['36', '44', '48', '52'], answer: 2,
    explanation: '1.8(20) + 12 = 36 + 12 = 48.'
  },

  /* ───────────── SAT MATH · GEOMETRY & TRIGONOMETRY ───────────── */
  {
    id: 'sat-m-024', test: 'SAT', section: 'Math', domain: 'Geometry & Trigonometry', skill: 'Right triangles', difficulty: 'Easy',
    prompt: 'A right triangle has legs of length 9 and 12. What is the length of the hypotenuse?',
    choices: null, answer: ['15'],
    explanation: '9² + 12² = 81 + 144 = 225, and √225 = 15. This is a 3-4-5 triangle scaled by 3.'
  },
  {
    id: 'sat-m-025', test: 'SAT', section: 'Math', domain: 'Geometry & Trigonometry', skill: 'Trigonometric ratios', difficulty: 'Medium',
    prompt: 'In right triangle ABC, angle C is the right angle and sin A = 5/13. What is cos A?',
    choices: ['5/12', '12/13', '13/12', '8/13'], answer: 1,
    explanation: 'Opposite = 5 and hypotenuse = 13, so adjacent = 12 (a 5-12-13 triangle). cos A = 12/13.'
  },
  {
    id: 'sat-m-026', test: 'SAT', section: 'Math', domain: 'Geometry & Trigonometry', skill: 'Circles', difficulty: 'Hard',
    prompt: 'The equation of a circle in the xy-plane is x² + y² − 6x + 8y = 11. What is the radius of the circle?',
    choices: null, answer: ['6'],
    explanation: 'Complete the square: (x − 3)² + (y + 4)² = 11 + 9 + 16 = 36. The radius is √36 = 6.',
    desmos: 'Graph the equation as typed. Click the leftmost and rightmost points (−3, −4) and (9, −4): the diameter is 12, so r = 6.'
  },
  {
    id: 'sat-m-027', test: 'SAT', section: 'Math', domain: 'Geometry & Trigonometry', skill: 'Arc length', difficulty: 'Medium',
    prompt: 'A circle has a radius of 9. What is the length of an arc with a central angle of 2π/3 radians?',
    choices: ['3π', '6π', '9π', '18π'], answer: 1,
    explanation: 'Arc length = rθ = 9 · (2π/3) = 6π.'
  },
  {
    id: 'sat-m-028', test: 'SAT', section: 'Math', domain: 'Geometry & Trigonometry', skill: 'Volume', difficulty: 'Easy',
    prompt: 'A right circular cylinder has a radius of 3 and a height of 10. What is its volume?',
    choices: ['30π', '60π', '90π', '300π'], answer: 2,
    explanation: 'V = πr²h = π(9)(10) = 90π.'
  },
  {
    id: 'sat-m-029', test: 'SAT', section: 'Math', domain: 'Geometry & Trigonometry', skill: 'Complementary angles', difficulty: 'Extreme',
    prompt: 'sin(x°) = cos((3x − 10)°), where 0 < x < 90. What is the value of x?',
    choices: null, answer: ['25'],
    explanation: 'sin θ = cos(90° − θ), so the two angles are complementary: x + (3x − 10) = 90, giving 4x = 100 and x = 25.',
    desmos: 'Switch Desmos to degrees (wrench icon). Graph y = sin(x) − cos(3x−10) and find the zero between 0 and 90: x = 25.'
  },
  {
    id: 'sat-m-030', test: 'SAT', section: 'Math', domain: 'Geometry & Trigonometry', skill: 'Similar figures', difficulty: 'Hard',
    prompt: 'Triangle ABC is similar to triangle DEF, where AB corresponds to DE. AB = 6, DE = 15, and the area of triangle ABC is 20. What is the area of triangle DEF?',
    choices: ['50', '75', '100', '125'], answer: 3,
    explanation: 'The scale factor is 15/6 = 2.5. Areas scale by the square of that factor: 20 × 6.25 = 125.'
  },

  /* ───────────── SAT READING & WRITING ───────────── */
  {
    id: 'sat-rw-001', test: 'SAT', section: 'Reading & Writing', domain: 'Standard English Conventions', skill: 'Boundaries', difficulty: 'Medium',
    prompt: 'The researchers collected water samples from three nearby ______ showed elevated levels of nitrogen.\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?',
    choices: ['lakes, each', 'lakes; each', 'lakes each', 'lakes, and, each'], answer: 1,
    explanation: 'Both sides are independent clauses. A semicolon can join them. A comma alone would create a comma splice.'
  },
  {
    id: 'sat-rw-002', test: 'SAT', section: 'Reading & Writing', domain: 'Standard English Conventions', skill: 'Subject-verb agreement', difficulty: 'Easy',
    prompt: 'The collection of rare manuscripts ______ housed in the east wing of the university library.\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?',
    choices: ['is', 'are', 'were', 'have been'], answer: 0,
    explanation: 'The subject is "collection" (singular). "of rare manuscripts" is a prepositional phrase and does not change the subject.'
  },
  {
    id: 'sat-rw-003', test: 'SAT', section: 'Reading & Writing', domain: 'Expression of Ideas', skill: 'Transitions', difficulty: 'Easy',
    prompt: 'Early studies suggested that the medication had no significant side effects. ______ later trials involving larger groups of patients revealed several rare but serious reactions.\n\nWhich choice completes the text with the most logical transition?',
    choices: ['Similarly,', 'However,', 'For example,', 'In addition,'], answer: 1,
    explanation: 'The later trials contradict the early studies, so a contrast transition is needed.'
  },
  {
    id: 'sat-rw-004', test: 'SAT', section: 'Reading & Writing', domain: 'Expression of Ideas', skill: 'Transitions', difficulty: 'Medium',
    prompt: 'Honeybees share the location of food sources through a movement called the "waggle dance." ______ the angle of the dance relative to vertical indicates the direction of the food relative to the sun.\n\nWhich choice completes the text with the most logical transition?',
    choices: ['Nevertheless,', 'Specifically,', 'Consequently,', 'Instead,'], answer: 1,
    explanation: 'The second sentence gives a specific detail about how the dance communicates location.'
  },
  {
    id: 'sat-rw-005', test: 'SAT', section: 'Reading & Writing', domain: 'Craft and Structure', skill: 'Words in context', difficulty: 'Medium',
    prompt: 'Although the critic\'s review of the film was largely positive, her praise was ______ by a few pointed remarks about its uneven pacing.\n\nWhich choice completes the text with the most logical and precise word or phrase?',
    choices: ['tempered', 'bolstered', 'preceded', 'mirrored'], answer: 0,
    explanation: '"Although" signals contrast. The negative remarks moderated (tempered) the praise.'
  },
  {
    id: 'sat-rw-006', test: 'SAT', section: 'Reading & Writing', domain: 'Craft and Structure', skill: 'Words in context', difficulty: 'Hard',
    prompt: 'The architect\'s design was notably ______: it favored clean lines, unpainted concrete, and bare surfaces over any form of ornamentation.\n\nWhich choice completes the text with the most logical and precise word or phrase?',
    choices: ['austere', 'ornate', 'haphazard', 'whimsical'], answer: 0,
    explanation: '"Austere" means severely plain. The colon introduces evidence of plainness.'
  },
  {
    id: 'sat-rw-007', test: 'SAT', section: 'Reading & Writing', domain: 'Standard English Conventions', skill: 'Possessives', difficulty: 'Medium',
    prompt: 'After weeks of negotiation, the three ______ proposals were finally submitted to the city council for review.\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?',
    choices: ['companies', 'company\'s', 'companies\'', 'companys\''], answer: 2,
    explanation: 'The proposals belong to three companies, which calls for a plural possessive: companies\'.'
  },
  {
    id: 'sat-rw-008', test: 'SAT', section: 'Reading & Writing', domain: 'Information and Ideas', skill: 'Central ideas', difficulty: 'Medium',
    passage: 'Urban planners once assumed that widening highways would reduce traffic congestion. However, studies spanning several decades have found that newly added lanes tend to fill with additional drivers within a few years, a phenomenon known as induced demand. As a result, many cities have shifted investment toward public transit and bicycle infrastructure.',
    prompt: 'Which choice best states the main idea of the text?',
    choices: [
      'Public transit is more popular than driving in most cities.',
      'Widening highways often fails to reduce congestion over time, leading cities to pursue alternatives.',
      'Urban planners have always opposed highway construction.',
      'Induced demand is caused primarily by bicycle infrastructure.'
    ], answer: 1,
    explanation: 'The text describes the old assumption, the evidence against it (induced demand), and the cities\' response.'
  },
  {
    id: 'sat-rw-009', test: 'SAT', section: 'Reading & Writing', domain: 'Information and Ideas', skill: 'Inferences', difficulty: 'Hard',
    passage: 'Sea otters feed heavily on sea urchins, which in turn graze on kelp. In coastal areas where otter populations declined sharply during the twentieth century, researchers observed urchin populations surge and kelp forests shrink dramatically. This suggests that ______',
    prompt: 'Which choice most logically completes the text?',
    choices: [
      'kelp forests are the primary food source for sea otters.',
      'sea urchins cannot survive in areas with kelp forests.',
      'sea otters indirectly help maintain kelp forests by limiting urchin populations.',
      'the decline in otters was caused by the shrinking of kelp forests.'
    ], answer: 2,
    explanation: 'Fewer otters led to more urchins, which led to less kelp, so otters indirectly protect kelp. D reverses cause and effect.'
  },
  {
    id: 'sat-rw-010', test: 'SAT', section: 'Reading & Writing', domain: 'Standard English Conventions', skill: 'Modifiers', difficulty: 'Hard',
    prompt: 'Walking into the natural history museum for the first time, ______\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?',
    choices: [
      'the enormous dinosaur skeleton immediately caught Maya\'s attention.',
      'Maya\'s attention was immediately caught by the enormous dinosaur skeleton.',
      'Maya immediately noticed the enormous dinosaur skeleton.',
      'there was an enormous dinosaur skeleton that Maya immediately noticed.'
    ], answer: 2,
    explanation: 'The introductory phrase describes the person walking in, so "Maya" must come right after the comma. A, B, and D are dangling modifiers.'
  },
  {
    id: 'sat-rw-011', test: 'SAT', section: 'Reading & Writing', domain: 'Craft and Structure', skill: 'Text structure and purpose', difficulty: 'Extreme',
    passage: 'For centuries, historians treated the medieval period as an era of scientific stagnation. Yet surviving records from monasteries and universities reveal careful astronomical observations, refinements to mechanical clocks, and debates over motion that anticipated later physics. Some scholars now argue that the "Dark Ages" label says more about the priorities of later writers than about the period itself.',
    prompt: 'Which choice best describes the function of the final sentence in the overall structure of the text?',
    choices: [
      'It introduces a new line of evidence that contradicts the records mentioned earlier.',
      'It offers an interpretation that accounts for the discrepancy between the traditional view and the evidence.',
      'It concedes that the traditional view of the period is largely accurate.',
      'It summarizes the specific scientific achievements of medieval scholars.'
    ], answer: 1,
    explanation: 'The text presents a traditional view, then evidence against it. The last sentence explains why the traditional label existed despite that evidence.'
  },
  {
    id: 'sat-rw-012', test: 'SAT', section: 'Reading & Writing', domain: 'Expression of Ideas', skill: 'Rhetorical synthesis', difficulty: 'Hard',
    passage: 'While researching a topic, a student has taken the following notes:\n• The Great Wall of China and Hadrian\'s Wall were both built as defensive barriers.\n• Hadrian\'s Wall, in Britain, is about 73 miles long.\n• The Great Wall\'s various sections total more than 13,000 miles.\n• Hadrian\'s Wall was completed around 128 CE.',
    prompt: 'The student wants to emphasize a difference in scale between the two walls. Which choice most effectively uses relevant information from the notes to accomplish this goal?',
    choices: [
      'Both the Great Wall of China and Hadrian\'s Wall were built as defensive barriers.',
      'Hadrian\'s Wall, completed around 128 CE, is located in Britain.',
      'While Hadrian\'s Wall stretches about 73 miles, the Great Wall\'s sections total more than 13,000 miles.',
      'The Great Wall of China is a famous defensive barrier.'
    ], answer: 2,
    explanation: 'Only C compares the lengths of the two walls, which shows the difference in scale.'
  },

  /* ───────────── ACT ENGLISH ───────────── */
  {
    id: 'act-e-001', test: 'ACT', section: 'English', domain: 'Conventions of Standard English', skill: 'Pronouns', difficulty: 'Easy',
    prompt: 'The software company updated [its] privacy policy last week.\n\nWhich choice is correct for the bracketed word?',
    choices: ['NO CHANGE', 'it\'s', 'their', 'its\''], answer: 0,
    explanation: '"Its" is the possessive pronoun. "It\'s" means "it is," and a single company takes a singular pronoun.'
  },
  {
    id: 'act-e-002', test: 'ACT', section: 'English', domain: 'Production of Writing', skill: 'Redundancy', difficulty: 'Medium',
    prompt: 'Because of the storm, the meeting was [postponed until later at a future date.]\n\nWhich choice is best for the bracketed portion?',
    choices: ['NO CHANGE', 'postponed until later.', 'postponed.', 'postponed until a later future date.'], answer: 2,
    explanation: '"Postponed" already means moved to a later time. On the ACT the shortest grammatically correct choice that keeps the meaning is usually right.'
  },
  {
    id: 'act-e-003', test: 'ACT', section: 'English', domain: 'Conventions of Standard English', skill: 'Nonessential clauses', difficulty: 'Medium',
    prompt: 'Which sentence is punctuated correctly?',
    choices: [
      'My sister who lives in Denver, is a nurse.',
      'My sister, who lives in Denver, is a nurse.',
      'My sister, who lives in Denver is a nurse.',
      'My sister who, lives in Denver, is a nurse.'
    ], answer: 1,
    explanation: 'A nonessential clause needs a comma on both sides.'
  },
  {
    id: 'act-e-004', test: 'ACT', section: 'English', domain: 'Conventions of Standard English', skill: 'Collective nouns', difficulty: 'Easy',
    prompt: 'After the final whistle, the team celebrated [their] hard-won championship.\n\nWhich choice is best for the bracketed word?',
    choices: ['NO CHANGE', 'its', 'it\'s', 'there'], answer: 1,
    explanation: 'On the ACT, "team" acting as one unit is singular, so it takes "its."'
  },
  {
    id: 'act-e-005', test: 'ACT', section: 'English', domain: 'Knowledge of Language', skill: 'Word choice', difficulty: 'Hard',
    prompt: 'The new policy will [effect] every employee who works remotely.\n\nWhich choice is best for the bracketed word?',
    choices: ['NO CHANGE', 'affect', 'infect', 'effects'], answer: 1,
    explanation: '"Affect" is usually the verb meaning to influence. "Effect" is usually a noun meaning result.'
  },

  /* ───────────── ACT MATH ───────────── */
  {
    id: 'act-m-001', test: 'ACT', section: 'Math', domain: 'Algebra', skill: 'Exponents', difficulty: 'Easy',
    prompt: 'If 2^(x+1) = 32, what is x?',
    choices: ['3', '4', '5', '16', '31'], answer: 1,
    explanation: '32 = 2⁵, so x + 1 = 5 and x = 4.'
  },
  {
    id: 'act-m-002', test: 'ACT', section: 'Math', domain: 'Functions', skill: 'Logarithms', difficulty: 'Medium',
    prompt: 'What is the value of log₂ 64?',
    choices: ['5', '6', '8', '32', '128'], answer: 1,
    explanation: '2⁶ = 64, so log₂ 64 = 6.'
  },
  {
    id: 'act-m-003', test: 'ACT', section: 'Math', domain: 'Number & Quantity', skill: 'Rates', difficulty: 'Hard',
    prompt: 'A driver travels 120 miles at 40 mph and returns the same 120 miles at 60 mph. What is the average speed for the round trip, in mph?',
    choices: ['45', '48', '50', '52', '55'], answer: 1,
    explanation: 'Time = 3 h + 2 h = 5 h. Total distance = 240 mi. Average speed = 240/5 = 48 mph, not the simple average of 50.'
  },
  {
    id: 'act-m-004', test: 'ACT', section: 'Math', domain: 'Number & Quantity', skill: 'Complex numbers', difficulty: 'Medium',
    prompt: 'Given i² = −1, what is (3 + 2i)(1 − i)?',
    choices: ['3 − 2i', '5 − i', '1 − i', '5 + i', '3 + 2i²'], answer: 1,
    explanation: '3 − 3i + 2i − 2i² = 3 − i + 2 = 5 − i.'
  },
  {
    id: 'act-m-005', test: 'ACT', section: 'Math', domain: 'Algebra', skill: 'Arithmetic sequences', difficulty: 'Extreme',
    prompt: 'The first term of an arithmetic sequence is 7 and the 10th term is 34. What is the sum of the first 10 terms?',
    choices: ['164', '205', '246', '340', '410'], answer: 1,
    explanation: 'Sum = n(first + last)/2 = 10(7 + 34)/2 = 205.'
  },
  {
    id: 'act-m-006', test: 'ACT', section: 'Math', domain: 'Functions', skill: 'Trig graphs', difficulty: 'Hard',
    prompt: 'What is the period of y = 3 sin(4x)?',
    choices: ['π/4', 'π/2', 'π', '2π', '8π'], answer: 1,
    explanation: 'The period of sin(bx) is 2π/b = 2π/4 = π/2.',
    desmos: 'Graph y = 3sin(4x) and click two consecutive peaks: they are about 1.571 (π/2) apart.'
  },
  {
    id: 'act-m-007', test: 'ACT', section: 'Math', domain: 'Statistics & Probability', skill: 'Probability', difficulty: 'Medium',
    prompt: 'Two fair six-sided dice are rolled. What is the probability that the sum is 7?',
    choices: ['1/12', '1/9', '1/6', '7/36', '1/3'], answer: 2,
    explanation: '6 of the 36 outcomes sum to 7: (1,6), (2,5), (3,4), (4,3), (5,2), (6,1). 6/36 = 1/6.'
  },
  {
    id: 'act-m-008', test: 'ACT', section: 'Math', domain: 'Geometry', skill: 'Coordinate geometry', difficulty: 'Medium',
    prompt: 'What is the distance between (−1, 2) and (5, 10) in the standard (x, y) coordinate plane?',
    choices: ['8', '10', '12', '14', '√28'], answer: 1,
    explanation: '√(6² + 8²) = √100 = 10.'
  },

  /* ───────────── ACT SCIENCE ───────────── */
  {
    id: 'act-s-001', test: 'ACT', section: 'Science', domain: 'Interpretation of Data', skill: 'Interpolation', difficulty: 'Easy',
    passage: 'A table shows dissolved oxygen in fresh water at different temperatures:\n10°C → 11.3 mg/L\n20°C → 9.1 mg/L\n30°C → 7.6 mg/L',
    prompt: 'Based on the table, the dissolved oxygen at 25°C is most likely closest to:',
    choices: ['7.0 mg/L', '8.3 mg/L', '9.5 mg/L', '10.2 mg/L'], answer: 1,
    explanation: '25°C lies between 20°C and 30°C, so the value should be between 9.1 and 7.6. Only 8.3 fits.'
  },
  {
    id: 'act-s-002', test: 'ACT', section: 'Science', domain: 'Scientific Investigation', skill: 'Variables', difficulty: 'Easy',
    passage: 'Students released the same toy car from ramps of heights 10 cm, 20 cm, and 30 cm and measured how far it rolled on the same carpet after leaving each ramp.',
    prompt: 'What was the independent variable in this experiment?',
    choices: ['Distance rolled', 'Ramp height', 'Type of car', 'Carpet surface'], answer: 1,
    explanation: 'The students deliberately changed the ramp height. Distance was measured (dependent), and the car and surface were held constant.'
  },
  {
    id: 'act-s-003', test: 'ACT', section: 'Science', domain: 'Evaluation of Models', skill: 'Predictions', difficulty: 'Medium',
    passage: 'In the ramp experiment, the car rolled 45 cm from the 10 cm ramp, 92 cm from the 20 cm ramp, and 138 cm from the 30 cm ramp.',
    prompt: 'If the trend continues, the distance from a 40 cm ramp would most likely be:',
    choices: ['Less than 45 cm', 'Between 92 cm and 138 cm', 'About 184 cm', 'About 276 cm'], answer: 2,
    explanation: 'Each extra 10 cm of height adds about 46 cm of distance. 138 + 46 ≈ 184.',
    desmos: 'Table x₁ = 10, 20, 30 and y₁ = 45, 92, 138. Run y₁ ~ m x₁ + b, then evaluate m·40 + b ≈ 184.'
  },
  {
    id: 'act-s-004', test: 'ACT', section: 'Science', domain: 'Evaluation of Models', skill: 'Conflicting viewpoints', difficulty: 'Hard',
    passage: 'Scientist 1: The moon formed when a Mars-sized body collided with the early Earth, ejecting material that coalesced in orbit.\nScientist 2: The moon formed elsewhere in the solar system and was later captured by Earth\'s gravity.',
    prompt: 'Which finding would most strongly support Scientist 1 over Scientist 2?',
    choices: [
      'Moon rocks have oxygen isotope ratios nearly identical to Earth rocks.',
      'Moon rocks contain minerals found nowhere on Earth.',
      'The moon is slowly moving away from Earth.',
      'Other planets have moons.'
    ], answer: 0,
    explanation: 'Matching isotopes suggest the moon and Earth share a common origin, which fits the collision (giant-impact) model rather than capture.'
  },

  /* ───────────── ACT READING ───────────── */
  {
    id: 'act-r-001', test: 'ACT', section: 'Reading', domain: 'Key Ideas & Details', skill: 'Inference', difficulty: 'Medium',
    passage: 'Nora had rehearsed the speech so many times that the words had lost their shape, becoming a string of sounds she could recite while thinking about anything else. Yet when she stepped to the podium and saw her grandfather in the third row, his hat folded carefully in his lap, the sentences suddenly meant something again.',
    prompt: 'The passage most strongly suggests that seeing her grandfather caused Nora to:',
    choices: [
      'forget the words of her speech.',
      'reconnect with the meaning of what she was saying.',
      'feel embarrassed about her preparation.',
      'decide to change her speech entirely.'
    ], answer: 1,
    explanation: 'Before, the words had "lost their shape." After she saw him, "the sentences suddenly meant something again."'
  },
  {
    id: 'act-r-002', test: 'ACT', section: 'Reading', domain: 'Craft & Structure', skill: 'Word meaning', difficulty: 'Easy',
    passage: 'The old lighthouse keeper was a taciturn man; visitors who hoped for stories about shipwrecks usually left with little more than a nod.',
    prompt: 'As used in the passage, "taciturn" most nearly means:',
    choices: ['cheerful', 'reserved', 'forgetful', 'hostile'], answer: 1,
    explanation: 'Visitors got "little more than a nod," so he said very little. He was reserved.'
  }
];
