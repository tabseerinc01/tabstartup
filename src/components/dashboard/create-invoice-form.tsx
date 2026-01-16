
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
import { Separator } from '@/components/ui/separator';
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

  const watchedLineItems = form.watch('lineItems');
  const watchedCurrency = form.watch('currency');

  const subtotal = watchedLineItems.reduce((acc, item) => {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    return acc + quantity * unitPrice;
  }, 0);

  const total = subtotal; // Assuming no tax/discounts for now

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };


  const onSubmit = (values: InvoiceFormValues) => {
    setIsLoading(true);

    const clientCollectionRef = collection(
      firestore,
      `users/${user.uid}/accounts/${accountId}/clients`
    );
    const clientRef = doc(clientCollectionRef);
    const clientData = {
      id: clientRef.id,
      userAccountId: accountId,
      name: values.clientName,
      email: values.clientEmail,
      createdAt: new Date().toISOString(),
    };
    
    setDoc(clientRef, clientData)
        .then(() => {
            const subtotalCents = values.lineItems.reduce(
                (acc, item) => acc + item.quantity * (item.unitPrice * 100),
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
            <div className="mt-2 space-y-4">
                <div className="hidden md:grid md:grid-cols-12 gap-4">
                    <div className="md:col-span-5"><FormLabel>Description</FormLabel></div>
                    <div className="md:col-span-2"><FormLabel>Quantity</FormLabel></div>
                    <div className="md:col-span-2"><FormLabel>Unit Price</FormLabel></div>
                    <div className="md:col-span-2 text-right"><FormLabel>Total</FormLabel></div>
                </div>
                {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-start md:gap-4">
                    <div className="col-span-12 md:col-span-5">
                    <FormField
                        control={form.control}
                        name={`lineItems.${index}.description`}
                        render={({ field }) => (
                            <FormItem>
                            {index === 0 && <FormLabel className="md:hidden">Description</FormLabel>}
                            <FormControl>
                                <Input placeholder="Item description" {...field} />
                            </FormControl>
                             <FormMessage />
                            </FormItem>
                        )}
                        />
                    </div>

                    <div className="col-span-3 md:col-span-2">
                        <FormField
                        control={form.control}
                        name={`lineItems.${index}.quantity`}
                        render={({ field }) => (
                            <FormItem>
                            {index === 0 && <FormLabel className="md:hidden">Quantity</FormLabel>}
                            <FormControl>
                                <Input type="number" placeholder="Qty" {...field} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                    </div>
                     <div className="col-span-4 md:col-span-2">
                        <FormField
                        control={form.control}
                        name={`lineItems.${index}.unitPrice`}
                        render={({ field }) => (
                            <FormItem>
                             {index === 0 && <FormLabel className="md:hidden">Unit Price</FormLabel>}
                            <FormControl>
                                <Input type="number" step="0.01" placeholder="Price" {...field} />
                            </FormControl>
                             <FormMessage />
                            </FormItem>
                        )}
                        />
                    </div>
                    
                    <div className="col-span-4 md:col-span-2 text-right">
                        {index === 0 && <FormLabel className="md:hidden">Total</FormLabel>}
                        <p className="font-medium mt-2.5">
                            {formatCurrency((watchedLineItems[index]?.quantity || 0) * (watchedLineItems[index]?.unitPrice || 0), watchedCurrency)}
                        </p>
                    </div>

                    <div className="col-span-1 flex items-center pt-2">
                        <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
                ))}
                <FormMessage>{form.formState.errors.lineItems?.root?.message}</FormMessage>
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

        <div className="flex justify-end mt-6">
            <div className="w-full md:w-2/5 lg:w-1/3 space-y-2">
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(subtotal, watchedCurrency)}</span>
                </div>
                {/* Add tax/discounts here if needed in the future */}
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>{formatCurrency(total, watchedCurrency)}</span>
                </div>
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

