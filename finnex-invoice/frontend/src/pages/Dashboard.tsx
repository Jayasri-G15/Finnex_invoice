import { useState } from 'react'
import { 
  IndianRupee, Users, FileText, CheckCircle2, RefreshCw, X, 
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Mail, 
  History, ArrowUpRight, ArrowDownLeft, Calendar, BarChart3,
  AlertTriangle, BookOpen
} from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchDashboardSummary, fetchLedgers, updateInvoice } from '@/api/invoices'
import { InvoiceDetailModal, type Invoice } from '@/components/InvoiceDetailModal'

export const Dashboard = ({ onViewAllInvoices }: { onViewAllInvoices?: () => void }) => {
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [showSyncNotice, setShowSyncNotice] = useState(
    new URLSearchParams(window.location.search).get('sync') === 'started'
  )
  const [recentInvoicePage, setRecentInvoicePage] = useState(0)
  const invoicesPerPage = 5

  const { data: summary, isLoading } = useQuery({
    queryKey: ['dashboardSummary'],
    queryFn: fetchDashboardSummary,
  })

  const queryClient = useQueryClient()

  const { data: ledgers = [] } = useQuery<{
    ledger_code: string
    ledger_name: string
  }[]>({
    queryKey: ['ledgers'],
    queryFn: fetchLedgers,
    enabled: activeTab === 'ledger-intelligence'
  })

  const manualMapMutation = useMutation({
    mutationFn: async ({ invoiceId, ledgerCode }: { invoiceId: string; ledgerCode: string }) => {
      return updateInvoice(invoiceId, { ledger_code: ledgerCode, invoice_type: ledgerCode })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] })
    }
  })

  const handleSyncGmail = () => {
    const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
    window.location.href = `${backendUrl}/auth/google/login`
  }

  const closeSyncNotice = () => {
    setShowSyncNotice(false)
    const url = new URL(window.location.href)
    url.searchParams.delete('sync')
    window.history.replaceState({}, '', url.toString())
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  // Calculate Cashflow Percentage
  const inflow = summary?.cashflow?.cash_inflow ?? 0
  const outflow = summary?.cashflow?.cash_outflow ?? 0
  const totalCash = inflow + outflow
  const inflowPercent = totalCash > 0 ? (inflow / totalCash) * 100 : 50

  return (
    <div className="space-y-6">
      {showSyncNotice && (
        <div className="bg-primary/10 border border-primary/20 text-foreground px-4 py-3 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3">
            <RefreshCw className="h-4 w-4 text-primary animate-spin" />
            <p className="text-sm font-medium">Google is syncing your financial emails and events in the background. Please wait...</p>
          </div>
          <button 
            onClick={closeSyncNotice}
            className="text-muted-foreground hover:text-foreground hover:bg-secondary p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Dashboard Title & Sync */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Financial Communication Intelligence</h2>
          <p className="text-muted-foreground text-sm mt-1">Real-time mapping of financial communications and their economic impact.</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <button 
            onClick={handleSyncGmail}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium text-sm shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            Sync Mailbox
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border gap-2 overflow-x-auto scrollbar-none">
        {[
          { id: 'overview', label: 'Overview & Cashflow', icon: IndianRupee },
          { id: 'revenue-expense', label: 'Revenue & Expenses', icon: TrendingUp },
          { id: 'events', label: 'Event Counters', icon: FileText },
          { id: 'mail-intelligence', label: 'Mail Intelligence & Timeline', icon: Mail },
          { id: 'ledger-intelligence', label: 'Ledger Intelligence', icon: BarChart3 }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 font-medium text-sm border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === tab.id 
                ? 'border-primary text-primary font-semibold' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-6 shadow-sm animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="h-4 bg-muted rounded w-24"></div>
                  <div className="w-8 h-8 bg-muted rounded-lg"></div>
                </div>
                <div className="mt-4"><div className="h-8 bg-muted rounded w-28"></div></div>
              </div>
            ))}
          </div>
          <div className="h-72 w-full bg-secondary/15 animate-pulse rounded-lg flex items-center justify-center">
            <span className="text-sm text-muted-foreground">Loading dashboard intelligence...</span>
          </div>
        </div>
      ) : (
        <>
          {/* TAB 1: OVERVIEW & CASHFLOW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Key Cards */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 animate-in fade-in duration-300">
                {[
                  { name: 'Total Expense Spend', value: formatCurrency(summary?.total_spend ?? 0), icon: IndianRupee, color: 'text-primary' },
                  { name: 'Net Cash Flow', value: formatCurrency(summary?.cashflow?.net_cash_flow ?? 0), icon: TrendingUp, color: (summary?.cashflow?.net_cash_flow ?? 0) >= 0 ? 'text-emerald-500' : 'text-rose-500' },
                  { name: 'Active Vendors', value: (summary?.active_vendors ?? 0).toLocaleString(), icon: Users, color: 'text-primary' },
                  { name: 'Avg. Confidence Score', value: `${summary?.avg_confidence ?? 0}%`, icon: CheckCircle2, color: 'text-emerald-500' },
                ].map((item) => (
                  <div key={item.name} className="bg-card border border-border rounded-xl p-6 shadow-sm hover:border-border/80 transition-all">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-muted-foreground truncate">{item.name}</p>
                      <div className="p-2 bg-secondary rounded-lg">
                        <item.icon className={`h-4 w-4 ${item.color}`} />
                      </div>
                    </div>
                    <div className="mt-4">
                      <p className="text-2xl font-semibold text-foreground">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Cashflow visual comparison */}
              <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4 animate-in fade-in duration-300">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Cashflow Analysis</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Visual representation of settled income vs expenses.</p>
                  </div>
                  <span className="text-sm font-bold text-foreground">
                    Net: {formatCurrency(summary?.cashflow?.net_cash_flow ?? 0)}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-secondary/20 p-4 rounded-lg flex items-center justify-between border border-border/40">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-500/10 rounded-lg"><ArrowDownLeft className="h-5 w-5 text-emerald-500" /></div>
                      <div>
                        <p className="text-xs text-muted-foreground">Settled Cash Inflow</p>
                        <p className="text-lg font-semibold text-foreground">{formatCurrency(inflow)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-secondary/20 p-4 rounded-lg flex items-center justify-between border border-border/40">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-rose-500/10 rounded-lg"><ArrowUpRight className="h-5 w-5 text-rose-500" /></div>
                      <div>
                        <p className="text-xs text-muted-foreground">Settled Cash Outflow</p>
                        <p className="text-lg font-semibold text-foreground">{formatCurrency(outflow)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Inflow ({Math.round(inflowPercent)}%)</span>
                    <span>Outflow ({Math.round(100 - inflowPercent)}%)</span>
                  </div>
                  <div className="w-full bg-secondary h-3.5 rounded-full overflow-hidden flex">
                    <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${inflowPercent}%` }} />
                    <div className="bg-rose-500 h-full transition-all duration-500" style={{ width: `${100 - inflowPercent}%` }} />
                  </div>
                </div>
              </div>

              {/* Spend chart */}
              <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                <h3 className="text-base font-semibold leading-6 text-foreground mb-4">Spend Trends (Expenses Overview)</h3>
                {!summary || summary.processed_invoices === 0 ? (
                  <div className="h-72 w-full border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-center p-6 bg-secondary/5">
                    <FileText className="w-10 h-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm font-medium text-foreground">No financial data to display</p>
                  </div>
                ) : (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={summary.spend_overview} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} dy={10} />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
                          tickFormatter={(value) => value >= 100000 ? `₹${(value/100000).toFixed(1).replace(/\.0$/, '')}L` : value >= 1000 ? `₹${(value/1000).toFixed(1).replace(/\.0$/, '')}k` : `₹${value}`} 
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                          itemStyle={{ color: 'hsl(var(--primary))' }}
                          formatter={(value) => [formatCurrency(Number(value)), 'Spend']}
                        />
                        <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorTotal)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: REVENUE & EXPENSES */}
          {activeTab === 'revenue-expense' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-300">
              {/* Revenue Card */}
              <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6 hover:border-green-500/30 transition-all duration-300">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-green-500/10 rounded-lg"><TrendingDown className="h-5 w-5 text-green-500" /></div>
                    <div>
                      <h3 className="text-lg font-bold text-foreground">Revenue Summary</h3>
                      <p className="text-xs text-muted-foreground">Inflows, Receivables, and Customer Payments</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-green-550/10 text-green-600 rounded-full">REVENUE</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Revenue Raised', value: formatCurrency(summary?.revenue?.revenue_raised ?? 0) },
                    { label: 'Revenue Received', value: formatCurrency(summary?.revenue?.revenue_received ?? 0) },
                    { label: 'Pending Revenue', value: formatCurrency(summary?.revenue?.pending_revenue ?? 0) },
                    { label: 'Overdue Revenue', value: formatCurrency(summary?.revenue?.overdue_revenue ?? 0) },
                  ].map((item, idx) => (
                    <div key={idx} className="bg-secondary/10 p-4 rounded-lg border border-border/40">
                      <p className="text-xs text-muted-foreground font-medium">{item.label}</p>
                      <p className="text-lg font-bold text-foreground mt-1">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-secondary/15 p-4 rounded-lg flex items-center justify-between text-sm">
                  <span className="text-muted-foreground font-medium">Customer Payments Received</span>
                  <span className="font-bold text-green-500 text-base">{(summary?.revenue?.customer_payments_count ?? 0)}</span>
                </div>
              </div>

              {/* Expense Card */}
              <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6 hover:border-orange-500/30 transition-all duration-300">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-orange-500/10 rounded-lg"><TrendingUp className="h-5 w-5 text-orange-500" /></div>
                    <div>
                      <h3 className="text-lg font-bold text-foreground">Expense Summary</h3>
                      <p className="text-xs text-muted-foreground">Outflows, Payables, and Vendor Payments</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-orange-550/10 text-orange-600 rounded-full">EXPENSES</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Expenses Raised', value: formatCurrency(summary?.expense?.expenses_raised ?? 0) },
                    { label: 'Expenses Paid', value: formatCurrency(summary?.expense?.expenses_paid ?? 0) },
                    { label: 'Pending Expenses', value: formatCurrency(summary?.expense?.pending_expenses ?? 0) },
                    { label: 'Overdue Expenses', value: formatCurrency(summary?.expense?.overdue_expenses ?? 0) },
                  ].map((item, idx) => (
                    <div key={idx} className="bg-secondary/10 p-4 rounded-lg border border-border/40">
                      <p className="text-xs text-muted-foreground font-medium">{item.label}</p>
                      <p className="text-lg font-bold text-foreground mt-1">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-secondary/15 p-4 rounded-lg flex items-center justify-between text-sm">
                  <span className="text-muted-foreground font-medium">Vendor Payments Disbursed</span>
                  <span className="font-bold text-orange-500 text-base">{(summary?.expense?.vendor_payments_count ?? 0)}</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: EVENT COUNTERS */}
          {activeTab === 'events' && (
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6 animate-in fade-in duration-300">
              <div>
                <h3 className="text-base font-semibold text-foreground">Communication Event Statuses</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Pill counters classifying the state of financial dialogues from your emails.</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {Object.entries(summary?.event_counts ?? {}).map(([event, count]) => {
                  // Determine colors based on event category
                  let colors = 'bg-secondary text-secondary-foreground border-border'
                  const ev = event.toLowerCase()
                  if (ev.includes('paid') || ev.includes('completed') || ev.includes('received') || ev.includes('confirmed')) {
                    colors = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30'
                  } else if (ev.includes('overdue') || ev.includes('reminder')) {
                    colors = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30'
                  } else if (ev.includes('pending') || ev.includes('requested') || ev.includes('raised') || ev.includes('renewal')) {
                    colors = 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30'
                  } else if (ev.includes('cancelled') || ev.includes('rejected')) {
                    colors = 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/20 dark:text-slate-400 dark:border-slate-900/30'
                  }

                  return (
                    <div key={event} className={`border px-4 py-3 rounded-xl flex items-center justify-between ${colors}`}>
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">{event.replace('_', ' ')}</span>
                        <span className="text-xl font-bold mt-1">{count as number}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* TAB 4: MAIL INTELLIGENCE & TIMELINE */}
          {activeTab === 'mail-intelligence' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Mail stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl"><Mail className="h-6 w-6" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sent Financial Communications</p>
                    <p className="text-xl font-bold text-foreground">{(summary?.mail_intelligence?.sent_emails_count ?? 0)}</p>
                  </div>
                </div>
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-purple-500/10 text-purple-500 rounded-xl"><Mail className="h-6 w-6" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Received Financial Communications</p>
                    <p className="text-xl font-bold text-foreground">{(summary?.mail_intelligence?.received_emails_count ?? 0)}</p>
                  </div>
                </div>
              </div>

              {/* Vertical timeline */}
              <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Financial Activity Timeline</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Chronological feed of classified email dialogues and transactions.</p>
                </div>

                {!summary || summary?.mail_intelligence?.timeline?.length === 0 ? (
                  <div className="h-48 border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-center p-6 bg-secondary/5">
                    <History className="w-10 h-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm font-medium text-foreground">No financial activity recorded</p>
                  </div>
                ) : (
                  <div className="relative border-l-2 border-border ml-3.5 space-y-6">
                    {summary.mail_intelligence.timeline.map((event: any) => {
                      const isSent = event.email_direction === 'MAIL_SENT'
                      const isRevenue = event.transaction_type === 'REVENUE'
                      
                      const circleColors = isSent 
                        ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 border-blue-500' 
                        : 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 border-purple-500'
                      
                      const badgeColors = isRevenue
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'

                      return (
                        <div key={event.id} className="relative pl-6 group">
                          {/* Timeline node */}
                          <div className={`absolute -left-3.5 top-0.5 w-6.5 h-6.5 rounded-full border-2 flex items-center justify-center z-10 ${circleColors}`}>
                            <Mail className="h-3 w-3" />
                          </div>

                          {/* Content card */}
                          <div 
                            onClick={() => {
                              // Retrieve full invoice object for the modal
                              const matchingInvoice = summary.recent_invoices.find((i: any) => i.id === event.invoice_id)
                              if (matchingInvoice) {
                                setSelectedInvoice(matchingInvoice)
                              }
                            }}
                            className="bg-secondary/15 hover:bg-secondary/25 border border-border/50 rounded-xl p-4 transition-all duration-200 cursor-pointer space-y-2"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badgeColors}`}>
                                  {event.transaction_type}
                                </span>
                                <span className="font-semibold text-foreground text-xs uppercase tracking-wide">
                                  {event.financial_event.replace('_', ' ')}
                                </span>
                              </div>
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(event.created_at).toLocaleString('en-US', {
                                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                })}
                              </span>
                            </div>

                            <div>
                              <p className="text-sm font-semibold text-foreground">{event.subject || 'No Subject'}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {isSent ? 'To' : 'From'}: <span className="font-medium text-foreground">{event.sender || 'Unknown'}</span>
                              </p>
                            </div>

                            <div className="flex justify-between items-center border-t border-border/40 pt-2 text-xs">
                              <span className="text-muted-foreground">
                                Counterpart: <span className="font-semibold text-foreground">{event.counterpart_name || '—'}</span>
                              </span>
                              <span className="font-bold text-foreground">
                                {formatCurrency(event.amount)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
            </div>
          </div>
          )}

          {/* TAB 5: LEDGER INTELLIGENCE */}
          {activeTab === 'ledger-intelligence' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Summary Cards Grid */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    name: 'Avg. Mapping Confidence',
                    value: `${summary?.ledger_intelligence?.confidence_stats?.avg_confidence ?? 0}%`,
                    desc: 'AI confidence score across mappings',
                    color: 'text-primary'
                  },
                  {
                    name: 'Auto-Categorization Rate',
                    value: `${summary?.ledger_intelligence?.confidence_stats?.accuracy_rate ?? 0}%`,
                    desc: 'Confidence >= 80% mappings count',
                    color: 'text-emerald-500'
                  },
                  {
                    name: 'Mapped Transactions',
                    value: (summary?.ledger_intelligence?.confidence_stats?.categorized_count ?? 0).toLocaleString(),
                    desc: 'Successfully mapped to COA',
                    color: 'text-blue-500'
                  },
                  {
                    name: 'Uncategorized (Needs Review)',
                    value: (summary?.ledger_intelligence?.confidence_stats?.uncategorized_count ?? 0).toLocaleString(),
                    desc: 'Requires manual mapping override',
                    color: (summary?.ledger_intelligence?.confidence_stats?.uncategorized_count ?? 0) > 0 ? 'text-rose-500 animate-pulse' : 'text-muted-foreground'
                  }
                ].map((item, idx) => (
                  <div key={idx} className="bg-card border border-border rounded-xl p-5 shadow-sm hover:border-border/80 transition-all">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{item.name}</p>
                    <p className={`text-2xl font-bold mt-2 ${item.color}`}>{item.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{item.desc}</p>
                  </div>
                ))}
              </div>

              {/* Distributions Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Expense by Ledger */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Expense Distribution by Ledger</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Top expenditure codes and Chart of Accounts mapping.</p>
                  </div>
                  <div className="h-72 w-full mt-6">
                    {summary?.ledger_intelligence?.expense_by_ledger?.length === 0 ? (
                      <div className="h-full border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-center p-6 bg-secondary/5">
                        <BookOpen className="w-10 h-10 text-muted-foreground/30 mb-3" />
                        <p className="text-sm font-medium text-foreground">No expense mappings available</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={summary.ledger_intelligence.expense_by_ledger.slice(0, 8)}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                          <YAxis dataKey="code" type="category" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--foreground))', fontSize: 10, fontWeight: 'bold' }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                            itemStyle={{ color: 'hsl(var(--primary))' }}
                            formatter={(value, _name, props) => [formatCurrency(Number(value)), props.payload.name]}
                          />
                          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={12} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Income by Ledger */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Income Distribution by Ledger</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Top revenue streams and customer categories.</p>
                  </div>
                  <div className="h-72 w-full mt-6">
                    {summary?.ledger_intelligence?.income_by_ledger?.length === 0 ? (
                      <div className="h-full border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-center p-6 bg-secondary/5">
                        <BookOpen className="w-10 h-10 text-muted-foreground/30 mb-3" />
                        <p className="text-sm font-medium text-foreground">No income mappings available</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={summary.ledger_intelligence.income_by_ledger.slice(0, 8)}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                          <YAxis dataKey="code" type="category" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--foreground))', fontSize: 10, fontWeight: 'bold' }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                            itemStyle={{ color: 'hsl(var(--emerald-550))' }}
                            formatter={(value, _name, props) => [formatCurrency(Number(value)), props.payload.name]}
                          />
                          <Bar dataKey="value" fill="hsl(var(--emerald-500))" radius={[0, 4, 4, 0]} barSize={12} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              {/* Trends & Lists Row */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Ledger-wise Monthly Trends */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm lg:col-span-8">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Ledger-wise Monthly Trends</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Historical overview of key accounts over the last 6 months.</p>
                  </div>
                  <div className="h-72 w-full mt-6">
                    {summary?.ledger_intelligence?.monthly_trends?.length === 0 ? (
                      <div className="h-full border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-center p-6 bg-secondary/5">
                        <BookOpen className="w-10 h-10 text-muted-foreground/30 mb-3" />
                        <p className="text-sm font-medium text-foreground">No historical trends data</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={summary.ledger_intelligence.monthly_trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickFormatter={(val) => `₹${val}`} />
                          <Tooltip
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                          />
                          <Legend />
                          {/* Dynamically render areas for each key in monthly_trends except 'name' */}
                          {Object.keys(summary.ledger_intelligence.monthly_trends[0] || {}).filter(k => k !== 'name').map((key, i) => {
                            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444']
                            const color = colors[i % colors.length]
                            return (
                              <Area key={key} type="monotone" dataKey={key} stackId="1" stroke={color} fill={color} fillOpacity={0.15} />
                            )
                          })}
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Top Ledgers Ranks List */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm lg:col-span-4 flex flex-col justify-between">
                  <div className="space-y-6">
                    {/* Top Expense Ledgers */}
                    <div>
                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Top Expense Accounts</h4>
                      <div className="mt-3 space-y-2">
                        {summary?.ledger_intelligence?.top_expense_ledgers?.slice(0, 3).map((item: any, i: number) => (
                          <div key={i} className="flex flex-col gap-1">
                            <div className="flex justify-between text-xs font-medium text-foreground">
                              <span className="truncate max-w-[150px]" title={`${item.code} - ${item.name}`}>{item.code} - {item.name}</span>
                              <span>{formatCurrency(item.value)}</span>
                            </div>
                            <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-primary h-full rounded-full"
                                style={{ width: `${(item.value / (summary?.ledger_intelligence?.top_expense_ledgers[0]?.value || 1)) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                        {(!summary?.ledger_intelligence?.top_expense_ledgers || summary.ledger_intelligence.top_expense_ledgers.length === 0) && (
                          <p className="text-xs text-muted-foreground italic">No expense ledgers mapped.</p>
                        )}
                      </div>
                    </div>

                    {/* Top Revenue Ledgers */}
                    <div>
                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-4">Top Income Accounts</h4>
                      <div className="mt-3 space-y-2">
                        {summary?.ledger_intelligence?.top_revenue_ledgers?.slice(0, 3).map((item: any, i: number) => (
                          <div key={i} className="flex flex-col gap-1">
                            <div className="flex justify-between text-xs font-medium text-foreground">
                              <span className="truncate max-w-[150px]" title={`${item.code} - ${item.name}`}>{item.code} - {item.name}</span>
                              <span>{formatCurrency(item.value)}</span>
                            </div>
                            <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-emerald-500 h-full rounded-full"
                                style={{ width: `${(item.value / (summary?.ledger_intelligence?.top_revenue_ledgers[0]?.value || 1)) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                        {(!summary?.ledger_intelligence?.top_revenue_ledgers || summary.ledger_intelligence.top_revenue_ledgers.length === 0) && (
                          <p className="text-xs text-muted-foreground italic">No income ledgers mapped.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Uncategorized Transactions Section */}
              <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Uncategorized Transactions requiring Attention</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">These items have a classification confidence score below 80% and must be mapped manually.</p>
                  </div>
                </div>

                {summary?.ledger_intelligence?.uncategorized_transactions?.length === 0 ? (
                  <div className="h-32 border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-center p-4 bg-secondary/5">
                    <p className="text-sm font-semibold text-emerald-500">All caught up!</p>
                    <p className="text-xs text-muted-foreground mt-1">100% of your transactions are categorized with high confidence.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-border rounded-lg bg-secondary/5">
                    <table className="w-full text-sm text-left border-collapse">
                      <thead className="bg-secondary/35 text-muted-foreground font-semibold text-xs border-b border-border">
                        <tr>
                          <th className="px-4 py-2">Invoice / Vendor</th>
                          <th className="px-4 py-2">Type</th>
                          <th className="px-4 py-2 text-right">Amount</th>
                          <th className="px-4 py-2">Date</th>
                          <th className="px-4 py-2">AI Confidence</th>
                          <th className="px-4 py-2">Assign Ledger Category</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40 text-foreground">
                        {summary.ledger_intelligence.uncategorized_transactions.map((tx: any) => (
                          <tr key={tx.id} className="hover:bg-secondary/10 text-xs">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-foreground">{tx.vendor_name || 'Unknown'}</div>
                              <div className="text-[10px] text-muted-foreground">{tx.invoice_number || 'No number'}</div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-1.5 py-0.2 rounded font-bold text-[10px] ${tx.transaction_type === 'REVENUE' ? 'bg-green-100/50 text-green-700 dark:bg-green-950/20 dark:text-green-400' : 'bg-orange-100/50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400'}`}>
                                {tx.transaction_type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-medium">{formatCurrency(tx.total_amount || 0)}</td>
                            <td className="px-4 py-3 text-muted-foreground">{tx.invoice_date || '—'}</td>
                            <td className="px-4 py-3 font-semibold text-rose-500">
                              {tx.ledger_confidence ? `${tx.ledger_confidence.toFixed(1)}%` : '0.0%'}
                            </td>
                            <td className="px-4 py-3">
                              <select
                                onChange={e => {
                                  if (e.target.value) {
                                    manualMapMutation.mutate({ invoiceId: tx.id, ledgerCode: e.target.value })
                                  }
                                }}
                                className="block w-full max-w-[200px] px-2 py-1 border border-border rounded bg-background text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all cursor-pointer"
                              >
                                <option value="">Assign Ledger...</option>
                                {ledgers.map((l: any) => (
                                  <option key={l.ledger_code} value={l.ledger_code}>
                                    {l.ledger_code} - {l.ledger_name}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recent Invoices list underneath tabs */}
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm animate-in fade-in duration-300">
            <h3 className="text-base font-semibold leading-6 text-foreground mb-4">Recent Financial Documents</h3>
            {summary.recent_invoices.length === 0 ? (
              <div className="h-48 border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-center p-6 bg-secondary/5">
                <FileText className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-foreground">No documents extracted</p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {(() => {
                    const pageCount = Math.ceil((summary?.recent_invoices?.length || 0) / invoicesPerPage)
                    const currentPage = Math.min(recentInvoicePage, Math.max(0, pageCount - 1))
                    const paginatedInvoices = (summary?.recent_invoices || []).slice(
                      currentPage * invoicesPerPage,
                      (currentPage + 1) * invoicesPerPage
                    )
                    
                    return (
                      <>
                        {paginatedInvoices.map((inv: any) => {
                          const vendorAbbr = inv.vendor_name 
                            ? inv.vendor_name.split(' ').map((n: string) => n[0]).join('').slice(0, 3).toUpperCase()
                            : 'INV'
                          
                          const isPaid = inv.status?.toLowerCase() === 'paid' || inv.status?.toLowerCase() === 'completed' || inv.status?.toLowerCase() === 'received'
                          const isPending = inv.status?.toLowerCase() === 'pending'
                          const statusColor = isPaid ? 'text-green-500' : isPending ? 'text-yellow-500' : 'text-red-500'

                          return (
                            <div 
                              key={inv.id} 
                              onClick={() => setSelectedInvoice(inv)}
                              className="flex items-center justify-between py-2.5 hover:bg-secondary/20 rounded-lg px-2 -mx-2 transition-colors cursor-pointer border border-transparent hover:border-border/20"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-medium text-sm">
                                  {vendorAbbr}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-foreground max-w-[120px] sm:max-w-[200px] truncate">
                                      {inv.vendor_name || 'Unknown Vendor'}
                                    </p>
                                    <span className={`px-1.5 py-0.2 text-[9px] font-bold rounded ${inv.transaction_type === 'REVENUE' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                      {inv.transaction_type || 'EXPENSE'}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5 mt-0.5">
                                    <span>{inv.invoice_number || 'No Number'}</span>
                                    {inv.invoice_type && (
                                      <span className="px-1.5 py-0.2 text-[9px] font-semibold bg-primary/10 text-primary rounded">
                                        {inv.invoice_type}
                                      </span>
                                    )}
                                    {inv.financial_event && (
                                      <span className="px-1.5 py-0.2 text-[9px] font-semibold bg-secondary text-secondary-foreground rounded uppercase">
                                        {inv.financial_event}
                                      </span>
                                    )}
                                    {inv.is_duplicate && (
                                      <span className="px-1.5 py-0.2 text-[9px] font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400 rounded">
                                        Duplicate
                                      </span>
                                    )}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold text-foreground">
                                  {formatCurrency(inv.total_amount ?? 0)}
                                </p>
                                <p className={`text-xs ${statusColor} font-medium capitalize mt-0.5`}>
                                  {inv.status || 'pending'}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                        
                        {pageCount > 1 && (
                          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                            <span className="text-xs text-muted-foreground font-medium">
                              Page {currentPage + 1} of {pageCount}
                            </span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => setRecentInvoicePage(prev => Math.max(0, prev - 1))}
                                disabled={currentPage === 0}
                                className="p-1.5 rounded-md hover:bg-secondary text-foreground disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setRecentInvoicePage(prev => Math.min(pageCount - 1, prev + 1))}
                                disabled={currentPage === pageCount - 1}
                                className="p-1.5 rounded-md hover:bg-secondary text-foreground disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
                <button 
                  onClick={onViewAllInvoices}
                  className="w-full mt-6 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-sm font-medium transition-colors border border-border cursor-pointer"
                >
                  View All Financial Documents
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <InvoiceDetailModal 
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  )
}
