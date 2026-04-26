
export interface Founder {
  id: string;
  name: string;
  headline: string;
  location: string;
  stage: 'Idea' | 'Early' | 'Growth' | 'Scaling';
  skills: string[];
  lookingFor: string;
  imageUrl: string;
}

export interface Investor {
  id: string;
  name: string;
  headline: string;
  location: string;
  preferredStage: string[];
  isOpen: boolean;
  note: string;
  imageUrl: string;
}

export const mockFounders: Founder[] = [
  {
    id: '1',
    name: 'Ahmed Rafiq',
    headline: 'Building the future of AgriTech in Bangladesh',
    location: 'Dhaka, Bangladesh',
    stage: 'Early',
    skills: ['Python', 'IoT', 'Strategy'],
    lookingFor: 'Seed funding and mentors with experience in agricultural supply chains.',
    imageUrl: 'https://picsum.photos/seed/founder1/400/400',
  },
  {
    id: '2',
    name: 'Sarah Chen',
    headline: 'AI-driven logistics for global commerce',
    location: 'Singapore',
    stage: 'Growth',
    skills: ['Machine Learning', 'Operations', 'Leadership'],
    lookingFor: 'Growth-stage investors and strategic partners in Southeast Asia.',
    imageUrl: 'https://picsum.photos/seed/founder2/400/400',
  },
  {
    id: '3',
    name: 'Tanvir Hossain',
    headline: 'Fintech solutions for the unbanked',
    location: 'Chittagong, Bangladesh',
    stage: 'Idea',
    skills: ['Finance', 'Product Management', 'Market Research'],
    lookingFor: 'Co-founders with technical expertise in blockchain.',
    imageUrl: 'https://picsum.photos/seed/founder3/400/400',
  },
  {
    id: '4',
    name: 'Elena Rodriguez',
    headline: 'Sustainable fashion marketplace',
    location: 'Madrid, Spain',
    stage: 'Early',
    skills: ['E-commerce', 'Marketing', 'Sustainability'],
    lookingFor: 'Marketing advisors and angel investors.',
    imageUrl: 'https://picsum.photos/seed/founder4/400/400',
  },
];

export const mockInvestors: Investor[] = [
  {
    id: 'inv1',
    name: 'Jasmine Akter',
    headline: 'Venture Partner at Delta VC',
    location: 'Dhaka, Bangladesh',
    preferredStage: ['Early', 'Growth'],
    isOpen: true,
    note: 'Interested in B2B SaaS and Fintech startups in emerging markets.',
    imageUrl: 'https://picsum.photos/seed/investor1/400/400',
  },
  {
    id: 'inv2',
    name: 'Marcus Thorne',
    headline: 'Angel Investor & Tech Advisor',
    location: 'London, UK',
    preferredStage: ['Idea', 'Early'],
    isOpen: false,
    note: 'Focusing on DeepTech and sustainability. Portfolio is currently full.',
    imageUrl: 'https://picsum.photos/seed/investor2/400/400',
  },
  {
    id: 'inv3',
    name: 'Fatima Zohra',
    headline: 'Managing Director, Green Horizon Fund',
    location: 'Dubai, UAE',
    preferredStage: ['Growth', 'Scaling'],
    isOpen: true,
    note: 'Looking for climate-tech startups ready to scale internationally.',
    imageUrl: 'https://picsum.photos/seed/investor3/400/400',
  },
];
