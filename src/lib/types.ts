
export interface UserAccount {
  id: string;
  userId: string;
  accountType: "personal" | "business";
  accountName: string;
  createdDate: string;
}

export interface VenturePitch {
  id: string;
  senderUid: string;
  senderName: string;
  recipientUid: string;
  startupId: string | null;
  startupName: string | null;
  pitchMessage: string;
  status: "pending" | "reviewed" | "accepted" | "rejected";
  createdAt: any;
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
  invoiceNumber: string;
  contactId: string;
  contactName: string;
  billFromType: 'Personal' | 'Startup';
  billFromName: string;
  description?: string;
  paymentInstructions?: string;
  termsAndConditions?: string;
  productType: 'Digital' | 'Physical';
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  amount: number;
  currency: string;
  issueDate: string;
  dueDate: string;
  status: 'Draft' | 'Sent' | 'Paid' | 'Overdue' | 'Cancelled';
  createdAt: any;
  updatedAt: any;
}

export interface Connection {
  id: string;
  initiatorUid: string;
  recipientUid: string;
  type: 'investor' | 'founder' | 'mentor' | 'cofounder' | 'service';
  status: 'pending' | 'accepted' | 'rejected';
  message: string;
  createdAt: any;
  updatedAt?: any;
}

export interface Notification {
  id: string;
  recipientUid: string;
  actorUid: string;
  type: 'like' | 'comment' | 'pitch' | 'connection' | 'system' | 'message' | 'cofounder_interest' | 'investor_interest' | 'rejection' | 'moderation' | 'task_due' | 'venture_pitch';
  title: string;
  message: string;
  targetId?: string;
  targetType?: 'post' | 'pitch' | 'chat' | 'user' | 'task' | 'venture_pitch';
  read: boolean;
  createdAt: any;
}

export interface Task {
  id: string;
  ownerUid: string;
  dealId?: string;
  contactId?: string;
  title: string;
  description?: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  priority: 'Low' | 'Medium' | 'High';
  dueDate?: any;
  completedAt?: any;
  createdAt: any;
  updatedAt: any;
}
