
'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import {
  useFirestore,
  errorEmitter,
  FirestorePermissionError,
} from '@/firebase';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

const lineItemSchema = z.object({
  description: z.string().min(1, 'Description is required.'),
  quantity: z.coerce.number().min(1, 'Quantity must be at least 1.'),
  unitPrice: z.coerce.number().min(0, 'Unit price must be positive.'),
});

const formSchema = z.object({
  clientName: z.string().min(1, 'Client name is required.'),
  clientEmail: z.string().email('Invalid email address.'),
  currency: z.string().default('USD'),
  dueDate: z.date().optional(),
  notes: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required.'),
});

type InvoiceFormValues = z.infer<typeof formSchema>;

interface CreateInvoiceFormProps {
  user: User;
  accountId: string;
  onSuccess: () => void;
}

export function CreateInvoiceForm({
  user,
  accountId,
  onSuccess,
}: CreateInvoiceFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      clientName: '',
      clientEmail: '',
      currency: 'USD',
      notes: '',
      lineItems: [{ description: '', quantity: 1, unitPrice: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lineItems',
  });

  const onSubmit = (values: InvoiceFormValues) => {
    setIsLoading(true);

    const clientCollectionRef = collection(
      firestore,
      `users/${user.uid}/accounts/${accountId}/clients`
    );
    const clientData = {
      userAccountId: accountId,
      name: values.clientName,
      email: values.clientEmail,
      createdAt: serverTimestamp(),
    };
    
    addDoc(clientCollectionRef, clientData)
        .then((clientRef) => {
            const subtotalCents = values.lineItems.reduce(
                (acc, item) => acc + item.quantity * item.unitPrice * 100,
                0
            );

            const invoiceCollectionRef = collection(
                firestore,
                `users/${user.uid}/accounts/${accountId}/invoices`
            );
            const newInvoiceRef = doc(invoiceCollectionRef);

            const invoiceData = {
                id: newInvoiceRef.id,
                ownerUid: user.uid,
                userAccountId: accountId,
                clientId: clientRef.id,
                clientName: values.clientName,
                clientEmail: values.clientEmail,
                invoiceNumber: `INV-${Date.now()}`,
                issueDate: new Date().toISOString(),
                dueDate: values.dueDate?.toISOString() || new Date().toISOString(),
                subtotalCents,
                totalCents: subtotalCents, // Assuming no tax/discounts for now
                currency: values.currency,
                status: 'draft' as const,
                lineItems: values.lineItems.map(item => ({...item, unitPrice: item.unitPrice * 100})),
                notes: values.notes,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            setDoc(newInvoiceRef, invoiceData)
                .then(() => {
                    onSuccess();
                })
                .catch((error) => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({
                        path: newInvoiceRef.path,
                        operation: 'create',
                        requestResourceData: invoiceData
                    }));
                });

        })
        .catch((error) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: clientCollectionRef.path,
                operation: 'create',
                requestResourceData: clientData
            }));
        })
        .finally(() => {
            setIsLoading(false);
        });

  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
                <FormField
                control={form.control}
                name="clientName"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Client Name</FormLabel>
                    <FormControl>
                        <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="clientEmail"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Client Email</FormLabel>
                    <FormControl>
                        <Input placeholder="client@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>
            <div className="space-y-4">
                 <FormField
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                        <FormLabel>Due Date</FormLabel>
                        <Popover>
                            <PopoverTrigger asChild>
                            <FormControl>
                                <Button
                                variant={"outline"}
                                className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                )}
                                >
                                {field.value ? (
                                    format(field.value, "PPP")
                                ) : (
                                    <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                            </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                date < new Date() || date < new Date("1900-01-01")
                                }
                                initialFocus
                            />
                            </PopoverContent>
                        </Popover>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a currency" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="USD">USD - US Dollar</SelectItem>
                                <SelectItem value="EUR">EUR - Euro</SelectItem>
                                <SelectItem value="GBP">GBP - British Pound</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
        </div>

        <div>
          <FormLabel>Line Items</FormLabel>
          <div className="space-y-4 mt-2">
            {fields.map((field, index) => (
              <div key={field.id} className="flex gap-4 items-end">
                <FormField
                  control={form.control}
                  name={`lineItems.${index}.description`}
                  render={({ field }) => (
                    <FormItem className="flex-grow">
                      <FormControl>
                        <Input placeholder="Item description" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`lineItems.${index}.quantity`}
                  render={({ field }) => (
                    <FormItem className="w-24">
                      <FormControl>
                        <Input type="number" placeholder="Qty" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`lineItems.${index}.unitPrice`}
                  render={({ field }) => (
                    <FormItem className="w-32">
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="Price" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
             <FormMessage>{form.formState.errors.lineItems?.message}</FormMessage>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ description: '', quantity: 1, unitPrice: 0 })}
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Add Line Item
            </Button>
          </div>
        </div>
        
        <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                    <Textarea
                    placeholder="Add any additional notes for the client..."
                    {...field}
                    />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
        />


        <div className="flex justify-end">
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Invoice
          </Button>
        </div>
      </form>
    </Form>
  );
}

