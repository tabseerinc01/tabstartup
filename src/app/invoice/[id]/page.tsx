import { notFound } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/logo";
import { invoices, type Invoice } from "@/lib/placeholder-data";
import { format } from "date-fns";

export default function PublicInvoicePage({
  params,
}: {
  params: { id: string };
}) {
  const invoice = invoices.find((inv) => inv.id === params.id);

  if (!invoice) {
    notFound();
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "Paid":
        return "default";
      case "Unpaid":
        return "secondary";
      case "Overdue":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <div className="min-h-screen bg-muted/40 py-12">
      <div className="container mx-auto max-w-4xl">
        <Card className="p-4 sm:p-8 md:p-12">
          <CardHeader className="p-0">
            <div className="flex flex-col md:flex-row justify-between gap-4">
              <div>
                <Logo />
                <p className="text-muted-foreground mt-2 text-sm">From TabEdge User</p>
              </div>
              <div className="text-left md:text-right">
                <h1 className="text-3xl font-bold text-foreground">Invoice</h1>
                <p className="text-muted-foreground">{invoice.id.toUpperCase()}</p>
                <div className="mt-2">
                    <Badge variant={getStatusBadgeVariant(invoice.status)} className="text-lg py-1 px-3">
                    {invoice.status}
                    </Badge>
                </div>
              </div>
            </div>
            <Separator className="my-8" />
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold mb-2">Bill To:</h3>
                <p className="font-bold">{invoice.clientName}</p>
                <p className="text-muted-foreground">{invoice.clientEmail}</p>
              </div>
              <div className="text-left md:text-right">
                <p>
                  <strong className="text-muted-foreground">Issue Date:</strong>{" "}
                  {format(new Date(invoice.issuedDate), "PPP")}
                </p>
                <p>
                  <strong className="text-muted-foreground">Due Date:</strong>{" "}
                  {format(new Date(invoice.dueDate), "PPP")}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 mt-8">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50%]">Description</TableHead>
                  <TableHead className="text-center">Quantity</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.description}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.price)}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.price * item.quantity)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Separator className="my-8" />
            <div className="flex justify-end">
              <div className="w-full md:w-1/2 lg:w-1/3 space-y-2">
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(invoice.amount)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax (0%)</span>
                    <span>{formatCurrency(0)}</span>
                </div>
                <Separator />
                 <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>{formatCurrency(invoice.amount)}</span>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="p-0 mt-8 flex-col gap-4 items-start">
             <p className="text-sm text-muted-foreground">Thank you for your business!</p>
             {invoice.status !== "Paid" && (
                <Button size="lg" className="w-full md:w-auto">
                    Pay Now - {formatCurrency(invoice.amount)}
                </Button>
             )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
