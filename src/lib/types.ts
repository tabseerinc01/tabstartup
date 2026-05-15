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

export interface Client {
  id: string;
  userAccountId: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  ownerUid: string;
  userAccountId: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  subtotalCents: number;
  totalCents: number;
  currency: string;
  status: 'draft' | 'sent' | 'paid' | 'unpaid';
  lineItems: {
    description: string;
    quantity: number;
    unitPrice: number; // in cents
  }[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
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

export interface Notification {
  id: string;
  recipientUid: string;
  actorUid: string;
  type: 'like' | 'comment' | 'pitch' | 'connection' | 'system' | 'message' | 'cofounder_interest' | 'investor_interest';
  title: string;
  message: string;
  targetId?: string;
  targetType?: 'post' | 'pitch' | 'chat' | 'user';
  read: boolean;
  createdAt: any; // Firestore Timestamp
}
