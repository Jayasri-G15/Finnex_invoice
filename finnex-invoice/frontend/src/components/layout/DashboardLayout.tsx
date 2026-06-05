import { LayoutDashboard, FileText, Settings, LogOut, Bell, Search, Menu } from 'lucide-react'

export const DashboardLayout = ({ 
  children, 
  currentPage, 
  setCurrentPage 
}: { 
  children: React.ReactNode,
  currentPage: 'dashboard' | 'invoices',
  setCurrentPage: (page: 'dashboard' | 'invoices') => void
}) => {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card hidden md:flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mr-3">
            <span className="text-primary-foreground font-bold text-lg">F</span>
          </div>
          <h1 className="font-semibold text-lg tracking-tight">Finnex</h1>
        </div>
        
        <nav className="flex-1 py-6 px-4 space-y-1">
          <button 
            onClick={() => setCurrentPage('dashboard')}
            className={`flex w-full items-center px-3 py-2.5 rounded-md group font-medium text-sm transition-colors ${currentPage === 'dashboard' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
          >
            <LayoutDashboard className="w-5 h-5 mr-3" />
            Dashboard
          </button>
          <button 
            onClick={() => setCurrentPage('invoices')}
            className={`flex w-full items-center px-3 py-2.5 rounded-md group font-medium text-sm transition-colors ${currentPage === 'invoices' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
          >
            <FileText className="w-5 h-5 mr-3" />
            Invoices
          </button>
          <a href="#" className="flex items-center px-3 py-2.5 text-muted-foreground hover:bg-secondary hover:text-foreground rounded-md group font-medium text-sm transition-colors">
            <Settings className="w-5 h-5 mr-3" />
            Settings
          </a>
        </nav>
        
        <div className="p-4 border-t border-border">
          <button className="flex items-center w-full px-3 py-2.5 text-muted-foreground hover:bg-secondary hover:text-foreground rounded-md group font-medium text-sm transition-colors">
            <LogOut className="w-5 h-5 mr-3" />
            Log out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex items-center flex-1">
            <button className="md:hidden p-2 -ml-2 mr-2 text-muted-foreground hover:text-foreground">
              <Menu className="w-5 h-5" />
            </button>
            <div className="max-w-md w-full relative hidden sm:block">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-border rounded-md leading-5 bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm transition-all"
                placeholder="Search invoices, vendors..."
              />
            </div>
          </div>
          
          <div className="ml-4 flex items-center md:ml-6 gap-4">
            <button className="p-2 text-muted-foreground hover:text-foreground relative transition-colors rounded-full hover:bg-secondary">
              <span className="absolute top-2 right-2 block h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
              <Bell className="h-5 w-5" />
            </button>
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-accent border border-border shadow-sm flex items-center justify-center text-primary-foreground font-medium text-sm">
              JD
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-background">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
