import { useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  type SortingState,
  getPaginationRowModel,
} from '@tanstack/react-table'
import { ArrowUpDown, ChevronLeft, ChevronRight, Search, Download, FileText, X, RefreshCw } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchInvoices, triggerSync } from '@/api/invoices'
import { InvoiceDetailModal, type Invoice, formatDateOnly } from '@/components/InvoiceDetailModal'

const columnHelper = createColumnHelper<Invoice>()

const columns = [
  columnHelper.accessor('invoice_number', {
    header: 'Invoice',
    cell: info => {
      const invoiceNumber = info.getValue()
      const row = info.row.original
      const invDate = formatDateOnly(row.invoice_date)
      const dueDate = formatDateOnly(row.due_date)
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground text-sm">{invoiceNumber || 'No Number'}</span>
            {row.is_duplicate && (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400">
                Duplicate
              </span>
            )}
          </div>
          {(invDate || dueDate) && (
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {invDate && <span>Date: {invDate}</span>}
              {invDate && dueDate && <span className="mx-1.5">•</span>}
              {dueDate && <span>Due: {dueDate}</span>}
            </span>
          )}
        </div>
      )
    },
  }),
  columnHelper.accessor('vendor_name', {
    header: 'Vendor',
    cell: info => {
      const vendorName = info.getValue()
      const row = info.row.original
      // Format sender to show human-readable name, e.g. "Naruto Uzumaki" instead of full email info
      const displayName = row.sender 
        ? row.sender.split('<')[0].replace(/"/g, '').trim() 
        : null
      
      return (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground text-sm">{vendorName || 'Unknown Vendor'}</span>
          {(displayName || row.notes) && (
            <span className="text-[11px] text-muted-foreground truncate max-w-[280px]">
              {displayName && <span>From: {displayName}</span>}
              {displayName && row.notes && <span className="mx-1">•</span>}
              {row.notes && <span className="italic">{row.notes}</span>}
            </span>
          )}
        </div>
      )
    },
  }),
  columnHelper.accessor('received_at', {
    header: 'Received Date',
    cell: info => {
      const val = info.getValue()
      if (!val) return <span className="text-muted-foreground">—</span>
      try {
        return (
          <span className="text-foreground text-xs font-medium">
            {new Date(val).toLocaleString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )
      } catch (e) {
        return <span className="text-muted-foreground">—</span>
      }
    },
  }),
  columnHelper.accessor('total_amount', {
    header: 'Amount',
    cell: info => (
      <span className="font-medium">${(info.getValue() || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
    ),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: info => {
      const status = info.getValue() || 'pending'
      const isPaid = status.toLowerCase() === 'paid'
      const isPending = status.toLowerCase() === 'pending'
      
      const colors = isPaid ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
        : isPending ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      
      return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colors}`}>
          {status}
        </span>
      )
    },
  }),
  columnHelper.accessor('confidence_score', {
    header: 'AI Confidence',
    cell: info => (
      <div className="flex items-center gap-2">
        <div className="w-full bg-secondary rounded-full h-2 max-w-[60px]">
          <div
            className="bg-primary h-2 rounded-full"
            style={{ width: `${info.getValue() || 0}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground">{info.getValue() || 0}%</span>
      </div>
    ),
  }),
]

export const Invoices = () => {
  const [sorting, setSorting] = useState<SortingState>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showOnlyOriginal, setShowOnlyOriginal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [datePreset, setDatePreset] = useState('all')

  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset)
    const today = new Date()
    const formatDate = (date: Date) => {
      const yyyy = date.getFullYear()
      const mm = String(date.getMonth() + 1).padStart(2, '0')
      const dd = String(date.getDate()).padStart(2, '0')
      return `${yyyy}-${mm}-${dd}`
    }

    if (preset === 'all') {
      setStartDate('')
      setEndDate('')
    } else if (preset === 'this-month') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      setStartDate(formatDate(startOfMonth))
      setEndDate(formatDate(endOfMonth))
    } else if (preset === 'last-30-days') {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(today.getDate() - 30)
      setStartDate(formatDate(thirtyDaysAgo))
      setEndDate(formatDate(today))
    } else if (preset === 'before-a-month') {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(today.getDate() - 30)
      setStartDate('')
      setEndDate(formatDate(thirtyDaysAgo))
    } else if (preset === 'last-month') {
      const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0)
      setStartDate(formatDate(startOfLastMonth))
      setEndDate(formatDate(endOfLastMonth))
    }
  }

  const queryClient = useQueryClient()
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null)

  const syncMutation = useMutation({
    mutationFn: triggerSync,
    onSuccess: (data) => {
      setSyncStatusMsg(data.message || 'Sync successfully triggered in the background!')
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] })
      setTimeout(() => setSyncStatusMsg(null), 5000)
    },
    onError: (err: any) => {
      setSyncStatusMsg(err.response?.data?.detail || 'Sync failed to trigger. Is Gmail connected?')
      setTimeout(() => setSyncStatusMsg(null), 5000)
    }
  })

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: fetchInvoices
  })

  // Filter out invoices based on filter selections
  const filteredInvoices = invoices.filter((inv: Invoice) => {
    // 1. Show only original
    if (showOnlyOriginal && inv.is_duplicate) {
      return false
    }

    // 2. Search query (vendor name, invoice number, sender, notes)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      const matchesNum = inv.invoice_number?.toLowerCase().includes(query)
      const matchesVendor = inv.vendor_name?.toLowerCase().includes(query)
      const matchesSender = inv.sender?.toLowerCase().includes(query)
      const matchesNotes = inv.notes?.toLowerCase().includes(query)
      if (!matchesNum && !matchesVendor && !matchesSender && !matchesNotes) {
        return false
      }
    }

    // 3. Status filter
    if (statusFilter && statusFilter !== 'all') {
      if (inv.status?.toLowerCase() !== statusFilter.toLowerCase()) {
        return false
      }
    }

    // 4. Date filtering (compares YYYY-MM-DD on invoice_date)
    if (startDate) {
      if (!inv.invoice_date || inv.invoice_date < startDate) {
        return false
      }
    }
    if (endDate) {
      if (!inv.invoice_date || inv.invoice_date > endDate) {
        return false
      }
    }

    return true
  })

  const handleExportCSV = () => {
    if (filteredInvoices.length === 0) return

    const headers = [
      'Invoice Number',
      'Vendor Name',
      'Received Date',
      'Invoice Date',
      'Due Date',
      'Total Amount',
      'Currency',
      'Status',
      'AI Confidence',
      'Received From',
      'Purpose/Notes'
    ]

    const escapeCsvValue = (val?: string | number | null) => {
      if (val === undefined || val === null) return ''
      const str = String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const rows = filteredInvoices.map((inv: Invoice) => [
      escapeCsvValue(inv.invoice_number),
      escapeCsvValue(inv.vendor_name),
      escapeCsvValue(inv.received_at ? new Date(inv.received_at).toLocaleString() : ''),
      escapeCsvValue(inv.invoice_date),
      escapeCsvValue(inv.due_date),
      inv.total_amount || 0,
      escapeCsvValue(inv.currency || 'USD'),
      escapeCsvValue(inv.status),
      inv.confidence_score || 0,
      escapeCsvValue(inv.sender),
      escapeCsvValue(inv.notes)
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((r: any) => r.join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `Finnex_Invoices_${new Date().toISOString().slice(0, 10)}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const table = useReactTable({
    data: filteredInvoices,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  })

  return (
    <div className="space-y-6">
      {syncStatusMsg && (
        <div className={`border px-4 py-3 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4 duration-300 ${syncStatusMsg.toLowerCase().includes('fail') ? 'bg-destructive/10 border-destructive/20 text-destructive' : 'bg-primary/10 border-primary/20 text-foreground'}`}>
          <div className="flex items-center gap-3">
            <RefreshCw className="h-4 w-4 text-primary animate-pulse" />
            <p className="text-sm font-medium">{syncStatusMsg}</p>
          </div>
          <button 
            onClick={() => setSyncStatusMsg(null)}
            className="text-muted-foreground hover:text-foreground hover:bg-secondary p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Invoices</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage and track all extracted invoices.</p>
        </div>
        <div className="mt-4 sm:mt-0 flex flex-wrap items-center gap-3">
          <button 
            disabled={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
            className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-55 px-4 py-2 rounded-md font-medium text-sm transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            {syncMutation.isPending ? 'Syncing...' : 'Sync Gmail'}
          </button>
          <button 
            onClick={handleExportCSV}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2 rounded-md font-medium text-sm transition-colors flex items-center gap-2 border border-border cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-5 border-b border-border space-y-4 bg-secondary/10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
            
            {/* Search Input */}
            <div className="relative col-span-1 lg:col-span-3">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="block w-full pl-9 pr-3 py-2 border border-border rounded-lg leading-5 bg-background text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground"
                placeholder="Search number, vendor..."
              />
            </div>

            {/* Status Dropdown */}
            <div className="col-span-1 lg:col-span-2">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="block w-full px-3 py-2 border border-border rounded-lg bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              >
                <option value="all">All Statuses</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="unpaid">Unpaid</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            {/* Date Preset Dropdown */}
            <div className="col-span-1 lg:col-span-2">
              <select
                value={datePreset}
                onChange={e => handleDatePresetChange(e.target.value)}
                className="block w-full px-3 py-2 border border-border rounded-lg bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              >
                <option value="all">All Time</option>
                <option value="this-month">This Month</option>
                <option value="last-month">Last Month</option>
                <option value="last-30-days">Last 30 Days</option>
                <option value="before-a-month">Older than 30 Days</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {/* Date Range Start */}
            <div className="col-span-1 lg:col-span-2 flex items-center gap-1">
              <span className="text-xs text-muted-foreground whitespace-nowrap">From</span>
              <input
                type="date"
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value)
                  setDatePreset('custom')
                }}
                className="block w-full px-2 py-1.5 border border-border rounded-lg bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>

            {/* Date Range End */}
            <div className="col-span-1 lg:col-span-2 flex items-center gap-1">
              <span className="text-xs text-muted-foreground whitespace-nowrap">To</span>
              <input
                type="date"
                value={endDate}
                onChange={e => {
                  setEndDate(e.target.value)
                  setDatePreset('custom')
                }}
                className="block w-full px-2 py-1.5 border border-border rounded-lg bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>

            {/* Clear Filters Button */}
            <div className="col-span-1 lg:col-span-1 flex items-center justify-end">
              {(searchQuery || startDate || endDate || statusFilter !== 'all' || showOnlyOriginal || datePreset !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setStartDate('')
                    setEndDate('')
                    setStatusFilter('all')
                    setShowOnlyOriginal(false)
                    setDatePreset('all')
                  }}
                  className="flex items-center gap-1 px-2 py-2 w-full justify-center lg:w-auto text-xs font-semibold text-destructive hover:bg-destructive/10 hover:border-destructive/30 rounded-lg transition-colors border border-destructive/20 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>

          </div>

          {/* Toggle / Extra Info */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pt-2 border-t border-border/50 gap-2">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none font-medium hover:text-foreground transition-colors">
                <input
                  type="checkbox"
                  checked={showOnlyOriginal}
                  onChange={e => setShowOnlyOriginal(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4 bg-background transition-all"
                />
                Show only original invoices
              </label>
            </div>
            
            <div className="text-xs text-muted-foreground font-medium">
              Found {filteredInvoices.length} invoices
              {showOnlyOriginal && " (excluding duplicates)"}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground font-medium border-b border-border">
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th key={header.id} className="px-6 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={header.column.getToggleSortingHandler()}>
                      <div className="flex items-center gap-2">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <ArrowUpDown className="w-3 h-3 opacity-50" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                // Skeleton Loading State
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="animate-pulse">
                    {columns.map((_, colIndex) => (
                      <td key={colIndex} className="px-6 py-4 whitespace-nowrap">
                        <div className="h-4 bg-muted rounded w-3/4"></div>
                      </td>
                    ))}
                  </tr>
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                // Empty State
                <tr>
                  <td colSpan={columns.length} className="px-6 py-12 text-center text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="text-lg font-medium">No invoices found</p>
                    <p className="text-sm">
                      {(searchQuery || startDate || endDate || statusFilter !== 'all' || showOnlyOriginal)
                        ? "Try adjusting or clearing your filters."
                        : "Sync your Gmail to get started."}
                    </p>
                  </td>
                </tr>
              ) : (
                // Data Rows
                table.getRowModel().rows.map(row => (
                  <tr 
                    key={row.id} 
                    onClick={() => setSelectedInvoice(row.original)}
                    className="hover:bg-secondary/20 transition-colors cursor-pointer"
                  >
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-6 py-4 whitespace-nowrap text-foreground">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
          <div>
            Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
            {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, table.getFilteredRowModel().rows.length)} of{' '}
            {table.getFilteredRowModel().rows.length} results
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="p-1 rounded-md hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-border"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="p-1 rounded-md hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-border"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
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
