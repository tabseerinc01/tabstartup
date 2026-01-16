export type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "Credit" | "Debit";
  status: "Paid" | "Pending" | "Failed";
  client: {
    name: string;
    email: string;
  };
};

export type Invoice = {
  id: string;
  clientName: string;
  clientEmail: string;
  amount: number;
  status: "Paid" | "Unpaid" | "Overdue";
  dueDate: string;
  issuedDate: string;
  items: { description: string; quantity: number; price: number }[];
};

export type PaymentLink = {
  id: string;
  title: string;
  url: string;
  amount: number | "Flexible";
  collected: number;
  createdDate: string;
};

export const dashboardStats = {
  balance: 12540.50,
  monthlyIncome: 4500.00,
  monthlyExpenses: 1250.75,
};

export const chartData = [
  { date: "Jan", income: 2400, expenses: 800 },
  { date: "Feb", income: 1398, expenses: 1200 },
  { date: "Mar", income: 9800, expenses: 2000 },
  { date: "Apr", income: 3908, expenses: 2780 },
  { date: "May", income: 4800, expenses: 1890 },
  { date: "Jun", income: 3800, expenses: 2390 },
  { date: "Jul", income: 4300, expenses: 3490 },
];

export const transactions: Transaction[] = [
  {
    id: "txn_1",
    date: "2024-07-23",
    description: "Payment for Invoice #2024003",
    amount: 750.00,
    type: "Credit",
    status: "Paid",
    client: { name: "Creative Minds Inc.", email: "contact@creativeminds.com" },
  },
  {
    id: "txn_2",
    date: "2024-07-22",
    description: "Withdrawal to Bank Account",
    amount: 2000.00,
    type: "Debit",
    status: "Paid",
    client: { name: "TabEdge", email: "payouts@tabedge.com" },
  },
  {
    id: "txn_3",
    date: "2024-07-21",
    description: "Payment from Payment Link 'Product Sale'",
    amount: 120.50,
    type: "Credit",
    status: "Paid",
    client: { name: "John Doe", email: "j.doe@example.com" },
  },
  {
    id: "txn_4",
    date: "2024-07-20",
    description: "Subscription Fee",
    amount: 29.00,
    type: "Debit",
    status: "Paid",
    client: { name: "SaaS Provider", email: "billing@saas.com" },
  },
  {
    id: "txn_5",
    date: "2024-07-19",
    description: "Payment for Invoice #2024002",
    amount: 1200.00,
    type: "Credit",
    status: "Paid",
    client: { name: "Innovate Solutions", email: "accounts@innovatesol.com" },
  },
];

export const invoices: Invoice[] = [
  {
    id: "inv_2024001",
    clientName: "Innovate Solutions",
    clientEmail: "accounts@innovatesol.com",
    amount: 1200.00,
    status: "Paid",
    issuedDate: "2024-07-10",
    dueDate: "2024-07-25",
    items: [
      { description: "Web Development Services", quantity: 1, price: 1000.00 },
      { description: "Monthly Hosting", quantity: 2, price: 100.00 },
    ],
  },
  {
    id: "inv_2024002",
    clientName: "Creative Minds Inc.",
    clientEmail: "contact@creativeminds.com",
    amount: 750.00,
    status: "Paid",
    issuedDate: "2024-07-15",
    dueDate: "2024-07-30",
    items: [{ description: "Graphic Design Package", quantity: 1, price: 750.00 }],
  },
  {
    id: "inv_2024003",
    clientName: "Global Tech",
    clientEmail: "payments@globaltech.com",
    amount: 3500.00,
    status: "Unpaid",
    issuedDate: "2024-07-20",
    dueDate: "2024-08-05",
    items: [{ description: "Q3 Consulting Services", quantity: 1, price: 3500.00 }],
  },
  {
    id: "inv_2024004",
    clientName: "Local Biz",
    clientEmail: "jane@localbiz.com",
    amount: 500.00,
    status: "Overdue",
    issuedDate: "2024-06-15",
    dueDate: "2024-06-30",
    items: [{ description: "Social Media Management", quantity: 1, price: 500.00 }],
  },
];

export const paymentLinks: PaymentLink[] = [
  {
    id: "pl_1",
    title: "E-book 'The Art of Code'",
    url: "/pay/art-of-code",
    amount: 49.99,
    collected: 2499.50,
    createdDate: "2024-06-01",
  },
  {
    id: "pl_2",
    title: "Consultation Call",
    url: "/pay/consultation",
    amount: 250.00,
    collected: 1250.00,
    createdDate: "2024-06-15",
  },
  {
    id: "pl_3",
    title: "General Donation",
    url: "/pay/donate",
    amount: "Flexible",
    collected: 875.00,
    createdDate: "2024-05-20",
  },
];
