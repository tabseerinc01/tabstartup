export interface UserAccount {
  id: string;
  userId: string;
  accountType: "personal" | "business";
  accountName: string;
  createdDate: string;
}

export interface Wallet {
  id: string;
  userAccountId: string;
  balanceTotal: number;
  balanceAvailable: number;
  balancePending: number;
  currency: string;
}

export interface Invoice {
  id: string;
  userAccountId: string;
  clientId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  amount: number;
  status: "draft" | "sent" | "paid" | "unpaid";
  currency: string;
}

export interface PaymentLink {
  id: string;
  userAccountId: string;
  link: string;
  amount: number;
  currency: string;
  status: "active" | "inactive" | "paid";
  createdDate: string;
}

export interface Transaction {
  id: string;
  userAccountId: string;
  transactionDate: string;
  amount: number;
  type: "debit" | "credit";
  status: "pending" | "completed" | "failed";
  description: string;
  invoiceId?: string;
  paymentLinkId?: string;
  currency: string;
}
