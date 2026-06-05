import { Download, X, Edit2, Check, XCircle, RefreshCw, FileText } from 'lucide-react'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateInvoice } from '@/api/invoices'

export type LineItem = {
  description: string
  quantity?: number | null
  unit_price?: number | null
  amount?: number | null
}

export type Invoice = {
  id: number | string
  invoice_number: string
  vendor_name: string
  total_amount: number
  status: string
  confidence_score: number
  is_duplicate?: boolean
  original_id?: number | string | null
  received_at?: string
  invoice_date?: string
  due_date?: string
  sender?: string | null
  notes?: string | null
  currency?: string | null
  invoice_type?: string | null
  approval_status?: string | null
  line_items?: LineItem[] | null
  payment_terms?: string | null
  pdf_url?: string | null
}

interface InvoiceDetailModalProps {
  invoice: Invoice
  onClose: () => void
}

export const formatDateOnly = (dateStr?: string) => {
  if (!dateStr) return null
  try {
    // Parse directly as UTC to prevent timezone shift on date-only strings
    const date = new Date(dateStr + 'T00:00:00Z')
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })
  } catch (e) {
    return dateStr
  }
}

export const handleExportSingleCSV = (inv: Invoice) => {
  const fields = [
    ['Field', 'Value'],
    ['Invoice Number', inv.invoice_number || 'No Number'],
    ['Vendor Name', inv.vendor_name || 'Unknown Vendor'],
    ['Total Amount', (inv.total_amount || 0).toString()],
    ['Currency', inv.currency || 'USD'],
    ['Status', inv.status || 'pending'],
    ['Category', inv.invoice_type || '—'],
    ['AI Confidence', `${inv.confidence_score || 0}%`],
    ['Invoice Date', inv.invoice_date || '—'],
    ['Due Date', inv.due_date || '—'],
    ['Received Date', inv.received_at ? new Date(inv.received_at).toLocaleString() : '—'],
    ['Received From', inv.sender || '—'],
    ['Payment Terms', inv.payment_terms || '—'],
    ['Notes / Purpose', inv.notes || '—']
  ]

  const csvContent = fields.map(row => 
    row.map(val => {
      const str = String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }).join(',')
  ).join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `Invoice_${inv.invoice_number || 'Details'}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const LEDGER_CATEGORIES = [
  { code: 'ASP-04', label: 'Others (Miscellaneous)' },
  { code: 'ASP-23', label: 'Team Outings/Events (ASP)' },
  { code: 'ARC-23', label: 'Team Outings/Events (ARC)' },
  { code: 'ASP-24', label: 'Workspace Rent (ASP)' },
  { code: 'ASP-26', label: 'Vendors/Partners/Gig (ASP)' },
  { code: 'ARC-26', label: 'Vendors/Partners/Gig (ARC)' },
  { code: 'ASP-28', label: 'Softwares/SaaS/IT Rental (ASP)' },
  { code: 'ASP-29', label: 'Learning & Development (ASP)' },
  { code: 'ARC-29', label: 'Learning & Development (ARC)' },
  { code: 'ASP-30', label: 'Marketing/Branding (ASP)' },
  { code: 'ARC-30', label: 'Marketing/Branding (ARC)' },
  { code: 'ASP-31', label: 'Staff Welfare (ASP)' },
  { code: 'ARC-31', label: 'Staff Welfare (ARC)' },
  { code: 'ASP-32', label: 'Office Supplies (ASP)' },
  { code: 'ARC-32', label: 'Office Supplies (ARC)' },
  { code: 'ASP-33', label: 'Professional/Legal Expense (ASP)' },
  { code: 'ASP-34', label: 'Telephone/Internet/Mobile (ASP)' },
  { code: 'ASP-35', label: 'Food & Catering (ASP)' },
  { code: 'ARC-35', label: 'Food & Catering (ARC)' },
  { code: 'ASP-36', label: 'Gifts & Goodies (ASP)' },
  { code: 'ARC-36', label: 'Gifts & Goodies (ARC)' },
  { code: 'ASP-40', label: 'Client Meeting/Entertainment (ASP)' },
  { code: 'ASP-59', label: 'Travel & Conveyance (ASP)' },
  { code: 'ARC-59', label: 'Travel & Conveyance (ARC)' },
  { code: 'ASP-02', label: 'Management Consulting (ASP-02)' },
  { code: 'ASP-03', label: 'Management Consulting (ASP-03)' },
  { code: 'ARC-02', label: 'Management Consulting (ARC-02)' },
  { code: 'ARC-03', label: 'Management Consulting (ARC-03)' },
]

export const InvoiceDetailModal = ({ invoice, onClose }: InvoiceDetailModalProps) => {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [status, setStatus] = useState(invoice.status || 'pending')
  const [approvalStatus, setApprovalStatus] = useState(invoice.approval_status || 'pending')
  const [category, setCategory] = useState(invoice.invoice_type || '')
  const [notes, setNotes] = useState(invoice.notes || '')

  const getPdfFullUrl = (pdfUrl: string) => {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
    if (pdfUrl.startsWith('/api/v1') && baseUrl.endsWith('/api/v1')) {
      return `${baseUrl.substring(0, baseUrl.length - 7)}${pdfUrl}`
    }
    return `${baseUrl}${pdfUrl}`
  }

  const mutation = useMutation({
    mutationFn: async (payload: {
      status?: string
      approval_status?: string
      invoice_type?: string | null
      notes?: string | null
    }) => {
      return updateInvoice(invoice.id, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] })
      setIsEditing(false)
    }
  })

  const handleSave = () => {
    mutation.mutate({
      status,
      approval_status: approvalStatus,
      invoice_type: category || null,
      notes: notes || null
    })
  }

  const handleQuickApproval = (newApproval: string) => {
    setApprovalStatus(newApproval)
    mutation.mutate({
      approval_status: newApproval
    })
  }

  const handleCancel = () => {
    setStatus(invoice.status || 'pending')
    setApprovalStatus(invoice.approval_status || 'pending')
    setCategory(invoice.invoice_type || '')
    setNotes(invoice.notes || '')
    setIsEditing(false)
  }

  const isSaving = mutation.isPending

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all scale-100 animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-secondary/20">
          <div>
            <h3 className="text-lg font-bold text-foreground">
              {invoice.vendor_name || 'Unknown Vendor'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Invoice Details • {invoice.invoice_number || 'No Number'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground hover:bg-secondary p-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Status / Alerts */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-secondary/10 p-4 rounded-xl border border-border/50">
            <div className="flex flex-wrap gap-2">
              {/* Payment Status Badge */}
              {(() => {
                const colors = status.toLowerCase() === 'paid' 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                  : status.toLowerCase() === 'pending' 
                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                return (
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${colors}`}>
                    Payment: {status}
                  </span>
                )
              })()}

              {/* Approval Status Badge */}
              {(() => {
                const colors = approvalStatus.toLowerCase() === 'approved' 
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' 
                  : approvalStatus.toLowerCase() === 'rejected' 
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                return (
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${colors}`}>
                    Approval: {approvalStatus}
                  </span>
                )
              })()}

              {/* Duplicate warning */}
              {invoice.is_duplicate && (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400 animate-pulse">
                  Duplicate Invoice
                </span>
              )}
            </div>

            {/* Quick Approval / Rejection Controls */}
            {!isEditing && (
              <div className="flex items-center gap-2">
                <button
                  disabled={approvalStatus === 'approved' || isSaving}
                  onClick={() => handleQuickApproval('approved')}
                  className="px-3 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  Approve
                </button>
                <button
                  disabled={approvalStatus === 'rejected' || isSaving}
                  onClick={() => handleQuickApproval('rejected')}
                  className="px-3 py-1.5 bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Reject
                </button>
              </div>
            )}
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Financial details */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Financial Overview</h4>
              <div className="bg-secondary/10 rounded-lg p-4 space-y-3 border border-border/50">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Total Amount</span>
                  <span className="font-semibold text-base text-foreground">
                    ${(invoice.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Currency</span>
                  <span className="font-medium text-foreground uppercase">{invoice.currency || 'USD'}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Confidence Score</span>
                  <span className="font-medium text-foreground">{invoice.confidence_score || 0}%</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Payment Terms</span>
                  <span className="font-medium text-foreground">{invoice.payment_terms || '—'}</span>
                </div>
                
                {/* Category Selection */}
                <div className="flex flex-col gap-1.5 pt-1.5 border-t border-border/40">
                  <span className="text-muted-foreground text-sm">Ledger Category</span>
                  {isEditing ? (
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                      className="block w-full px-2.5 py-1.5 border border-border rounded-lg bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    >
                      <option value="">Select Category...</option>
                      {LEDGER_CATEGORIES.map(cat => (
                        <option key={cat.code} value={cat.code}>
                          {cat.code} - {cat.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-semibold text-foreground bg-primary/10 text-primary px-2 py-0.5 rounded text-xs w-fit">
                      {category ? `${category} - ${LEDGER_CATEGORIES.find(c => c.code === category)?.label || 'Unknown'}` : 'Not Categorized'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Invoice timeline / Edit Status */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Timeline & Status</h4>
              <div className="bg-secondary/10 rounded-lg p-4 space-y-3 border border-border/50">
                {isEditing ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-sm">Payment Status</span>
                      <select
                        value={status}
                        onChange={e => setStatus(e.target.value)}
                        className="block w-full px-2.5 py-1.5 border border-border rounded-lg bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      >
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="unpaid">Unpaid</option>
                        <option value="failed">Failed</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-sm">Approval Status</span>
                      <select
                        value={approvalStatus}
                        onChange={e => setApprovalStatus(e.target.value)}
                        className="block w-full px-2.5 py-1.5 border border-border rounded-lg bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Invoice Date</span>
                      <span className="font-medium text-foreground">{formatDateOnly(invoice.invoice_date) || '—'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Due Date</span>
                      <span className="font-medium text-foreground">{formatDateOnly(invoice.due_date) || '—'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Received Date</span>
                      <span className="font-medium text-foreground">
                        {invoice.received_at ? new Date(invoice.received_at).toLocaleDateString('en-US', {
                          year: 'numeric', month: 'short', day: 'numeric'
                        }) : '—'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Source metadata & Notes */}
          <div className="space-y-4 pt-2">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Email Source & Purpose</h4>
            <div className="bg-secondary/10 rounded-lg p-4 space-y-3 border border-border/50">
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Received From</span>
                <span className="font-medium text-foreground break-all">{invoice.sender || '—'}</span>
              </div>
              
              <div className="flex flex-col gap-1 text-sm pt-2 border-t border-border/40">
                <span className="text-muted-foreground">Notes / Purpose</span>
                {isEditing ? (
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={2}
                    className="block w-full px-2.5 py-1.5 border border-border rounded-lg bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                    placeholder="Enter purpose or notes..."
                  />
                ) : (
                  <span className="font-medium text-foreground italic">
                    {notes ? `"${notes}"` : 'No notes entered.'}
                  </span>
                )}
              </div>

              {invoice.is_duplicate && invoice.original_id && (
                <div className="flex flex-col gap-1 text-sm pt-2 border-t border-border/40 text-red-500">
                  <span className="text-red-500 font-bold">Duplicate Alert</span>
                  <span>This invoice is a duplicate. The original invoice ID is: {invoice.original_id}</span>
                </div>
              )}
            </div>
          </div>

          {/* Line Items */}
          {invoice.line_items && invoice.line_items.length > 0 && (
            <div className="space-y-4 pt-2">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Line Items</h4>
              <div className="bg-secondary/10 rounded-lg overflow-hidden border border-border/50">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-secondary/30 text-muted-foreground font-semibold border-b border-border/40">
                    <tr>
                      <th className="px-4 py-2">Description</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-right">Unit Price</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30 text-foreground">
                    {invoice.line_items.map((item, index) => (
                      <tr key={index} className="hover:bg-secondary/10">
                        <td className="px-4 py-2 font-medium">{item.description}</td>
                        <td className="px-4 py-2 text-right">{item.quantity ?? '—'}</td>
                        <td className="px-4 py-2 text-right">
                          {item.unit_price !== undefined && item.unit_price !== null ? `$${Number(item.unit_price).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-2 text-right font-medium">
                          {item.amount !== undefined && item.amount !== null ? `$${Number(item.amount).toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PDF Preview */}
          {invoice.pdf_url && (
            <div className="space-y-4 pt-2">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Original PDF Attachment</h4>
              <div className="bg-secondary/10 rounded-lg p-4 border border-border/50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <FileText className="w-8 h-8 text-primary" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Invoice PDF Document</p>
                      <p className="text-xs text-muted-foreground">Original invoice attached to the email</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a 
                      href={getPdfFullUrl(invoice.pdf_url)}
                      target="_blank" 
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      Open PDF in New Tab
                    </a>
                  </div>
                </div>
                <div className="mt-4 border border-border rounded-lg overflow-hidden h-96 bg-background">
                  <iframe 
                    src={getPdfFullUrl(invoice.pdf_url)}
                    className="w-full h-full border-none"
                    title="Invoice PDF Viewer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-between items-center bg-secondary/10">
          <div>
            {!isEditing && (
              <button 
                onClick={() => handleExportSingleCSV(invoice)}
                className="px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md font-medium text-sm transition-colors border border-border shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Download CSV (Excel)
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <button 
                  disabled={isSaving}
                  onClick={handleSave}
                  className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 rounded-md font-medium text-sm transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
                <button 
                  disabled={isSaving}
                  onClick={handleCancel}
                  className="px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 rounded-md font-medium text-sm transition-colors border border-border cursor-pointer"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md font-medium text-sm transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit Invoice
                </button>
                <button 
                  onClick={onClose}
                  className="px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md font-medium text-sm transition-colors border border-border cursor-pointer"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
