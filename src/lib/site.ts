export const SITE = {
  name: 'Leaving The Matrix',
  domain: 'leavingthematrix.com',
  tagline: 'Investing education and signals — from beginner to degen.',
  description:
    'Investing education, market signals, and a community spanning set-and-forget portfolios to high-risk options. Built for traders who want clarity, not noise.',
  discord: {
    invite: 'https://mee6.xyz/en/m/1384673721599397948',
    subscribe: 'https://mee6.xyz/en/m/1384673721599397948?subscribe=1428981437381615616&bundle=1',
  },
  parentCompany: 'Unycross LLC',
} as const;

export const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/membership', label: 'Membership' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
] as const;

export const BLOG_CATEGORIES = [
  { id: 'nova-dev', label: 'Nova Dev', description: 'Build notes from the trading copilot powering our research.' },
  { id: 'market-notes', label: 'Market Notes', description: 'Weekly reads on what the tape is doing and why.' },
  { id: 'education', label: 'Education', description: 'Frameworks, mental models, and trade structures.' },
  { id: 'trade-reviews', label: 'Trade Reviews', description: 'Post-mortems on real trades — wins, losses, lessons.' },
  { id: 'announcements', label: 'Announcements', description: 'Updates from the desk.' },
] as const;

export const PRICING_TIERS = [
  {
    name: 'Standard',
    price: 'TBD',
    period: '/mo',
    tagline: 'The full education + signals stack.',
    features: [
      'Education library (DCA, set-and-forget, market mechanics)',
      'Long-term stock picks',
      'Buy-the-dip & swing trades',
      'ETF momentum & passive income strategies',
      'Crypto coverage',
      'Market watch & weekly recap',
      'Community chat',
      'Member portfolio tracking',
    ],
    cta: 'Join Standard',
    popular: false,
  },
  {
    name: 'Pro',
    price: 'TBD',
    period: '/mo',
    tagline: 'Everything in Standard, plus the rooms behind the wall.',
    features: [
      'Everything in Standard',
      'Pro-chat access',
      'Options trading channel',
      '200-WMA only deep value plays',
      'Monthly options gamble all-in',
      'Degen trades',
      '1-on-1 portfolio review',
      'Direct line to Luke',
    ],
    cta: 'Join Pro',
    popular: true,
  },
] as const;
