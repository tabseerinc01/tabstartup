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
