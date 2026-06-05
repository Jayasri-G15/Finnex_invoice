import { useState } from 'react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Dashboard } from '@/pages/Dashboard'
import { Invoices } from '@/pages/Invoices'

function App() {
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'invoices'>('dashboard')

  return (
    <DashboardLayout currentPage={currentPage} setCurrentPage={setCurrentPage}>
      {currentPage === 'dashboard' ? (
        <Dashboard onViewAllInvoices={() => setCurrentPage('invoices')} />
      ) : (
        <Invoices />
      )}
    </DashboardLayout>
  )
}

export default App
