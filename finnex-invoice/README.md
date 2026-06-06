# Finnex - Financial Communication & Ledger Intelligence System

Finnex is an intelligent financial communication platform that parses financial email notifications and attachments using Gemini 2.5 Flash, extracts financial metrics, classifies them into transactional events, and automatically maps them to accounts in the Chart of Accounts (COA).

## Ledger Intelligence System Architecture

The workflow follows a strict, non-intrusive pipeline:
```
Email MCP Server (Gmail Fetch)
       │
       ▼
Supabase PostgreSQL (Stores attachments & raw records)
       │
       ▼
Gemini 2.5 Flash / OpenAI fallback (Data extraction & ledger mapping)
       │
       ▼
Supabase Database (Stores mapped ledger dimensions & confidence)
       │
       ▼
Finnex Dashboard (Displays ledger intelligence, trends, & manual overrides)
```

### Chart of Accounts (COA) Mappings
Every transaction is classified under either:
* **Income Ledgers:** internship income, management consulting services (`ARC-02`, `ARC-03`, `ASP-02`, `ASP-03`, `ASP-04`, `DOL-02`, `DOL-03`, `EDG-02`, `EXT-01`, `GSD-02`, `SISU-01`), and subscription revenue (`SUBSCRIPTION`).
* **Expense Ledgers:** team lunches (`ARC-23`/`ASP-23`), rent (`ASP-24`/`SISU-61`), softwares/SaaS (`ASP-28`/`EXT-28`/`SISU-28`), vendors & contractors (`ARC-26`/`ASP-26`/`EXT-26`/`SISU-26`), travelling (`ARC-59`/`ASP-59`/`COM-COR-59`/`EXT-59`/`SISU-59`), professional consultancy, printing supplies, events, mobile bills, books/magazines, IT/hardware rental, and client food meetings.

### Mappings confidence Rules
* Mappings with a confidence score **>= 80%** are automatically categorized.
* Mappings with a confidence score **< 80%** are marked as `UNCATEGORIZED` and flagged on the dashboard for manual override categorization by the user.

---

## Getting Started

### 1. Database Migrations
Database columns and seed Chart of Accounts data are created by running:
```bash
cd backend
python migrate_v4.py
```

### 2. Backend API Server
Ensure environment variables in `backend/app/.env` (or workspace `.env`) are configured (e.g. `DATABASE_URL`, `GEMINI_API_KEY`, etc.), then run:
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
API endpoints:
* **GET `/api/v1/invoices/`:** Lists invoices containing updated ledger classification columns.
* **GET `/api/v1/invoices/summary`:** Computes ledger aggregations, trends, and fetches uncategorized records.
* **GET `/api/v1/invoices/ledgers`:** Retrieves active Chart of Accounts ledgers.
* **PUT `/api/v1/invoices/{invoice_id}`:** Categorizes an invoice manually.

### 3. Frontend Dashboard UI
Run the Vite development server:
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser. Navigating to the **Ledger Intelligence** tab will showcase charts representing Expense by Ledger, Income by Ledger, Monthly Trends, and the manual categorization workflow.
