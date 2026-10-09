export interface Author {
  name: string;
  initials: string;
  role: string;
  bio: string;
  avatar?: string;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  tags: string[];
  image: string;
  date: string;
  author: Author;
  featured?: boolean;
  readTime: number;
}

export interface Category {
  id: string;
  label: string;
}

export const categories: Category[] = [
  { id: 'all', label: 'All Posts' },
  { id: 'hr-strategy', label: 'HR Strategy' },
  { id: 'leadership', label: 'Leadership' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'culture', label: 'Culture & Engagement' },
  { id: 'talent', label: 'Talent Management' },
  { id: 'growth', label: 'Business Growth' },
];

const defaultAuthor: Author = {
  name: 'People Growth Africa',
  initials: 'PGA',
  role: 'People Strategy Team',
  bio: 'People Growth Africa is an HR and organisational consulting firm based in Apapa, Lagos, helping businesses across Nigeria and Africa build structured, effective people systems.',
};

const computeReadTime = (content: string): number => {
  const wordsPerMinute = 200;
  const words = content.split(/\s+/).length;
  return Math.max(1, Math.ceil(words / wordsPerMinute));
};

export const blogPosts: BlogPost[] = [
  {
    id: '1',
    slug: 'from-whatsapp-groups-to-world-class-hr',
    title: 'From WhatsApp Groups to World-Class HR: A Roadmap for African SMEs',
    excerpt: 'Most growing businesses in Nigeria start with informal people management. Here\'s a practical, phased roadmap to formalise your HR without losing the agility that got you here.',
    content: `
## The Reality of HR in Growing African Businesses

Most growing businesses in Nigeria start with informal people management, and that's perfectly fine at first. The CEO knows everyone's name, decisions happen in person, and the culture is carried by proximity. But there comes a point where spreadsheets and group chats can't keep up.

When your team crosses 15-20 people, things start to slip through the cracks. Performance issues go unaddressed because there's no structured feedback loop. Hiring becomes inconsistent because there's no standard process. Compensation decisions feel arbitrary because there's no framework.

## Phase 1: Foundation (10-25 Employees)

This is where most businesses should start. You don't need an enterprise HR system: you need basic structure.

**Employment contracts and documentation.** Every employee should have a written contract that clearly outlines their role, compensation, benefits, and the terms of their employment. This isn't just good practice: it's a legal requirement under Nigeria's Labour Act.

**A basic employee handbook.** This doesn't need to be 50 pages. Start with your core policies: working hours, leave entitlements, code of conduct, and grievance procedures. Make it accessible and ensure every team member receives a copy.

**Centralised employee records.** Move from WhatsApp groups and scattered spreadsheets to a single source of truth for employee information. Even a well-structured spreadsheet is better than nothing, but a dedicated HRIS (even a simple one) is worth the investment.

## Phase 2: Structure (25-50 Employees)

With basic documentation in place, you can start building the systems that drive consistency and fairness.

**Defined roles and reporting lines.** As your team grows, ambiguity about who does what becomes costly. Create clear job descriptions with defined responsibilities and reporting relationships. This is also the time to introduce basic organisational design.

**Performance management.** You don't need OKRs or complex KPIs right away. Start with quarterly check-ins where managers and employees discuss progress, challenges, and development goals. The goal is regular, structured conversation, not a perfect system.

**Compensation structure.** Move from ad-hoc pay decisions to a transparent compensation framework. Define salary bands for each role level and create clear criteria for promotions and raises. This reduces turnover and builds trust.

## Phase 3: Maturity (50-100 Employees)

By now, you have the foundation. It's time to build systems that scale with your ambition.

**Learning and development.** Invest in structured training programmes that build the skills your business needs. This could be internal mentoring, external courses, or partnerships with training providers who understand your industry.

**Culture codification.** At this size, culture can no longer be carried by the founder alone. Document your values, create rituals that reinforce them, and build them into your hiring and performance processes.

**HR analytics.** Start tracking meaningful metrics: turnover rates, time-to-hire, engagement scores, and training completion. Data-driven people decisions are better decisions.

## The Key Principle: Start Where You Are

The biggest mistake African SMEs make is trying to implement Google-level HR systems when they're still a 20-person company. Start with what you need now, build the muscle, and expand as you grow.

People Growth Africa helps businesses at every stage of this journey. Whether you're just starting to formalise or ready to build sophisticated people systems, we can help you find the right approach for your context.
    `,
    category: 'hr-strategy',
    tags: ['HR Strategy', 'SMEs', 'Formalisation', 'Africa'],
    image: 'https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=800&q=80&auto=format',
    date: '2026-08-20',
    author: defaultAuthor,
    featured: true,
    get readTime() { return computeReadTime(this.content); },
  },
  {
    id: '2',
    slug: 'understanding-nigerias-labour-act',
    title: "Understanding Nigeria's Labour Act: What Every Employer Must Know in 2026",
    excerpt: "Nigeria's employment landscape is evolving. Here is a clear breakdown of what the law requires and how to stay compliant without overcomplicating your operations.",
    content: `
## Why Labour Law Compliance Matters

Nigeria's Labour Act, along with other employment-related legislation, establishes the framework for the employer-employee relationship. Ignoring these requirements doesn't just expose your business to legal risk, it erodes trust with your workforce and makes it harder to attract and retain talent.

## Key Provisions Every Employer Should Know

### Employment Contracts

Under the Labour Act, every employee is entitled to a written contract of employment. This contract must specify:
- The nature and duration of employment
- Remuneration and how it's calculated
- Hours of work
- Leave entitlements
- Notice periods for termination

Many Nigerian businesses operate without formal contracts, which creates significant legal exposure. If a dispute arises, the absence of documentation puts the employer at a substantial disadvantage.

### Working Hours and Overtime

The standard working week in Nigeria is typically 40 hours, distributed across Monday to Friday. The Labour Act provides guidelines on overtime compensation, though specific arrangements may vary by industry and collective agreements.

### Leave Entitlements

Nigerian law provides for several types of leave:
- **Annual leave**: A minimum of 6 working days per year for employees who have completed 12 months of continuous service
- **Sick leave**: Governed by the terms of employment and applicable regulations
- **Maternity leave**: A minimum of 6 weeks before and after delivery, paid at the employee's normal rate
- **Paternity leave**: Provisions under recent amendments

### Termination and Severance

The law requires that termination follows the terms specified in the employment contract, including proper notice periods. Where an employer terminates without cause, severance pay may be required depending on the terms of employment and applicable collective agreements.

## Building Compliance Into Your Operations

Rather than treating compliance as a burden, smart businesses integrate it into their HR systems:

1. **Audit your current practices** against the requirements of the Labour Act
2. **Document everything**: contracts, policies, leave records, performance reviews
3. **Train your managers** on what the law requires and how to apply it consistently
4. **Review regularly** as legislation evolves and your workforce changes

## How People Growth Africa Can Help

Our HR Audits & Compliance service provides a thorough review of your current people practices against Nigerian labour law requirements. We identify gaps, recommend practical solutions, and help you implement compliant systems that protect both your organisation and your employees.
    `,
    category: 'compliance',
    tags: ['Compliance', 'Nigerian Labour Law', 'Legal', 'Employment Contracts'],
    image: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=600&q=80&auto=format',
    date: '2026-08-15',
    author: defaultAuthor,
    readTime: 7,
  },
  {
    id: '3',
    slug: 'first-time-managers-survival-guide',
    title: "The First-Time Manager's Survival Guide for African Startups",
    excerpt: "Being promoted to manager because you were the best performer is the most common and most dangerous path in African startups. Here is how to build real leadership skills.",
    content: `
## The Peter Principle in African Startups

In most African startups, the path to management looks like this: you join as an individual contributor, you're very good at your job, and then you get promoted to manage the team you were just part of. The assumption is that technical excellence translates to leadership capability. It almost never does.

## The Challenge

First-time managers in African startups face a unique set of challenges:
- Managing former peers who now report to you
- Navigating cultural expectations around authority and deference
- Building credibility without the formal training that traditional managers receive
- Balancing startup speed with the need for structured people management

## Five Principles for First-Time Managers

### 1. Separate Your Identity from Your Role

Your value as a manager isn't measured by how many tasks you personally complete. It's measured by how effectively your team performs. This is a difficult transition, especially in startup culture where doing everything yourself is celebrated.

### 2. Invest in 1-on-1s Early

Weekly 1-on-1 meetings are the single most important tool a new manager has. Use them to understand what your team members need, address concerns before they become problems, and build the trust that makes everything else work.

### 3. Learn to Give Feedback That Lands

Feedback in the African context requires cultural sensitivity. Direct negative feedback that might work in a Western context can damage relationships here. Learn to deliver difficult messages with respect, specificity, and a focus on behaviour rather than character.

### 4. Build Systems, Not Just Answers

New managers often fall into the trap of being the answer machine, everyone comes to them for solutions. Instead, build systems and processes that help your team solve problems independently. This frees you to focus on strategy and development.

### 5. Ask for Help

There's no shame in admitting you're learning. The best managers seek mentorship, read widely, and are open about their development journey. This vulnerability actually builds trust with your team.

## How People Growth Africa Supports New Managers

Our Leadership Development programme is specifically designed for the African business context. We provide practical frameworks, coaching, and support that help first-time managers build real capability, not just inherited authority.
    `,
    category: 'leadership',
    tags: ['Leadership', 'Startups', 'Management', 'Career Development'],
    image: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=600&q=80&auto=format',
    date: '2026-08-08',
    author: defaultAuthor,
    readTime: 6,
  },
  {
    id: '4',
    slug: 'building-culture-that-survives-growth',
    title: 'Building a Company Culture That Survives Rapid Growth',
    excerpt: "Your culture got you to 20 people. Will it survive 100? Here is why intentional culture development is not optional for scaling businesses.",
    content: `
## The Culture Crisis at Scale

Every growing business faces the same cultural inflection point: the informal culture that worked at 20 people starts to fracture at 50 and can completely disintegrate at 100. The founder can no longer personally model and reinforce the values that made the company special.

## Why Culture Erodes

Culture doesn't disappear because people stop caring. It erodes because:
- **New hires don't share the context** that long-tenured employees take for granted
- **Teams become siloed**, developing sub-cultures that may conflict with the broader organisation
- **Systems and processes** start replacing human judgment, and without intentional design, those systems can undermine the very values they're meant to support
- **Growth pressure** pushes leaders to prioritise speed over culture, creating a vicious cycle

## Building Intentional Culture

### Document Your Values

If your culture lives only in the founder's head, it's fragile. Write down the values that define how your organisation operates. Not aspirational values, real ones. The principles that actually guide decisions when no one is watching.

### Hire for Culture Add, Not Just Culture Fit

Culture fit can become a code word for hiring people who look and think like the existing team. Instead, look for people who share your core values but bring diverse perspectives and experiences. This strengthens culture rather than reinforcing a narrow version of it.

### Build Values Into Your Systems

Your performance management, hiring, promotion, and reward systems should all reinforce your stated values. If you value transparency but your promotion decisions are opaque, your culture will erode.

### Create Rituals and Traditions

Every strong culture has rituals: regular practices that reinforce shared values. This could be weekly team celebrations, monthly all-hands meetings, or annual retreats. The specific rituals matter less than their consistency and authenticity.

## How People Growth Africa Helps

Our Culture Development service helps businesses define, document, and embed the culture that will carry them through their next phase of growth. We don't impose generic culture frameworks: we work with you to codify what's authentic to your organisation and build systems that sustain it.
    `,
    category: 'culture',
    tags: ['Culture', 'Growth', 'Values', 'Scaling'],
    image: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=600&q=80&auto=format',
    date: '2026-07-30',
    author: defaultAuthor,
    readTime: 6,
  },
  {
    id: '5',
    slug: 'why-best-employees-are-leaving',
    title: 'Why Your Best Employees Are Leaving (And What to Do About It)',
    excerpt: "Employee turnover in Nigerian businesses often has the same root cause: people outgrow their roles faster than the organisation can create new ones.",
    content: `
## The Retention Paradox

Here's a pattern we see repeatedly across Nigerian businesses: the best employees leave first. Not because they're disloyal or ungrateful, but because they've outgrown their roles and the organisation hasn't created a path for them to grow.

## The Root Causes

### 1. Lack of Career Progression

In many growing businesses, there's no defined career path beyond the initial role. High performers hit a ceiling quickly and start looking elsewhere for advancement opportunities. The tragedy is that these are exactly the people you should be building your future around.

### 2. Compensation Disconnect

Without a transparent compensation framework, pay decisions feel arbitrary. When high performers discover that new hires sometimes earn more than they do for similar work, trust evaporates quickly.

### 3. Managerial Deficiency

People don't leave companies; they leave managers. In many African businesses, managers are promoted for technical skill rather than people management ability. The result is a workforce managed by people who were never trained to manage.

### 4. Cultural Misalignment

As businesses grow, culture shifts. If the values that attracted your best people in the first place are no longer reflected in how the organisation operates, they'll find somewhere that aligns with what they care about.

## What to Do About It

### Build Career Frameworks

Define what growth looks like at every level in your organisation. Create dual tracks: one for people who want to manage teams, one for people who want to deepen their expertise. Give your best people a reason to stay by showing them a future.

### Implement Regular Stay Interviews

Don't wait for exit interviews to find out what your people need. Conduct regular stay interviews where you proactively ask your best performers what would make them stay, what frustrates them, and what they see for their future.

### Invest in Manager Training

Your managers are your retention strategy. Train them in coaching, feedback, and people development. A great manager can offset almost any other retention challenge.

### Create Meaningful Work

High performers are motivated by impact, not just compensation. Ensure your best people are working on meaningful projects with clear impact, not just grinding through tasks.

## How People Growth Africa Helps

Our Talent Management and Retention strategies are built specifically for the African context. We help you identify why your best people are at risk and build practical interventions that keep them engaged and growing.
    `,
    category: 'talent',
    tags: ['Talent Management', 'Retention', 'Employee Engagement', 'Career Development'],
    image: 'https://images.unsplash.com/photo-1556745757-8d76bdb6984b?w=600&q=80&auto=format',
    date: '2026-07-22',
    author: defaultAuthor,
    readTime: 7,
  },
  {
    id: '6',
    slug: 'how-to-conduct-hr-audit',
    title: 'How to Conduct an HR Audit Without Overwhelming Your Team',
    excerpt: "An HR audit doesn't have to be a month-long nightmare. We break down a streamlined approach that delivers the insights you need to fix what matters most.",
    content: `
## What Is an HR Audit?

An HR audit is a systematic review of your organisation's people practices, policies, and systems to identify strengths, gaps, and risks. It's the foundation for any meaningful HR improvement: you can't fix what you haven't assessed.

## Why Most HR Audits Fail

The typical HR audit is treated as a compliance exercise: check boxes, document findings, produce a report, and file it away. The result is a document that nobody reads and nothing changes.

## A Streamlined Approach

### Step 1: Define Your Scope (Week 1)

Don't try to audit everything at once. Focus on the areas that matter most to your business right now. For most growing businesses, this means:
- Employment contracts and documentation
- Leave management
- Compensation and benefits
- Performance management
- Health and safety

### Step 2: Gather Data (Weeks 2-3)

Review your current documentation, policies, and practices against each area. Interview managers and employees to understand how things actually work versus how they're supposed to work.

### Step 3: Identify Gaps (Week 4)

Compare your current practices against:
- Nigerian labour law requirements
- Industry best practices
- Your organisation's stated values and policies

### Step 4: Prioritise and Act (Weeks 5-6)

Not all gaps are equal. Prioritise based on legal risk, business impact, and employee experience. Create an action plan with clear owners and timelines for the top priorities.

## Making It Stick

The audit is only valuable if it leads to action. Assign owners for each finding, set deadlines, and establish a regular review cycle to track progress.

## How People Growth Africa Helps

Our HR Audits & Compliance service provides a thorough, practical review that goes beyond checklists. We identify what matters most for your specific context and help you build an implementation plan that gets results without overwhelming your team.
    `,
    category: 'hr-strategy',
    tags: ['HR Strategy', 'HR Audit', 'Compliance', 'Best Practices'],
    image: 'https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?w=600&q=80&auto=format',
    date: '2026-07-14',
    author: defaultAuthor,
    readTime: 5,
  },
  {
    id: '7',
    slug: 'ten-to-hundred-employee-inflection-point',
    title: 'The 10-to-100 Employee Inflection Point: Why HR Can\'t Wait',
    excerpt: "The jump from 10 to 100 employees is where most businesses either build the right people systems or create problems that take years to untangle.",
    content: `
## The Critical Window

The transition from 10 to 100 employees is the most important period in any company's life. It's where the informal approaches that worked in the early days either evolve into sustainable systems or break down into chaos.

## Why This Window Matters

### At 10 Employees
Everyone knows everyone. Communication is informal. Culture is carried by proximity. The founder manages everything personally. This works, until it doesn't.

### At 25 Employees
Communication starts to break down. The founder can no longer manage everything directly. You need managers, but most haven't been trained. Informal agreements create confusion. First signs of culture drift appear.

### At 50 Employees
You need formal systems for hiring, performance management, and compensation. Without them, decisions become inconsistent and morale suffers. Legal compliance becomes more complex as you cross regulatory thresholds.

### At 100 Employees
You need a proper organisational structure, comprehensive policies, trained managers at every level, and a culture that doesn't depend on any single person. If you haven't built these systems, you're now in crisis mode.

## The Cost of Delay

Every month you wait to invest in proper people systems, you accumulate technical debt, the human resources equivalent. Turnover increases. Mis-hires multiply. Managerial problems compound. By the time you reach 100 employees, the cost of fixing what's broken is five to ten times what it would have been at 25.

## What "HR Can't Wait" Actually Means

It doesn't mean you need to hire an HR director at 15 employees. It means you need to start building the foundations:

- **Documented employment practices** from day one
- **Basic performance conversations** by 20 employees
- **Structured hiring processes** by 30 employees
- **Compensation frameworks** by 40 employees
- **Trained managers** by 50 employees
- **Comprehensive HR systems** by 75 employees

## How People Growth Africa Helps

We specialise in exactly this inflection point. Our services are designed for businesses with 10-100 employees who need practical, cost-effective HR systems that scale with their growth. We don't sell enterprise solutions to startups: we build the right systems for where you are today.
    `,
    category: 'growth',
    tags: ['Business Growth', 'Scaling', 'HR Systems', 'SMEs'],
    image: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=600&q=80&auto=format',
    date: '2026-07-06',
    author: defaultAuthor,
    readTime: 6,
  },
  {
    id: '8',
    slug: 'performance-management-for-african-startups',
    title: 'Performance Management That Actually Works for African Startups',
    excerpt: "Traditional performance reviews don't work in fast-moving African startups. Here's a practical alternative that drives results without killing your culture.",
    content: `
## The Problem with Traditional Performance Management

Annual performance reviews were designed for large, stable organisations. For African startups operating in fast-moving, uncertain environments, they're almost useless. By the time you complete the annual review cycle, the goals from 12 months ago are irrelevant.

## Why Startups Need a Different Approach

### Speed of Change

In a startup, priorities shift quarterly, sometimes monthly. Your performance management system needs to keep pace. Annual goals and quarterly reviews are too slow for the reality of startup life.

### Cultural Sensitivity

In many African cultures, direct feedback, especially negative feedback, requires careful handling. Traditional performance review formats can feel confrontational and damage relationships rather than build them.

### Limited HR Resources

Most startups don't have dedicated HR people. Performance management needs to be simple enough for busy managers to implement without extensive training.

## A Practical Framework

### Continuous Check-ins

Replace annual reviews with monthly or bi-weekly check-ins. These are short (15-30 minutes), focused conversations where managers and team members discuss:
- What's going well
- What's challenging
- What support is needed
- How priorities have shifted

### OKRs (Objectives and Key Results)

Use OKRs on a quarterly cycle. Each team member sets 2-3 objectives with measurable key results. This provides direction without locking people into goals that may become irrelevant.

### Peer Recognition

Build a culture of peer recognition where team members regularly acknowledge each other's contributions. This is more motivating than any formal review process and reinforces the behaviours you want to see.

### Real-Time Feedback

Don't save feedback for formal meetings. Create a culture where feedback is given in the moment, both positive and constructive. This is faster, more relevant, and more impactful than delayed reviews.

## How People Growth Africa Helps

Our Performance Management service helps startups implement lightweight, effective systems that drive results without the bureaucracy. We understand the African startup context and design solutions that work within your reality.
    `,
    category: 'hr-strategy',
    tags: ['HR Strategy', 'Performance Management', 'Startups', 'OKRs'],
    image: 'https://images.unsplash.com/photo-1552581234-26160f608093?w=600&q=80&auto=format',
    date: '2026-06-28',
    author: defaultAuthor,
    readTime: 6,
  },
  {
    id: '9',
    slug: 'recruitment-best-practices-african-market',
    title: 'Recruitment Best Practices for the African Market',
    excerpt: "Hiring in Africa requires a different playbook. From sourcing channels to interview design, here's what actually works in practice.",
    content: `
## The Unique Challenges of African Recruitment

Recruiting in Africa comes with its own set of challenges that generic hiring playbooks don't address. Infrastructure limitations, cultural nuances, and a competitive talent market in certain sectors all require thoughtful adaptation.

## Sourcing: Where to Find Talent

### Leverage Local Networks

Referrals remain the most effective sourcing channel across Africa. Invest in building referral programmes that incentivise your existing team to bring in qualified candidates. This channel typically produces candidates who are better cultural fits and stay longer.

### Digital Platforms

Platforms like LinkedIn are valuable but don't tell the whole story. Supplement with local job boards, university career services, and professional associations in your industry. For technical roles, developer communities and hackathons are gold mines.

### Employer Branding

In competitive markets, your employer brand matters. Share your company culture, values, and employee stories through social media and your website. Candidates in Africa increasingly research employers before applying.

## Screening: Beyond the CV

### Skills-Based Assessment

CVs in the African context can be unreliable: embellishment is common and educational credentials don't always correlate with capability. Use practical skills assessments early in the process to verify actual ability.

### Cultural Alignment

Assess candidates against your company's actual values, not generic competencies. Ask scenario-based questions that reveal how they'd handle situations specific to your business context.

## Interviewing: Structured and Fair

### Standardised Questions

Use the same core questions for every candidate in the same role. This reduces bias and makes comparisons more meaningful. Include behavioural questions that explore past experience and situational questions that test problem-solving.

### Multiple Interviewers

Include at least two interviewers in the final stage. Different perspectives reduce individual bias and provide a more complete picture of the candidate.

## Onboarding: Setting People Up for Success

The recruitment process doesn't end with the offer letter. A structured onboarding programme significantly improves retention and time-to-productivity. Ensure new hires understand not just their role, but the culture, values, and expectations of the organisation.

## How People Growth Africa Helps

Our Recruitment & Talent Management service provides end-to-end hiring support, from job design through to onboarding. We understand the African talent market and help you build hiring processes that consistently bring in the right people.
    `,
    category: 'talent',
    tags: ['Talent Management', 'Recruitment', 'Hiring', 'Africa'],
    image: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=600&q=80&auto=format',
    date: '2026-06-18',
    author: defaultAuthor,
    readTime: 7,
  },
];

/** Get a post by slug */
export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}

/** Get the featured post or the most recent */
export function getFeaturedPost(): BlogPost {
  return blogPosts.find((p) => p.featured) ?? blogPosts[0];
}

/** Get related posts (same category, excluding self) */
export function getRelatedPosts(post: BlogPost, limit = 3): BlogPost[] {
  return blogPosts
    .filter((p) => p.id !== post.id && p.category === post.category)
    .slice(0, limit);
}

/** Filter posts by category */
export function getPostsByCategory(categoryId: string): BlogPost[] {
  if (categoryId === 'all') return blogPosts;
  return blogPosts.filter((p) => p.category === categoryId);
}

/** Search posts by query */
export function searchPosts(query: string): BlogPost[] {
  const q = query.toLowerCase().trim();
  if (!q) return blogPosts;
  return blogPosts.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.excerpt.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

/** Get category label by id */
export function getCategoryLabel(categoryId: string): string {
  return categories.find((c) => c.id === categoryId)?.label ?? categoryId;
}
