import { useState } from 'react'
import { DollarSign, Users, FileText, CheckCircle2, RefreshCw, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { fetchDashboardSummary } from '@/api/invoices'
import { InvoiceDetailModal, type Invoice } from '@/components/InvoiceDetailModal'

export const Dashboard = ({ onViewAllInvoices }: { onViewAllInvoices?: () => void }) => {
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [showSyncNotice, setShowSyncNotice] = useState(
    new URLSearchParams(window.location.search).get('sync') === 'started'
  )
  const [recentInvoicePage, setRecentInvoicePage] = useState(0)
  const invoicesPerPage = 5

  const { data: summary, isLoading } = useQuery({
    queryKey: ['dashboardSummary'],
    queryFn: fetchDashboardSummary,
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
    return `$${value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  return (
    <div className="space-y-6">
      {showSyncNotice && (
        <div className="bg-primary/10 border border-primary/20 text-foreground px-4 py-3 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3">
            <RefreshCw className="h-4 w-4 text-primary animate-spin" />
            <p className="text-sm font-medium">Google is syncing your invoices in the background. Please wait...</p>
          </div>
          <button 
            onClick={closeSyncNotice}
            className="text-muted-foreground hover:text-foreground hover:bg-secondary p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h2>
          <p className="text-muted-foreground text-sm mt-1">Overview of your invoice processing and financial metrics.</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <button 
            onClick={handleSyncGmail}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium text-sm shadow-sm transition-colors flex items-center gap-2"
          >
            Sync Gmail Now
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-6 shadow-sm animate-pulse">
              <div className="flex items-center justify-between">
                <div className="h-4 bg-muted rounded w-24"></div>
                <div className="w-8 h-8 bg-muted rounded-lg"></div>
              </div>
              <div className="mt-4">
                <div className="h-8 bg-muted rounded w-28"></div>
              </div>
            </div>
          ))
        ) : (
          [
            { name: 'Total Spend', value: formatCurrency(summary?.total_spend ?? 0), icon: DollarSign },
            { name: 'Processed Invoices', value: (summary?.processed_invoices ?? 0).toLocaleString(), icon: FileText },
            { name: 'Active Vendors', value: (summary?.active_vendors ?? 0).toLocaleString(), icon: Users },
            { name: 'Avg. Confidence Score', value: `${summary?.avg_confidence ?? 0}%`, icon: CheckCircle2 },
          ].map((item) => (
            <div key={item.name} className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground truncate">{item.name}</p>
                <div className="p-2 bg-secondary rounded-lg">
                  <item.icon className="h-4 w-4 text-primary" />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-2xl font-semibold text-foreground">{item.value}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm lg:col-span-2">
          <h3 className="text-base font-semibold leading-6 text-foreground mb-4">Spend Overview</h3>
          {isLoading ? (
            <div className="h-72 w-full bg-secondary/10 animate-pulse rounded-lg flex items-center justify-center">
              <span className="text-sm text-muted-foreground">Loading chart...</span>
            </div>
          ) : !summary || summary.processed_invoices === 0 ? (
            <div className="h-72 w-full border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-center p-6 bg-secondary/5">
              <FileText className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground">No financial data to display</p>
              <p className="text-xs text-muted-foreground mt-1">Once invoices are processed, your spend trends will appear here.</p>
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
                    tickFormatter={(value) => value >= 1000 ? `$${(value/1000).toFixed(0)}k` : `$${value}`} 
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

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h3 className="text-base font-semibold leading-6 text-foreground mb-4">Recent Invoices</h3>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-2 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted"></div>
                    <div className="space-y-2">
                      <div className="h-4 bg-muted rounded w-24"></div>
                      <div className="h-3 bg-muted rounded w-16"></div>
                    </div>
                  </div>
                  <div className="space-y-2 text-right">
                    <div className="h-4 bg-muted rounded w-16 ml-auto"></div>
                    <div className="h-3 bg-muted rounded w-12 ml-auto"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : !summary || summary.recent_invoices.length === 0 ? (
            <div className="h-72 border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-center p-6 bg-secondary/5">
              <FileText className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground">No recent invoices</p>
              <p className="text-xs text-muted-foreground mt-1">Your extracted invoices will be listed here.</p>
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
                        
                        const isPaid = inv.status?.toLowerCase() === 'paid'
                        const isPending = inv.status?.toLowerCase() === 'pending'
                        const statusColor = isPaid ? 'text-green-500' : isPending ? 'text-yellow-500' : 'text-red-500'

                        return (
                          <div 
                            key={inv.id} 
                            onClick={() => setSelectedInvoice(inv)}
                            className="flex items-center justify-between py-2 hover:bg-secondary/20 rounded-lg px-2 -mx-2 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-medium text-sm">
                                {vendorAbbr}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground max-w-[120px] sm:max-w-[160px] truncate">
                                  {inv.vendor_name || 'Unknown Vendor'}
                                </p>
                                <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5 mt-0.5">
                                  <span>{inv.invoice_number || 'No Number'}</span>
                                  {inv.invoice_type && (
                                    <span className="px-1.5 py-0.2 text-[9px] font-semibold bg-primary/10 text-primary rounded">
                                      {inv.invoice_type}
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
                              <p className="text-sm font-medium text-foreground">
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
                          <span className="text-xs text-muted-foreground">
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
                className="w-full mt-6 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-sm font-medium transition-colors"
              >
                View All Invoices
              </button>
            </>
          )}
        </div>
      </div>

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
