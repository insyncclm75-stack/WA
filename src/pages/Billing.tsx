import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Wallet,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  IndianRupee,
  TrendingUp,
  MessageSquare,
  FileText,
  Receipt,
  Loader2,
} from "lucide-react";

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface WalletData {
  balance: number;
  total_credited: number;
  total_debited: number;
}

interface Transaction {
  id: string;
  type: "credit" | "debit";
  category: string;
  amount: number;
  balance_after: number;
  description: string;
  reference_id: string;
  created_at: string;
}

interface UsageData {
  month: string;
  usage: {
    marketing: { count: number; cost: number; rate: number };
    utility: { count: number; cost: number; rate: number };
    authentication: { count: number; cost: number; rate: number };
  };
  platform_fee: number;
  subtotal: number;
  gst: number;
  total: number;
}

interface Invoice {
  id: string;
  month: string;
  platform_fee: number;
  marketing_count: number;
  marketing_cost: number;
  utility_count: number;
  utility_cost: number;
  auth_count: number;
  auth_cost: number;
  subtotal: number;
  gst_amount: number;
  total: number;
  status: string;
}

export default function Billing() {
  const { currentOrg, orgRole } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = orgRole === "admin";

  const [wallet, setWallet] = useState<WalletData>({ balance: 0, total_credited: 0, total_debited: 0 });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("1000");
  const [paying, setPaying] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);

    const [balRes, txRes, usageRes, invRes] = await Promise.all([
      supabase.functions.invoke("billing", { body: { action: "get_balance", org_id: currentOrg.id } }),
      supabase.functions.invoke("billing", { body: { action: "get_transactions", org_id: currentOrg.id, page: txPage } }),
      supabase.functions.invoke("billing", { body: { action: "get_usage", org_id: currentOrg.id } }),
      supabase.functions.invoke("billing", { body: { action: "get_invoices", org_id: currentOrg.id } }),
    ]);

    if (balRes.data?.wallet) setWallet(balRes.data.wallet);
    if (txRes.data?.transactions) { setTransactions(txRes.data.transactions); setTxTotal(txRes.data.total); }
    if (usageRes.data?.success) setUsage(usageRes.data);
    if (invRes.data?.invoices) setInvoices(invRes.data.invoices);

    setLoading(false);
  }, [currentOrg, txPage]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Load Razorpay script
  useEffect(() => {
    if (!document.getElementById("razorpay-sdk")) {
      const script = document.createElement("script");
      script.id = "razorpay-sdk";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      document.body.appendChild(script);
    }
  }, []);

  const handleAddFunds = async () => {
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount < 100) {
      toast({ variant: "destructive", title: "Invalid amount", description: "Minimum top-up is Rs 100." });
      return;
    }

    setPaying(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing", {
        body: { action: "create_order", org_id: currentOrg!.id, amount },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const options = {
        key: data.razorpay_key_id,
        amount: data.order.amount,
        currency: data.order.currency,
        order_id: data.order.id,
        name: "In-Sync",
        description: `Wallet top-up for ${currentOrg!.name}`,
        handler: async (response: any) => {
          // Verify payment
          const verifyRes = await supabase.functions.invoke("billing", {
            body: {
              action: "verify_payment",
              org_id: currentOrg!.id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              amount: data.order.amount,
            },
          });

          if (verifyRes.data?.success) {
            toast({ title: "Payment successful", description: `Rs ${amount} added to your wallet.` });
            setAddFundsOpen(false);
            fetchData();
          } else {
            toast({ variant: "destructive", title: "Verification failed", description: verifyRes.data?.error || "Please contact support." });
          }
          setPaying(false);
        },
        modal: {
          ondismiss: () => setPaying(false),
        },
        prefill: { email: user?.email },
        theme: { color: "#6366f1" },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
      setPaying(false);
    }
  };

  const formatCurrency = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
  const formatDate = (s: string) => new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  const categoryLabel = (cat: string) => {
    const labels: Record<string, string> = {
      topup: "Top-up",
      marketing_message: "Marketing",
      utility_message: "Utility",
      auth_message: "Authentication",
      platform_fee: "Platform Fee",
      gst: "GST",
      refund: "Refund",
      adjustment: "Adjustment",
    };
    return labels[cat] || cat;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Billing</h1>
          {isAdmin && (
            <Button onClick={() => setAddFundsOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Add Funds
            </Button>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Current Balance</p>
                  <p className={`text-2xl font-bold ${wallet.balance <= 0 ? "text-destructive" : ""}`}>
                    {formatCurrency(wallet.balance)}
                  </p>
                </div>
                <Wallet className="h-8 w-8 text-primary/30" />
              </div>
              {wallet.balance <= 500 && wallet.balance > 0 && (
                <p className="mt-2 text-xs text-amber-600">Low balance — add funds to keep sending.</p>
              )}
              {wallet.balance <= 0 && (
                <p className="mt-2 text-xs text-destructive">Sending blocked — please add funds.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Credited</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(wallet.total_credited)}</p>
                </div>
                <ArrowDownRight className="h-8 w-8 text-green-600/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Spent</p>
                  <p className="text-2xl font-bold">{formatCurrency(wallet.total_debited)}</p>
                </div>
                <ArrowUpRight className="h-8 w-8 text-muted-foreground/30" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="usage">
          <TabsList>
            <TabsTrigger value="usage" className="gap-2"><TrendingUp className="h-4 w-4" /> Usage</TabsTrigger>
            <TabsTrigger value="transactions" className="gap-2"><Receipt className="h-4 w-4" /> Transactions</TabsTrigger>
            <TabsTrigger value="invoices" className="gap-2"><FileText className="h-4 w-4" /> Invoices</TabsTrigger>
            <TabsTrigger value="pricing" className="gap-2"><IndianRupee className="h-4 w-4" /> Pricing</TabsTrigger>
          </TabsList>

          {/* Usage Tab */}
          <TabsContent value="usage">
            {usage && (
              <Card>
                <CardHeader>
                  <CardTitle>Current Month Usage — {usage.month}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Messages Sent</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell><Badge variant="default">Marketing</Badge></TableCell>
                        <TableCell className="text-right">{usage.usage.marketing.count}</TableCell>
                        <TableCell className="text-right">{formatCurrency(usage.usage.marketing.rate)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(usage.usage.marketing.cost)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><Badge variant="secondary">Utility</Badge></TableCell>
                        <TableCell className="text-right">{usage.usage.utility.count}</TableCell>
                        <TableCell className="text-right">{formatCurrency(usage.usage.utility.rate)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(usage.usage.utility.cost)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><Badge variant="outline">Authentication</Badge></TableCell>
                        <TableCell className="text-right">{usage.usage.authentication.count}</TableCell>
                        <TableCell className="text-right">{formatCurrency(usage.usage.authentication.rate)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(usage.usage.authentication.cost)}</TableCell>
                      </TableRow>
                      <TableRow className="border-t-2">
                        <TableCell colSpan={3} className="font-medium">Platform Fee</TableCell>
                        <TableCell className="text-right">{formatCurrency(usage.platform_fee)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={3} className="font-medium">Subtotal</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(usage.subtotal)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={3} className="text-muted-foreground">GST (18%)</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(usage.gst)}</TableCell>
                      </TableRow>
                      <TableRow className="border-t-2">
                        <TableCell colSpan={3} className="text-lg font-bold">Total</TableCell>
                        <TableCell className="text-right text-lg font-bold">{formatCurrency(usage.total)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle>Transaction History</CardTitle>
                <CardDescription>{txTotal} total transactions</CardDescription>
              </CardHeader>
              <CardContent>
                {transactions.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">No transactions yet.</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transactions.map((tx) => (
                          <TableRow key={tx.id}>
                            <TableCell className="text-xs">{formatDate(tx.created_at)}</TableCell>
                            <TableCell>
                              {tx.type === "credit" ? (
                                <Badge className="bg-green-100 text-green-800">Credit</Badge>
                              ) : (
                                <Badge variant="secondary">Debit</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{categoryLabel(tx.category)}</TableCell>
                            <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">{tx.description}</TableCell>
                            <TableCell className={`text-right font-mono ${tx.type === "credit" ? "text-green-600" : ""}`}>
                              {tx.type === "credit" ? "+" : "-"}{formatCurrency(tx.amount)}
                            </TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(tx.balance_after)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {txTotal > 20 && (
                      <div className="flex justify-center gap-2 pt-4">
                        <Button variant="outline" size="sm" disabled={txPage <= 1} onClick={() => setTxPage((p) => p - 1)}>
                          Previous
                        </Button>
                        <span className="flex items-center text-sm text-muted-foreground">Page {txPage}</span>
                        <Button variant="outline" size="sm" disabled={txPage * 20 >= txTotal} onClick={() => setTxPage((p) => p + 1)}>
                          Next
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices">
            <Card>
              <CardHeader>
                <CardTitle>Monthly Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                {invoices.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">No invoices yet. Invoices are generated at the end of each billing cycle.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Messages</TableHead>
                        <TableHead className="text-right">Message Cost</TableHead>
                        <TableHead className="text-right">Platform Fee</TableHead>
                        <TableHead className="text-right">GST</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium">{inv.month}</TableCell>
                          <TableCell className="text-right">{inv.marketing_count + inv.utility_count + inv.auth_count}</TableCell>
                          <TableCell className="text-right">{formatCurrency(inv.marketing_cost + inv.utility_cost + inv.auth_cost)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(inv.platform_fee)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(inv.gst_amount)}</TableCell>
                          <TableCell className="text-right font-bold">{formatCurrency(inv.total)}</TableCell>
                          <TableCell>
                            <Badge variant={inv.status === "paid" ? "default" : "secondary"}>
                              {inv.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pricing Tab */}
          <TabsContent value="pricing">
            <Card>
              <CardHeader>
                <CardTitle>Pricing</CardTitle>
                <CardDescription>All prices are exclusive of GST (18%)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border p-4 text-center">
                    <MessageSquare className="mx-auto mb-2 h-8 w-8 text-primary" />
                    <p className="text-sm text-muted-foreground">Marketing</p>
                    <p className="text-2xl font-bold">Re 1.00</p>
                    <p className="text-xs text-muted-foreground">per message sent</p>
                  </div>
                  <div className="rounded-lg border p-4 text-center">
                    <MessageSquare className="mx-auto mb-2 h-8 w-8 text-blue-500" />
                    <p className="text-sm text-muted-foreground">Utility</p>
                    <p className="text-2xl font-bold">Re 0.20</p>
                    <p className="text-xs text-muted-foreground">per message sent</p>
                  </div>
                  <div className="rounded-lg border p-4 text-center">
                    <MessageSquare className="mx-auto mb-2 h-8 w-8 text-amber-500" />
                    <p className="text-sm text-muted-foreground">Authentication</p>
                    <p className="text-2xl font-bold">Re 0.20</p>
                    <p className="text-xs text-muted-foreground">per message sent</p>
                  </div>
                  <div className="rounded-lg border p-4 text-center">
                    <IndianRupee className="mx-auto mb-2 h-8 w-8 text-green-500" />
                    <p className="text-sm text-muted-foreground">Platform Fee</p>
                    <p className="text-2xl font-bold">Rs 1,500</p>
                    <p className="text-xs text-muted-foreground">per month</p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  GST at 18% is charged on all amounts. Messages are charged on sent status, not delivery.
                  Sending requires a positive wallet balance.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Funds Dialog */}
      <Dialog open={addFundsOpen} onOpenChange={setAddFundsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Funds</DialogTitle>
            <DialogDescription>Top up your wallet balance via Razorpay.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Amount (Rs)</Label>
              <Input
                type="number"
                min="100"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                placeholder="1000"
              />
              <p className="text-xs text-muted-foreground">Minimum Rs 100</p>
            </div>
            <div className="flex gap-2">
              {[500, 1000, 2000, 5000].map((amt) => (
                <Button
                  key={amt}
                  variant={topUpAmount === String(amt) ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTopUpAmount(String(amt))}
                >
                  Rs {amt.toLocaleString("en-IN")}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFundsOpen(false)}>Cancel</Button>
            <Button onClick={handleAddFunds} disabled={paying} className="gap-2">
              {paying ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</> : <>Pay {formatCurrency(parseFloat(topUpAmount) || 0)}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
