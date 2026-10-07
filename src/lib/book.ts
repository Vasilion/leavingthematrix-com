export interface Chapter {
  number: string;
  title: string;
  lesson: string;
}

export interface StoryBeat {
  moment: string;
  lesson: string;
}

export interface Pillar {
  title: string;
  text: string;
}

export interface PlanWeek {
  week: string;
  title: string;
  text: string;
}

export interface FormatStep {
  label: string;
  text: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

const apiUrl: string | undefined = import.meta.env.PUBLIC_BOOK_API_URL;

if (apiUrl === undefined || apiUrl.trim() === '') {
  throw new Error('PUBLIC_BOOK_API_URL is not set. The Disqualified buy button needs it.');
}

export const BOOK_API_URL: string = apiUrl.trim().replace(/\/$/, '');

export const BOOK = {
  title: 'Disqualified',
  subtitle: 'From Financially Clueless to Financially Free, One Hard Lesson at a Time',
  author: 'Luke Vasilion',
  price: '$9.99',
  priceAmount: '9.99',
  pages: 121,
  path: '/disqualified',
  ogImage: '/og/disqualified.jpg',
  hook: 'The Army told me I was permanently disqualified. It turned out to be the best thing that ever happened to my money.',
  pitch:
    "This isn't a finance textbook. It's the story of a kid from the Lansing area who grew up on food stamps, made a whole pile of dumb money decisions, and figured it out the hard way. Every chapter is a real chapter of my life, and every one ends with a few small things you can do that week. By the end, you'll know what your time is really worth, how to build an emergency fund, how to get out of a car you're upside down on, how to start investing, and how to talk money with your partner without a fight.",
  bio:
    'Luke Vasilion grew up in the Lansing, Michigan area, splitting every other week between two houses and two completely different ideas about money. He got through college on a track scholarship and zero student loans, got permanently disqualified from Army Special Forces at 24, and started over selling cars for ten dollars an hour. Today he leads a front-end team building software used on NASA missions, runs Unyx Web Solutions, and founded Leaving the Matrix. He lives in Michigan with his wife, Bria, and their daughter.',
} as const;

export const STORY_BEATS: StoryBeat[] = [
  { moment: 'Two houses', lesson: 'What fear, and a total lack of structure, do to money.' },
  { moment: 'Working at fourteen', lesson: 'What an hour is actually worth.' },
  { moment: 'Running track to get out', lesson: 'What consistency and discipline can actually do.' },
  { moment: 'Learning to ask', lesson: 'Not to be afraid of hearing no.' },
  { moment: 'The Challenger', lesson: 'What a bad decision costs.' },
  { moment: 'The hearing booth', lesson: 'To always have a Plan B.' },
  { moment: 'Ten dollars an hour', lesson: 'That income is the biggest lever.' },
  { moment: 'The raise that changed nothing', lesson: "That it's only a lever." },
  { moment: 'The 2020 rally', lesson: 'That I had to get smarter. The tariff crash showed me I finally had.' },
  { moment: 'My daughter', lesson: 'Gave all of it a reason.' },
];

export const STORY_CLOSER: string =
  'I got disqualified from the life I thought I wanted. It turned out to be the best thing that ever happened to me, because it put me on the road to this one.';

export const PILLARS: Pillar[] = [
  {
    title: 'Know your money script',
    text: 'Why you handle money the way you do, and which rules you inherited without ever agreeing to them.',
  },
  {
    title: 'Build your Plan B',
    text: 'Your runway, an emergency fund that comes before everything else, and where to keep it.',
  },
  {
    title: 'Get out from under it',
    text: 'Credit scores, minimum payments, avalanche vs. snowball, and getting right-side up on a car.',
  },
  {
    title: 'Earn more, and keep it',
    text: "Your real hourly rate, how to ask for more, and why a bigger number on the offer letter isn't enough.",
  },
  {
    title: 'Invest like a grown-up',
    text: 'How the market works, why crashes are normal, compounding, the first two accounts, and a one-page plan.',
  },
  {
    title: 'Run it as a family',
    text: 'Talking money without the fight, living on one income, deciding what your money is for, and building something you own.',
  },
];

export const PLAN_WEEKS: PlanWeek[] = [
  { week: 'Week 1', title: 'See where you stand', text: 'Your reason, your money rules, your real hourly rate, and every payment you owe.' },
  { week: 'Week 2', title: 'Build the safety net', text: 'Your runway, a high-yield Plan B account, and your first $1,000.' },
  { week: 'Week 3', title: 'Stop the leaks', text: 'Rank your biggest expenses, call for a better rate, and pick your first debt to kill.' },
  { week: 'Week 4', title: 'Start building', text: 'Get the full 401(k) match, open a Roth IRA, write your investing plan, and have the money talk.' },
];

export const CHAPTER_FORMAT: FormatStep[] = [
  { label: 'What happened', text: 'The real story, mistakes included.' },
  { label: 'What I know now', text: 'The lesson in plain English, with real numbers.' },
  { label: 'Your move this week', text: 'A few small things to do in the next seven days. Not someday. This week.' },
];

export const WHO_FOR: string[] = [
  "You're doing everything right and still living paycheck to paycheck.",
  "Nobody ever sat you down and explained money, and you don't want your kids to have to figure it out alone.",
  'You want real numbers and real mistakes, not a lecture.',
];

export const CHAPTERS: Chapter[] = [
  { number: '', title: 'Disqualified', lesson: 'Why you need a Plan B before you need one' },
  { number: '1', title: 'Every Other Week', lesson: 'The money rules you inherited without knowing it' },
  { number: '2', title: 'The Four-Wheeler', lesson: 'Giving every dollar a job' },
  { number: '3', title: 'Working at 14', lesson: 'What your time is really worth' },
  { number: '4', title: 'Paying for the Path Out', lesson: 'Getting through college without the loans' },
  { number: '5', title: 'Soul Searching', lesson: 'What it costs you to never ask' },
  { number: '6', title: 'Austin, and Nothing Without Her', lesson: 'Credit scores, minimum payments, and getting out of debt' },
  { number: '7', title: 'The Challenger, and the Truck That Got Me Out', lesson: 'Negative equity, and the real cost of a car' },
  { number: '8', title: 'Disqualified', lesson: 'Building your emergency fund' },
  { number: '9', title: 'Plan B', lesson: 'Why income is your biggest lever' },
  { number: '10', title: 'The COVID Wake-Up Call', lesson: 'How the stock market works, and why crashes are normal' },
  { number: '11', title: '23 Acres and Nobody to Ride With', lesson: 'Deciding what your money is for' },
  { number: '12', title: "The Keymaker's Van", lesson: 'Inflation, and how to make things worth more' },
  { number: '13', title: 'Buying NVIDIA on the Way Down', lesson: 'Building a portfolio like a grown-up' },
  { number: '14', title: 'The Flip, and the Fire', lesson: 'How a house actually makes you money' },
  { number: '15', title: 'The Raise That Changed Nothing', lesson: 'Why the number on your offer letter lies' },
  { number: '16', title: 'One Income', lesson: 'Running money as a couple' },
  { number: '17', title: 'Owning Things That Pay You', lesson: 'Building something you own' },
  { number: '18', title: 'The Reason', lesson: 'Finding the thing that keeps you going' },
];

export const CHAPTERS_PLUS: string = 'Your First 30 Days, every move from the book in one plan, and a plain-English glossary';

export const FAQ: FaqItem[] = [
  {
    question: 'What do I get?',
    answer:
      'The full book as a PDF and an EPUB (works on Apple Books, Kindle via Send to Kindle, and most e-readers), delivered instantly.',
  },
  {
    question: 'How do I get it?',
    answer:
      'Download links appear right after checkout and are emailed to you. Lost them? <a href="/disqualified/resend">Get fresh links here</a>.',
  },
  {
    question: 'Refunds?',
    answer:
      "All sales are final, since you get the full book the moment you check out. If a file won't download or open, reply to your delivery email and I'll make it right.",
  },
  {
    question: 'Is this financial advice?',
    answer:
      "No. It's one person's story and what he learned. Your situation is your own, so talk to a qualified professional before big decisions.",
  },
];
