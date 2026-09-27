/* OpenScore question bank, part 2. Same schema as data-questions.js. */
(function () {
  const ELENA = 'For twenty years, Elena\'s bakery opened at five in the morning, before the streetlights switched off. Regulars knew the rhythm: the rattle of the metal shutter, the first tray of conchas sliding onto the counter, Elena\'s brisk "Buenos días" that sounded less like a greeting than a starting pistol. When a chain coffee shop opened across the street, her nephew urged her to add espresso drinks and free wi-fi. Elena only shrugged. "People don\'t come here for the coffee," she said, dusting flour from her hands. "They come because at five o\'clock, the lights are on."';
  const ENZYME = 'Researchers measured the activity of an enzyme (in units) at different temperatures:\n20°C → 15\n30°C → 40\n37°C → 55\n45°C → 30\n60°C → 2';
  const PLANTS = 'Bean plants were given different amounts of fertilizer per week. Average height after 4 weeks:\n0 g → 12 cm\n5 g → 18 cm\n10 g → 22 cm\n15 g → 21 cm\nAll other conditions (light, water, soil, temperature) were identical.';

  window.QUESTIONS.push(
    /* ───────────── SAT READING & WRITING ───────────── */
    {
      id: 'sat-rw-013', test: 'SAT', section: 'Reading & Writing', domain: 'Standard English Conventions', skill: 'Boundaries', difficulty: 'Medium',
      prompt: 'The museum\'s newest exhibit features artifacts from three ancient ______ Egypt, Mesopotamia, and the Indus Valley.\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?',
      choices: ['civilizations:', 'civilizations;', 'civilizations,', 'civilizations'], answer: 0,
      explanation: 'A complete sentence introduces a list, so a colon is correct. A semicolon needs an independent clause on both sides.'
    },
    {
      id: 'sat-rw-014', test: 'SAT', section: 'Reading & Writing', domain: 'Standard English Conventions', skill: 'Boundaries', difficulty: 'Hard',
      prompt: 'Marie Curie—the first person to win Nobel Prizes in two different ______ conducted pioneering research on radioactivity.\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?',
      choices: ['sciences—', 'sciences,', 'sciences;', 'sciences'], answer: 0,
      explanation: 'The interrupting phrase opens with a dash, so it must close with a dash. Punctuation around a nonessential element must match.'
    },
    {
      id: 'sat-rw-015', test: 'SAT', section: 'Reading & Writing', domain: 'Standard English Conventions', skill: 'Verb tense', difficulty: 'Medium',
      prompt: 'By the time the rescue team reached the canyon, the stranded hikers ______ for nearly two days.\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?',
      choices: ['wait', 'will have waited', 'had been waiting', 'are waiting'], answer: 2,
      explanation: 'The waiting happened before another past event (the team arriving), so the past perfect progressive "had been waiting" is correct.'
    },
    {
      id: 'sat-rw-016', test: 'SAT', section: 'Reading & Writing', domain: 'Standard English Conventions', skill: 'Pronoun agreement', difficulty: 'Easy',
      prompt: 'The novel\'s characters are complex, and readers often find ______ motivations difficult to predict.\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?',
      choices: ['its', 'their', 'it\'s', 'they\'re'], answer: 1,
      explanation: 'The pronoun refers to the plural "characters" and shows possession, so "their" is correct.'
    },
    {
      id: 'sat-rw-017', test: 'SAT', section: 'Reading & Writing', domain: 'Standard English Conventions', skill: 'Subject-verb agreement', difficulty: 'Medium',
      prompt: 'Each of the paintings in the gallery\'s permanent collection ______ been carefully restored by the conservation team.\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?',
      choices: ['have', 'has', 'were', 'are'], answer: 1,
      explanation: 'The subject is "Each," which is singular. "of the paintings in the gallery\'s permanent collection" is an interrupting phrase.'
    },
    {
      id: 'sat-rw-018', test: 'SAT', section: 'Reading & Writing', domain: 'Standard English Conventions', skill: 'Possessives', difficulty: 'Medium',
      prompt: 'Park rangers reported that both ______ nests had been damaged in the storm.\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?',
      choices: ['eagle\'s', 'eagles', 'eagles\'', 'eagles\'s'], answer: 2,
      explanation: '"Both" means two eagles, so the plural possessive "eagles\'" is needed.'
    },
    {
      id: 'sat-rw-019', test: 'SAT', section: 'Reading & Writing', domain: 'Expression of Ideas', skill: 'Transitions', difficulty: 'Easy',
      prompt: 'The city\'s population declined steadily for four decades. ______ new housing developments have attracted thousands of residents in the last five years.\n\nWhich choice completes the text with the most logical transition?',
      choices: ['Recently, however,', 'Therefore,', 'For instance,', 'Likewise,'], answer: 0,
      explanation: 'The recent growth contrasts with the long decline, so a contrast word is needed.'
    },
    {
      id: 'sat-rw-020', test: 'SAT', section: 'Reading & Writing', domain: 'Expression of Ideas', skill: 'Transitions', difficulty: 'Easy',
      prompt: 'Octopuses can change the color of their skin in milliseconds. ______ they can alter its texture to mimic rocks, coral, or seaweed.\n\nWhich choice completes the text with the most logical transition?',
      choices: ['Nevertheless,', 'Moreover,', 'Instead,', 'In other words,'], answer: 1,
      explanation: 'The second sentence adds another camouflage ability, so a continuation transition fits.'
    },
    {
      id: 'sat-rw-021', test: 'SAT', section: 'Reading & Writing', domain: 'Expression of Ideas', skill: 'Transitions', difficulty: 'Medium',
      prompt: 'The bridge\'s original design did not account for strong crosswinds. ______ engineers had to add stabilizing cables two years after construction was completed.\n\nWhich choice completes the text with the most logical transition?',
      choices: ['Similarly,', 'As a result,', 'Nonetheless,', 'For example,'], answer: 1,
      explanation: 'The design flaw caused the need for cables, which is a cause-and-effect relationship.'
    },
    {
      id: 'sat-rw-022', test: 'SAT', section: 'Reading & Writing', domain: 'Craft and Structure', skill: 'Words in context', difficulty: 'Medium',
      prompt: 'The physicist\'s findings were initially met with ______: many colleagues doubted that such a small change in temperature could produce such dramatic effects.\n\nWhich choice completes the text with the most logical and precise word or phrase?',
      choices: ['skepticism', 'enthusiasm', 'indifference', 'reverence'], answer: 0,
      explanation: 'The colon explains that colleagues "doubted" the findings, which is skepticism.'
    },
    {
      id: 'sat-rw-023', test: 'SAT', section: 'Reading & Writing', domain: 'Craft and Structure', skill: 'Words in context', difficulty: 'Hard',
      prompt: 'Rather than presenting a single ______ argument, the essay explores several competing interpretations of the poem without declaring any one of them correct.\n\nWhich choice completes the text with the most logical and precise word or phrase?',
      choices: ['definitive', 'tentative', 'ambiguous', 'redundant'], answer: 0,
      explanation: '"Rather than" sets up a contrast with an essay that does not settle on one answer. The opposite of that is a definitive (conclusive) argument.'
    },
    {
      id: 'sat-rw-024', test: 'SAT', section: 'Reading & Writing', domain: 'Craft and Structure', skill: 'Words in context', difficulty: 'Medium',
      prompt: 'The drought\'s effects were ______: crops failed in every county of the region, and reservoirs throughout the state fell to record lows.\n\nWhich choice completes the text with the most logical and precise word or phrase?',
      choices: ['negligible', 'pervasive', 'fleeting', 'dubious'], answer: 1,
      explanation: 'Effects in "every county" and "throughout the state" are widespread, which is pervasive.'
    },
    {
      id: 'sat-rw-025', test: 'SAT', section: 'Reading & Writing', domain: 'Craft and Structure', skill: 'Words in context', difficulty: 'Extreme',
      prompt: 'Although often dismissed as merely decorative, the geometric patterns on the ancient pottery were, researchers now argue, anything but ______: each design encoded information about the village in which the vessel was made.\n\nWhich choice completes the text with the most logical and precise word or phrase?',
      choices: ['arbitrary', 'intricate', 'symbolic', 'deliberate'], answer: 0,
      explanation: '"Anything but ___" means the patterns were the opposite of the blank. They carried meaning, so they were not arbitrary. C and D describe what the patterns are, so "anything but symbolic" would reverse the meaning.'
    },
    {
      id: 'sat-rw-026', test: 'SAT', section: 'Reading & Writing', domain: 'Information and Ideas', skill: 'Central ideas', difficulty: 'Medium',
      passage: 'Beneath many forest floors, threadlike fungal networks connect the roots of neighboring trees. Through these networks, trees can exchange water, carbon, and nutrients. Some studies suggest that large, older trees may even transfer resources to younger seedlings growing in deep shade, where sunlight is too limited for the seedlings to produce enough food on their own.',
      prompt: 'Which choice best states the main idea of the text?',
      choices: [
        'Fungal networks allow trees to share resources, possibly including older trees supporting shaded seedlings.',
        'Seedlings in deep shade cannot survive without sunlight.',
        'Older trees compete aggressively with seedlings for nutrients.',
        'Fungi harm trees by stealing water and carbon from their roots.'
      ], answer: 0,
      explanation: 'The text is about the resource-sharing networks. The seedling example supports that idea.'
    },
    {
      id: 'sat-rw-027', test: 'SAT', section: 'Reading & Writing', domain: 'Information and Ideas', skill: 'Command of evidence (quantitative)', difficulty: 'Medium',
      passage: 'In a survey of 500 high school students, 62% of those who studied at least 30 minutes per day improved their test scores over one semester, compared with 28% of those who studied less than 30 minutes per day.',
      prompt: 'Which choice most effectively uses data from the survey to complete the statement? "The survey suggests that daily study time ______"',
      choices: [
        'is associated with score improvement, since a much higher percentage of students who studied at least 30 minutes a day improved.',
        'guarantees score improvement, since every student who studied improved.',
        'has no relationship with scores, since some students in both groups improved.',
        'matters less than sleep, since 28% of students improved without studying.'
      ], answer: 0,
      explanation: '62% vs. 28% shows an association. B overstates (not every student improved), and D brings in sleep, which the data never mention.'
    },
    {
      id: 'sat-rw-028', test: 'SAT', section: 'Reading & Writing', domain: 'Information and Ideas', skill: 'Command of evidence (textual)', difficulty: 'Easy',
      prompt: 'A student claims that the narrator of a short story feels isolated despite living in a crowded city. Which quotation from the story most effectively illustrates this claim?',
      choices: [
        '"Thousands passed me each morning on the avenue, yet not one face ever turned toward mine."',
        '"The city\'s lights glittered along the river like scattered coins."',
        '"I found a small apartment three blocks from the train station."',
        '"The subway ran every six minutes, even on Sundays."'
      ], answer: 0,
      explanation: 'Choice A shows both the crowd ("thousands") and the isolation ("not one face turned toward mine").'
    },
    {
      id: 'sat-rw-029', test: 'SAT', section: 'Reading & Writing', domain: 'Craft and Structure', skill: 'Text structure and purpose', difficulty: 'Hard',
      passage: 'Today\'s debates about the internet\'s effect on attention are not new. When the printing press spread across Europe in the fifteenth century, some scholars worried that an overwhelming abundance of books would distract readers and weaken memory. Such concerns, it seems, tend to accompany any technology that dramatically changes how information flows.',
      prompt: 'The author mentions the printing press primarily to',
      choices: [
        'argue that the printing press harmed readers\' memories.',
        'provide a historical example showing that worries about new information technologies have precedent.',
        'suggest that the internet is less significant than the printing press.',
        'explain how books were produced in fifteenth-century Europe.'
      ], answer: 1,
      explanation: 'The printing press example supports the claim that such debates "are not new."'
    },
    {
      id: 'sat-rw-030', test: 'SAT', section: 'Reading & Writing', domain: 'Craft and Structure', skill: 'Cross-text connections', difficulty: 'Hard',
      passage: 'Text 1: Some economists argue that raising the minimum wage causes employers to hire fewer workers, because labor becomes more expensive.\n\nText 2: A study comparing pairs of neighboring counties found that when one county raised its minimum wage, its employment did not fall relative to the neighboring county that kept the lower wage.',
      prompt: 'Based on the texts, how would the author of Text 2 most likely respond to the claim in Text 1?',
      choices: [
        'By agreeing that higher wages always reduce employment.',
        'By noting that evidence from direct comparisons does not show the predicted decline in employment.',
        'By arguing that economists should not study minimum wage policy.',
        'By claiming that neighboring counties always have identical economies.'
      ], answer: 1,
      explanation: 'Text 2\'s study found no employment decline, which challenges Text 1\'s prediction.'
    },
    {
      id: 'sat-rw-031', test: 'SAT', section: 'Reading & Writing', domain: 'Expression of Ideas', skill: 'Rhetorical synthesis', difficulty: 'Medium',
      passage: 'While researching a topic, a student has taken the following notes:\n• Katherine Johnson was a mathematician who worked at NASA.\n• She calculated orbital trajectories for John Glenn\'s 1962 flight.\n• Glenn reportedly asked that Johnson personally verify the computer\'s calculations.\n• She received the Presidential Medal of Freedom in 2015.',
      prompt: 'The student wants to introduce Katherine Johnson to an audience unfamiliar with her. Which choice most effectively uses relevant information from the notes to accomplish this goal?',
      choices: [
        'Katherine Johnson, a NASA mathematician, calculated the orbital trajectories for John Glenn\'s 1962 flight.',
        'In 2015, she received the Presidential Medal of Freedom.',
        'John Glenn\'s 1962 flight required orbital calculations.',
        'Computers were used at NASA in 1962.'
      ], answer: 0,
      explanation: 'An introduction should say who she is and why she matters. Only A does both, and B uses "she" with no introduction.'
    },
    {
      id: 'sat-rw-032', test: 'SAT', section: 'Reading & Writing', domain: 'Standard English Conventions', skill: 'Modifiers', difficulty: 'Medium',
      prompt: 'Known for its vibrant murals and independent galleries, ______\n\nWhich choice completes the text so that it conforms to the conventions of Standard English?',
      choices: [
        'artists from around the world are attracted to the neighborhood.',
        'the neighborhood attracts artists from around the world.',
        'many artists move to the neighborhood from around the world.',
        'there are artists from around the world in the neighborhood.'
      ], answer: 1,
      explanation: 'The neighborhood is what is "known for its vibrant murals," so it must come right after the comma.'
    },

    /* ───────────── SAT MATH ───────────── */
    {
      id: 'sat-m-031', test: 'SAT', section: 'Math', domain: 'Algebra', skill: 'Linear equations in one variable', difficulty: 'Easy',
      prompt: 'If 2(x − 3) = 5x + 9, what is the value of x?',
      choices: null, answer: ['-5'],
      explanation: '2x − 6 = 5x + 9, so −3x = 15 and x = −5.',
      desmos: 'Graph y = 2(x−3) and y = 5x+9. They intersect at x = −5.'
    },
    {
      id: 'sat-m-032', test: 'SAT', section: 'Math', domain: 'Algebra', skill: 'Infinitely many solutions', difficulty: 'Medium',
      prompt: 'In the equation 3(2x + k) = 6x + 12, k is a constant. For what value of k does the equation have infinitely many solutions?',
      choices: null, answer: ['4'],
      explanation: 'Expanding gives 6x + 3k = 6x + 12. Both sides are identical when 3k = 12, so k = 4.',
      desmos: 'Graph y = 3(2x+k) and y = 6x+12 with a slider for k. The lines overlap completely at k = 4.'
    },
    {
      id: 'sat-m-033', test: 'SAT', section: 'Math', domain: 'Algebra', skill: 'Systems word problems', difficulty: 'Medium',
      prompt: 'A theater sells adult tickets for $12 and child tickets for $7. On one night it sold 40 tickets for a total of $380. How many adult tickets were sold?',
      choices: null, answer: ['20'],
      explanation: 'a + c = 40 and 12a + 7c = 380. Substituting c = 40 − a: 12a + 280 − 7a = 380, so 5a = 100 and a = 20.',
      desmos: 'Graph x + y = 40 and 12x + 7y = 380 and click the intersection: (20, 20).'
    },
    {
      id: 'sat-m-034', test: 'SAT', section: 'Math', domain: 'Advanced Math', skill: 'Difference of squares', difficulty: 'Medium',
      prompt: 'If x² − y² = 48 and x + y = 8, what is the value of x − y?',
      choices: null, answer: ['6'],
      explanation: 'x² − y² = (x + y)(x − y), so 48 = 8(x − y) and x − y = 6.'
    },
    {
      id: 'sat-m-035', test: 'SAT', section: 'Math', domain: 'Advanced Math', skill: 'Exponential models', difficulty: 'Easy',
      prompt: 'A car worth $24,000 loses 15% of its value each year. Which function gives its value V, in dollars, after t years?',
      choices: ['V = 24,000(0.15)ᵗ', 'V = 24,000(0.85)ᵗ', 'V = 24,000(1.15)ᵗ', 'V = 24,000 − 0.15t'], answer: 1,
      explanation: 'Losing 15% each year leaves 85%, so the value is multiplied by 0.85 each year.'
    },
    {
      id: 'sat-m-036', test: 'SAT', section: 'Math', domain: 'Advanced Math', skill: 'Quadratic zeros', difficulty: 'Extreme',
      prompt: 'The function f(x) = x² + bx + 12, where b is a negative constant, has two zeros r and s such that r = 3s. What is the value of b?',
      choices: null, answer: ['-8'],
      explanation: 'The product of the zeros is rs = 12, so 3s² = 12 and s = ±2. Since b < 0, the sum of the zeros (−b) must be positive, so s = 2 and r = 6. The sum is 8, so b = −8.',
      desmos: 'Graph y = x² + bx + 12 with a slider for b. At b = −8 the zeros are 2 and 6, and 6 = 3·2.'
    },
    {
      id: 'sat-m-037', test: 'SAT', section: 'Math', domain: 'Advanced Math', skill: 'Rational equations', difficulty: 'Hard',
      prompt: 'What value(s) of x satisfy (x + 3)/(x − 1) = 2/(x − 1) + 1?',
      choices: ['−1', '1', '3', 'There is no solution'], answer: 3,
      explanation: 'Subtract 2/(x − 1): (x + 1)/(x − 1) = 1, so x + 1 = x − 1, which gives 1 = −1. That is impossible, so there is no solution.',
      desmos: 'Graph both sides as separate functions. The two graphs never intersect.'
    },
    {
      id: 'sat-m-038', test: 'SAT', section: 'Math', domain: 'Problem Solving & Data Analysis', skill: 'Sampling', difficulty: 'Easy',
      prompt: 'In a random sample of 400 students at a school, 120 said they prefer online classes. The school has 2,500 students. Based on the sample, about how many students at the school prefer online classes?',
      choices: ['120', '300', '750', '1,200'], answer: 2,
      explanation: '120/400 = 30%, and 30% of 2,500 is 750.'
    },
    {
      id: 'sat-m-039', test: 'SAT', section: 'Math', domain: 'Problem Solving & Data Analysis', skill: 'Margin of error', difficulty: 'Medium',
      prompt: 'A poll estimates that 42% of voters support a proposal, with a margin of error of 3 percentage points. Which conclusion is most appropriate?',
      choices: [
        'Exactly 42% of voters support the proposal.',
        'It is plausible that between 39% and 45% of voters support the proposal.',
        'The proposal will definitely fail.',
        'Between 3% and 42% of voters support the proposal.'
      ], answer: 1,
      explanation: 'A margin of error gives a plausible range: 42 ± 3, so 39% to 45%.'
    },
    {
      id: 'sat-m-040', test: 'SAT', section: 'Math', domain: 'Geometry & Trigonometry', skill: 'Triangle angles', difficulty: 'Easy',
      prompt: 'The angles of a triangle measure 2x°, 3x°, and 4x°. What is the measure, in degrees, of the largest angle?',
      choices: null, answer: ['80'],
      explanation: '9x = 180, so x = 20. The largest angle is 4x = 80°.'
    },
    {
      id: 'sat-m-041', test: 'SAT', section: 'Math', domain: 'Geometry & Trigonometry', skill: 'Inscribed figures', difficulty: 'Hard',
      prompt: 'A square is inscribed in a circle of radius 5. What is the area of the square?',
      choices: null, answer: ['50'],
      explanation: 'The square\'s diagonal equals the circle\'s diameter, 10. For a square, area = d²/2 = 100/2 = 50.'
    },
    {
      id: 'sat-m-042', test: 'SAT', section: 'Math', domain: 'Geometry & Trigonometry', skill: 'Trigonometric ratios', difficulty: 'Medium',
      prompt: 'In a right triangle, tan θ = 3/4 for an acute angle θ. What is sin θ?',
      choices: ['3/4', '3/5', '4/5', '5/3'], answer: 1,
      explanation: 'Opposite 3, adjacent 4, hypotenuse 5 (a 3-4-5 triangle). sin θ = 3/5.'
    },

    /* ───────────── ACT ENGLISH ───────────── */
    {
      id: 'act-e-006', test: 'ACT', section: 'English', domain: 'Conventions of Standard English', skill: 'Apostrophes', difficulty: 'Easy',
      prompt: 'After two years of renovation, the [childrens\'] museum reopened to the public.\n\nWhich choice is best for the bracketed word?',
      choices: ['NO CHANGE', 'children\'s', 'childrens', 'childs\''], answer: 1,
      explanation: '"Children" is already plural, so the possessive is "children\'s."'
    },
    {
      id: 'act-e-007', test: 'ACT', section: 'English', domain: 'Conventions of Standard English', skill: 'Comma splices', difficulty: 'Medium',
      prompt: 'The trail was steep and muddy[, we] kept climbing anyway.\n\nWhich choice is best for the bracketed portion?',
      choices: ['NO CHANGE', ', but we', ' we', ', however we'], answer: 1,
      explanation: 'Two independent clauses need a comma plus a conjunction. "However" is not a conjunction, so D is still a comma splice.'
    },
    {
      id: 'act-e-008', test: 'ACT', section: 'English', domain: 'Conventions of Standard English', skill: 'Subject-verb agreement', difficulty: 'Easy',
      prompt: 'The list of required supplies [are] posted on the class website.\n\nWhich choice is best for the bracketed word?',
      choices: ['NO CHANGE', 'is', 'were', 'have been'], answer: 1,
      explanation: 'The subject is "list" (singular), not "supplies."'
    },
    {
      id: 'act-e-009', test: 'ACT', section: 'English', domain: 'Conventions of Standard English', skill: 'Parallelism', difficulty: 'Medium',
      prompt: 'On weekends, Priya enjoys hiking, swimming, and [to ride] her bike along the river.\n\nWhich choice is best for the bracketed portion?',
      choices: ['NO CHANGE', 'riding', 'she rides', 'rode'], answer: 1,
      explanation: 'Items in a list must be parallel: hiking, swimming, riding.'
    },
    {
      id: 'act-e-010', test: 'ACT', section: 'English', domain: 'Conventions of Standard English', skill: 'Who vs. whom', difficulty: 'Hard',
      prompt: 'The award goes to the student [who] the teachers nominate each spring.\n\nWhich choice is best for the bracketed word?',
      choices: ['NO CHANGE', 'whom', 'whose', 'which'], answer: 1,
      explanation: 'The teachers nominate him or her, so the object form "whom" is correct. Test by substituting "him": if "him" works, use whom.'
    },
    {
      id: 'act-e-011', test: 'ACT', section: 'English', domain: 'Conventions of Standard English', skill: 'Commas in a series', difficulty: 'Medium',
      prompt: 'For the trip I packed snacks[;] water, and a trail map.\n\nWhich choice is best for the bracketed punctuation?',
      choices: ['NO CHANGE', ',', ':', '—and'], answer: 1,
      explanation: 'Items in a simple list are separated by commas.'
    },
    {
      id: 'act-e-012', test: 'ACT', section: 'English', domain: 'Knowledge of Language', skill: 'Idioms', difficulty: 'Medium',
      prompt: 'Maya proved that she was capable [to finish] the project a week early.\n\nWhich choice is best for the bracketed portion?',
      choices: ['NO CHANGE', 'of finishing', 'for finishing', 'at finishing'], answer: 1,
      explanation: 'The idiom is "capable of" followed by a gerund.'
    },
    {
      id: 'act-e-013', test: 'ACT', section: 'English', domain: 'Knowledge of Language', skill: 'Fewer vs. less', difficulty: 'Easy',
      prompt: 'There were [less] students in the cafeteria than usual today.\n\nWhich choice is best for the bracketed word?',
      choices: ['NO CHANGE', 'fewer', 'lesser', 'littler'], answer: 1,
      explanation: 'Use "fewer" for countable nouns (students) and "less" for uncountable ones (water, time).'
    },

    /* ───────────── ACT MATH ───────────── */
    {
      id: 'act-m-009', test: 'ACT', section: 'Math', domain: 'Algebra', skill: 'Slope', difficulty: 'Easy',
      prompt: 'What is the slope of the line 3x − 2y = 8 in the standard (x, y) coordinate plane?',
      choices: ['−3/2', '3/2', '2/3', '−4', '4'], answer: 1,
      explanation: 'Solve for y: y = (3/2)x − 4. The slope is 3/2.'
    },
    {
      id: 'act-m-010', test: 'ACT', section: 'Math', domain: 'Number & Quantity', skill: 'Percents', difficulty: 'Medium',
      prompt: '30% of 80 is what percent of 60?',
      choices: ['24%', '36%', '40%', '45%', '50%'], answer: 2,
      explanation: '30% of 80 is 24, and 24/60 = 0.40, or 40%.'
    },
    {
      id: 'act-m-011', test: 'ACT', section: 'Math', domain: 'Number & Quantity', skill: 'Matrices', difficulty: 'Medium',
      prompt: 'What is the determinant of the matrix [[2, 3], [1, 4]]?',
      choices: ['5', '8', '11', '−5', '10'], answer: 0,
      explanation: 'For [[a, b], [c, d]], det = ad − bc = 2·4 − 3·1 = 5.'
    },
    {
      id: 'act-m-012', test: 'ACT', section: 'Math', domain: 'Functions', skill: 'Logarithms', difficulty: 'Hard',
      prompt: 'If log₃ x + log₃ 9 = 4, what is x?',
      choices: ['3', '9', '27', '36', '81'], answer: 1,
      explanation: 'log₃ 9 = 2, so log₃ x = 2 and x = 3² = 9.'
    },
    {
      id: 'act-m-013', test: 'ACT', section: 'Math', domain: 'Geometry', skill: 'Area', difficulty: 'Easy',
      prompt: 'A trapezoid has bases of 6 and 10 inches and a height of 4 inches. What is its area, in square inches?',
      choices: ['24', '32', '40', '64', '240'], answer: 1,
      explanation: 'Area = ½(b₁ + b₂)h = ½(16)(4) = 32.'
    },
    {
      id: 'act-m-014', test: 'ACT', section: 'Math', domain: 'Geometry', skill: 'Circles', difficulty: 'Easy',
      prompt: 'What is the center of the circle (x + 2)² + (y − 5)² = 49?',
      choices: ['(2, −5)', '(−2, 5)', '(2, 5)', '(−2, −5)', '(7, 7)'], answer: 1,
      explanation: 'In (x − h)² + (y − k)² = r², the center is (h, k). Here h = −2 and k = 5.'
    },
    {
      id: 'act-m-015', test: 'ACT', section: 'Math', domain: 'Functions', skill: 'Composition', difficulty: 'Medium',
      prompt: 'If f(x) = 2x + 1 and g(x) = x², what is f(g(3))?',
      choices: ['7', '19', '49', '13', '36'], answer: 1,
      explanation: 'g(3) = 9, then f(9) = 19. Note that g(f(3)) = 49 is a trap answer.'
    },
    {
      id: 'act-m-016', test: 'ACT', section: 'Math', domain: 'Functions', skill: 'Unit circle', difficulty: 'Hard',
      prompt: 'What is the value of cos(2π/3)?',
      choices: ['−√3/2', '−1/2', '1/2', '√3/2', '−1'], answer: 1,
      explanation: '2π/3 is 120°, in Quadrant II where cosine is negative. The reference angle is 60°, so cos = −1/2.'
    },
    {
      id: 'act-m-017', test: 'ACT', section: 'Math', domain: 'Algebra', skill: 'Absolute value inequalities', difficulty: 'Extreme',
      prompt: 'How many integers x satisfy |2x − 5| < 9?',
      choices: ['7', '8', '9', '13', '14'], answer: 1,
      explanation: '−9 < 2x − 5 < 9, so −4 < 2x < 14 and −2 < x < 7. The integers are −1 through 6, which is 8 integers.',
      desmos: 'Type |2x−5| < 9 and read the shaded interval: −2 < x < 7 (open circles).'
    },
    {
      id: 'act-m-018', test: 'ACT', section: 'Math', domain: 'Statistics & Probability', skill: 'Combinations', difficulty: 'Hard',
      prompt: 'Two students are chosen at random from a group of 5 boys and 4 girls. What is the probability that both are girls?',
      choices: ['1/6', '4/9', '1/3', '16/81', '2/9'], answer: 0,
      explanation: 'C(4,2)/C(9,2) = 6/36 = 1/6. Equivalently, (4/9)(3/8) = 12/72 = 1/6.'
    },

    /* ───────────── ACT SCIENCE ───────────── */
    {
      id: 'act-s-005', test: 'ACT', section: 'Science', domain: 'Interpretation of Data', skill: 'Reading graphs', difficulty: 'Easy',
      passage: 'A graph shows that the boiling point of water decreases steadily (approximately linearly) from 100°C at sea level (0 m) to about 90°C at 3,000 m altitude.',
      prompt: 'Based on the graph, the boiling point of water at 1,500 m is closest to:',
      choices: ['85°C', '90°C', '95°C', '100°C'], answer: 2,
      explanation: '1,500 m is halfway between 0 and 3,000 m, so the boiling point is about halfway between 100°C and 90°C.'
    },
    {
      id: 'act-s-006', test: 'ACT', section: 'Science', domain: 'Scientific Investigation', skill: 'Controls', difficulty: 'Easy',
      passage: PLANTS,
      prompt: 'The trial with 0 g of fertilizer most likely served as:',
      choices: ['a control for comparison', 'the dependent variable', 'a source of experimental error', 'a way to measure light intensity'], answer: 0,
      explanation: 'A group with none of the tested factor is a control. It shows how the plants grow without fertilizer.'
    },
    {
      id: 'act-s-007', test: 'ACT', section: 'Science', domain: 'Interpretation of Data', skill: 'Trends', difficulty: 'Medium',
      passage: PLANTS,
      prompt: 'Which statement is best supported by the data?',
      choices: [
        'Plant height increased steadily with every increase in fertilizer.',
        'Plant height increased up to 10 g of fertilizer, then leveled off.',
        'Fertilizer had no effect on plant height.',
        'Plants given 15 g grew the tallest.'
      ], answer: 1,
      explanation: 'Height rose from 12 to 22 cm, then dipped slightly to 21 cm at 15 g, so growth leveled off.'
    },
    {
      id: 'act-s-008', test: 'ACT', section: 'Science', domain: 'Evaluation of Models', skill: 'Conflicting viewpoints', difficulty: 'Medium',
      passage: 'Student 1: Heavier objects fall faster than lighter objects.\nStudent 2: Ignoring air resistance, all objects fall at the same rate regardless of mass.',
      prompt: 'Which observation would best support Student 2?',
      choices: [
        'A feather falls more slowly than a rock in open air.',
        'In a vacuum chamber, a feather and a hammer dropped together hit the floor at the same time.',
        'A bowling ball is heavier than a tennis ball.',
        'Parachutes slow a skydiver\'s fall.'
      ], answer: 1,
      explanation: 'A vacuum removes air resistance. Equal fall times there support Student 2. Choice A is caused by air resistance, which Student 2 explicitly sets aside.'
    },
    {
      id: 'act-s-009', test: 'ACT', section: 'Science', domain: 'Evaluation of Models', skill: 'Hypotheses', difficulty: 'Medium',
      passage: ENZYME,
      prompt: 'A student hypothesized that this enzyme is most active at 37°C. Do the data support this hypothesis?',
      choices: [
        'Yes, because activity at 37°C was higher than at any other temperature tested.',
        'Yes, because activity increased at every temperature.',
        'No, because activity was highest at 60°C.',
        'No, because activity at 20°C was greater than at 37°C.'
      ], answer: 0,
      explanation: '55 units at 37°C is the maximum among the tested temperatures.'
    },
    {
      id: 'act-s-010', test: 'ACT', section: 'Science', domain: 'Interpretation of Data', skill: 'Interpolation', difficulty: 'Hard',
      passage: ENZYME,
      prompt: 'If the enzyme\'s activity were measured at 50°C, it would most likely be:',
      choices: ['less than 2 units', 'between 2 and 30 units', 'between 30 and 55 units', 'greater than 55 units'], answer: 1,
      explanation: '50°C lies between 45°C (30 units) and 60°C (2 units), and activity is falling in that range.'
    },

    /* ───────────── ACT READING ───────────── */
    {
      id: 'act-r-003', test: 'ACT', section: 'Reading', domain: 'Key Ideas & Details', skill: 'Inference', difficulty: 'Medium',
      passage: ELENA,
      prompt: 'Elena\'s final statement most strongly suggests she believes her customers value:',
      choices: ['the quality of her coffee.', 'the reliability and familiarity of the bakery.', 'free wi-fi and modern drinks.', 'low prices.'], answer: 1,
      explanation: '"At five o\'clock, the lights are on" points to dependability and routine, not products.'
    },
    {
      id: 'act-r-004', test: 'ACT', section: 'Reading', domain: 'Craft & Structure', skill: 'Figurative language', difficulty: 'Medium',
      passage: ELENA,
      prompt: 'Comparing Elena\'s greeting to "a starting pistol" suggests that the greeting was:',
      choices: ['threatening and loud.', 'energetic and signaled the start of the day\'s activity.', 'reluctant and quiet.', 'confusing to newcomers.'], answer: 1,
      explanation: 'A starting pistol begins a race. Her greeting marked the brisk start of each day.'
    },
    {
      id: 'act-r-005', test: 'ACT', section: 'Reading', domain: 'Key Ideas & Details', skill: 'Cause and effect', difficulty: 'Easy',
      passage: ELENA,
      prompt: 'The nephew\'s suggestion is presented mainly as a response to:',
      choices: ['declining bread sales.', 'new competition across the street.', 'customer complaints.', 'Elena\'s retirement.'], answer: 1,
      explanation: 'The suggestion comes "when a chain coffee shop opened across the street."'
    },
    {
      id: 'act-r-006', test: 'ACT', section: 'Reading', domain: 'Key Ideas & Details', skill: 'Details', difficulty: 'Easy',
      passage: 'Tardigrades, microscopic animals often called "water bears," can survive extreme conditions by entering a state called cryptobiosis. In this state, they lose nearly all of their body water, and their metabolism slows to almost undetectable levels. Tardigrades in cryptobiosis have survived temperatures near absolute zero, intense radiation, and even exposure to the vacuum of space.',
      prompt: 'According to the passage, cryptobiosis involves:',
      choices: [
        'rapid reproduction in harsh environments.',
        'losing nearly all body water and a greatly slowed metabolism.',
        'growing a protective outer shell.',
        'migrating to warmer habitats.'
      ], answer: 1,
      explanation: 'The second sentence states both features directly.'
    }
  );
})();
