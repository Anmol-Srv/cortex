const DEFAULT_CATEGORIES = {
  // Personal categories
  preference: 'Personal likes, dislikes, favorites, preferred tools/foods/methods',
  opinion: 'Personal views, assessments, evaluations of tools/concepts/approaches',
  personal: 'Personal facts — birthday, workplace, location, biographical details',
  experience: 'Personal experiences — projects built, tools used, skills acquired',

  // Knowledge categories
  business_rule: 'Organizational rules, policies, constraints',
  workflow: 'Process flows, state transitions, procedures',
  architecture: 'System design, service interactions, infrastructure',
  convention: 'Coding patterns, naming rules, team standards',
  decision: 'Why choices were made, tradeoffs considered',
  domain_knowledge: 'Domain-specific terminology and concepts',
  key_insight: 'Important takeaways, notable explanations',
  metric: 'Quantitative data, measurements, statistics',
  issue: 'Known problems, bugs, limitations, risks',
  action_item: 'Tasks, follow-ups, assignments, deadlines',
};

const PERSONAL_CATEGORIES = ['preference', 'opinion', 'personal', 'experience'];
const KNOWLEDGE_CATEGORIES = Object.keys(DEFAULT_CATEGORIES).filter((c) => !PERSONAL_CATEGORIES.includes(c));
const ALL_CATEGORIES = DEFAULT_CATEGORIES;

export { DEFAULT_CATEGORIES, PERSONAL_CATEGORIES, KNOWLEDGE_CATEGORIES, ALL_CATEGORIES };
