from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional
from datetime import date
import calendar
import uuid
from pydantic import BaseModel

from app.database import get_db
from app.models import Invoice, Attachment

router = APIRouter()

def get_duplicates_map(invoices: List[Invoice]):
    """
    Returns a dict mapping invoice ID to a dict:
    {
        "is_duplicate": bool,
        "original_id": str or None
    }
    Identifies duplicates by processing invoices from oldest to newest.
    """
    import datetime

    def to_date(val):
        if val is None:
            return None
        if isinstance(val, datetime.datetime):
            return val.date()
        if isinstance(val, datetime.date):
            return val
        return None

    def sort_key(inv):
        dt = inv.created_at or inv.invoice_date
        if dt is None:
            ts = 0.0
        elif isinstance(dt, datetime.datetime):
            ts = dt.timestamp()
        elif isinstance(dt, datetime.date):
            ts = datetime.datetime.combine(dt, datetime.time.min).timestamp()
        else:
            ts = 0.0
        return (ts, str(inv.id))

    # Sort by created_at ascending to treat the oldest as the original
    sorted_invoices = sorted(
        invoices, 
        key=sort_key
    )
    
    dup_map = {}
    seen_invoice_nums = {} # (vendor_name_lower, invoice_number_lower) -> first_id
    seen_invoice_details = {} # (vendor_name_lower, total_amount, invoice_date) -> first_id
    
    for inv in sorted_invoices:
        inv_id_str = str(inv.id)
        is_duplicate = False
        original_id = None
        
        vendor_name_lower = (inv.vendor_name or "").strip().lower()
        invoice_num_lower = (inv.invoice_number or "").strip().lower()
        total_amount = inv.total_amount
        invoice_date = to_date(inv.invoice_date)
        
        # Check criteria 1: Same invoice number and vendor name
        if vendor_name_lower and invoice_num_lower:
            key1 = (vendor_name_lower, invoice_num_lower)
            if key1 in seen_invoice_nums:
                is_duplicate = True
                original_id = seen_invoice_nums[key1]
            else:
                seen_invoice_nums[key1] = inv_id_str
                
        # Check criteria 2: Same vendor name, total amount, and invoice date
        if not is_duplicate and vendor_name_lower and total_amount is not None and invoice_date:
            key2 = (vendor_name_lower, total_amount, invoice_date)
            if key2 in seen_invoice_details:
                is_duplicate = True
                original_id = seen_invoice_details[key2]
            else:
                seen_invoice_details[key2] = inv_id_str
                
        dup_map[inv_id_str] = {
            "is_duplicate": is_duplicate,
            "original_id": original_id
        }
        
    return dup_map

@router.get("/", response_model=List[dict])
async def get_invoices(db: AsyncSession = Depends(get_db)):
    from app.models import EmailRecord
    from sqlalchemy.sql import func
    result = await db.execute(
        select(Invoice, EmailRecord.received_at, EmailRecord.sender)
        .outerjoin(EmailRecord, Invoice.email_record_id == EmailRecord.id)
        .order_by(func.coalesce(EmailRecord.received_at, Invoice.created_at).desc())
    )
    rows = result.all()
    invoices = [row[0] for row in rows]
    
    # Calculate duplicates
    dup_map = get_duplicates_map(invoices)
    
    def to_iso_date(val):
        if val is None:
            return None
        if isinstance(val, date):
            return val.isoformat()
        if hasattr(val, "date"):
            return val.date().isoformat()
        return None

    return [
        {
            "id": inv.id,
            "invoice_number": inv.invoice_number,
            "vendor_name": inv.vendor_name,
            "total_amount": inv.total_amount,
            "currency": inv.currency,
            "status": inv.payment_status,
            "confidence_score": inv.confidence_score,
            "is_duplicate": dup_map.get(str(inv.id), {}).get("is_duplicate", False),
            "original_id": dup_map.get(str(inv.id), {}).get("original_id"),
            "received_at": (received_at or inv.created_at).isoformat() if (received_at or inv.created_at) else None,
            "invoice_date": to_iso_date(inv.invoice_date),
            "due_date": to_iso_date(inv.due_date),
            "sender": sender,
            "notes": inv.notes,
            "invoice_type": inv.invoice_type,
            "approval_status": inv.approval_status,
            "line_items": inv.line_items,
            "payment_terms": inv.payment_terms,
            "email_direction": inv.email_direction,
            "financial_event": inv.financial_event,
            "transaction_type": inv.transaction_type,
            "financial_impact": inv.financial_impact,
            "cashflow": inv.cashflow,
            "event_status": inv.event_status,
            "event_timestamp": inv.event_timestamp.isoformat() if inv.event_timestamp else None,
            "pdf_url": f"/api/v1/invoices/{inv.id}/pdf",
            "ledger_code": inv.ledger_code,
            "ledger_name": inv.ledger_name,
            "ledger_category": inv.ledger_category,
            "ledger_group": inv.ledger_group,
            "ledger_confidence": inv.ledger_confidence,
            "document_type": inv.document_type
        }
        for inv, received_at, sender in rows
    ]

@router.get("/summary")
async def get_dashboard_summary(db: AsyncSession = Depends(get_db)):
    from app.models import EmailRecord, FinancialEvent
    from sqlalchemy.future import select
    from datetime import date
    import datetime
    
    # Fetch all invoices to compute metrics accurately
    result = await db.execute(
        select(Invoice, EmailRecord.received_at, EmailRecord.sender)
        .outerjoin(EmailRecord, Invoice.email_record_id == EmailRecord.id)
    )
    rows = result.all()
    all_invoices = [row[0] for row in rows]
    received_map = {str(inv.id): received_at for inv, received_at, sender in rows}
    sender_map = {str(inv.id): sender for inv, received_at, sender in rows}
    
    dup_map = get_duplicates_map(all_invoices)
    
    # Filter out duplicates for stats like total spend, active vendors, etc.
    original_invoices = [
        inv for inv in all_invoices 
        if not dup_map.get(str(inv.id), {}).get("is_duplicate", False)
    ]

    # Fetch all financial events
    fe_result = await db.execute(
        select(FinancialEvent, EmailRecord.subject, EmailRecord.sender, Invoice.vendor_name, Invoice.invoice_number)
        .outerjoin(EmailRecord, FinancialEvent.email_id == EmailRecord.id)
        .outerjoin(Invoice, FinancialEvent.invoice_id == Invoice.id)
        .order_by(FinancialEvent.created_at.desc())
    )
    fe_rows = fe_result.all()
    
    # Total Spend (sum of original EXPENSE invoices)
    total_spend = sum(inv.total_amount for inv in original_invoices if inv.total_amount is not None and inv.transaction_type != 'REVENUE')
    
    # Processed Invoices (all invoices processed by system)
    processed_count = len(all_invoices)
    
    # Active Vendors (number of unique vendor names among original EXPENSE invoices)
    unique_vendors = {inv.vendor_name.strip() for inv in original_invoices if inv.vendor_name and inv.transaction_type != 'REVENUE'}
    active_vendors = len(unique_vendors)
    
    # Avg. Confidence Score
    avg_confidence = 0.0
    if all_invoices:
        valid_scores = [inv.confidence_score for inv in all_invoices if inv.confidence_score is not None]
        if valid_scores:
            avg_confidence = round(sum(valid_scores) / len(valid_scores), 1)
            
    # REVENUE metrics (original/non-duplicate invoices where transaction_type == 'REVENUE')
    revenue_invoices = [inv for inv in original_invoices if inv.transaction_type == 'REVENUE']
    revenue_raised = sum(inv.total_amount for inv in revenue_invoices if inv.total_amount is not None)
    
    # Revenue received (settlement events where transaction_type == 'REVENUE')
    revenue_received = sum(
        fe.amount for fe, _, _, _, _ in fe_rows 
        if fe.transaction_type == 'REVENUE' and fe.financial_event in ['PAID', 'PAYMENT_COMPLETED', 'PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'] and fe.amount is not None
    )
    
    # Pending Revenue
    pending_revenue = sum(
        inv.total_amount for inv in revenue_invoices 
        if inv.total_amount is not None and (inv.payment_status or "").lower() not in ['paid', 'completed', 'received', 'confirmed']
    )
    
    # Overdue Revenue
    overdue_revenue = 0.0
    for inv in revenue_invoices:
        if inv.total_amount is not None and (inv.payment_status or "").lower() not in ['paid', 'completed', 'received', 'confirmed']:
            is_overdue = False
            if (inv.payment_status or "").lower() == 'overdue':
                is_overdue = True
            elif inv.due_date:
                due = inv.due_date.date() if isinstance(inv.due_date, datetime.datetime) else inv.due_date
                if due and due < date.today():
                    is_overdue = True
            if is_overdue:
                overdue_revenue += inv.total_amount
                
    customer_payments = sum(
        1 for fe, _, _, _, _ in fe_rows 
        if fe.transaction_type == 'REVENUE' and fe.financial_event in ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_COMPLETED']
    )

    # EXPENSE metrics (original/non-duplicate invoices where transaction_type == 'EXPENSE')
    expense_invoices = [inv for inv in original_invoices if inv.transaction_type == 'EXPENSE']
    expenses_raised = sum(inv.total_amount for inv in expense_invoices if inv.total_amount is not None)
    
    # Expenses Paid
    expenses_paid = sum(
        fe.amount for fe, _, _, _, _ in fe_rows 
        if fe.transaction_type == 'EXPENSE' and fe.financial_event in ['PAID', 'PAYMENT_COMPLETED', 'PAYMENT_CONFIRMED'] and fe.amount is not None
    )
    
    # Pending Expenses
    pending_expenses = sum(
        inv.total_amount for inv in expense_invoices 
        if inv.total_amount is not None and (inv.payment_status or "").lower() not in ['paid', 'completed', 'confirmed']
    )
    
    # Overdue Expenses
    overdue_expenses = 0.0
    for inv in expense_invoices:
        if inv.total_amount is not None and (inv.payment_status or "").lower() not in ['paid', 'completed', 'confirmed']:
            is_overdue = False
            if (inv.payment_status or "").lower() == 'overdue':
                is_overdue = True
            elif inv.due_date:
                due = inv.due_date.date() if isinstance(inv.due_date, datetime.datetime) else inv.due_date
                if due and due < date.today():
                    is_overdue = True
            if is_overdue:
                overdue_expenses += inv.total_amount
                
    vendor_payments = sum(
        1 for fe, _, _, _, _ in fe_rows 
        if fe.transaction_type == 'EXPENSE' and fe.financial_event in ['PAID', 'PAYMENT_COMPLETED', 'PAYMENT_CONFIRMED']
    )

    # CASHFLOW metrics
    # Cash Inflow: sum of amount for INFLOW settlement events
    cash_inflow = sum(
        fe.amount for fe, _, _, _, _ in fe_rows 
        if fe.cashflow == 'INFLOW' and fe.amount is not None
    )
    # Cash Outflow: sum of amount for OUTFLOW settlement events
    cash_outflow = sum(
        fe.amount for fe, _, _, _, _ in fe_rows 
        if fe.cashflow == 'OUTFLOW' and fe.amount is not None
    )
    net_cash_flow = cash_inflow - cash_outflow

    # Financial Events Counts
    event_counts = {
        "RAISED": 0, "REQUESTED": 0, "PENDING": 0, "REMINDER": 0, "PAID": 0,
        "PAYMENT_COMPLETED": 0, "PAYMENT_RECEIVED": 0, "PAYMENT_CONFIRMED": 0,
        "CANCELLED": 0, "RENEWAL": 0, "PAYMENT_OVERDUE": 0, "REFUND": 0,
        "PARTIAL_PAYMENT": 0, "APPROVED": 0, "REJECTED": 0
    }
    for fe, _, _, _, _ in fe_rows:
        ev = fe.financial_event
        if ev in event_counts:
            event_counts[ev] += 1
            
    # Mail Intelligence Section
    sent_emails_count = sum(1 for fe, _, _, _, _ in fe_rows if fe.email_direction == 'MAIL_SENT')
    received_emails_count = sum(1 for fe, _, _, _, _ in fe_rows if fe.email_direction == 'MAIL_RECEIVED')

    def to_iso_date(val):
        if val is None:
            return None
        if isinstance(val, date):
            return val.isoformat()
        if hasattr(val, "date"):
            return val.date().isoformat()
        return None

    recent_invoices = sorted(
        all_invoices, 
        key=lambda x: received_map.get(str(x.id)) or x.created_at, 
        reverse=True
    )[:20]

    recent = [
        {
            "id": str(inv.id),
            "invoice_number": inv.invoice_number,
            "vendor_name": inv.vendor_name,
            "total_amount": inv.total_amount,
            "currency": inv.currency,
            "status": inv.payment_status,
            "confidence_score": inv.confidence_score,
            "is_duplicate": dup_map.get(str(inv.id), {}).get("is_duplicate", False),
            "created_at": (received_map.get(str(inv.id)) or inv.created_at).isoformat() if (received_map.get(str(inv.id)) or inv.created_at) else None,
            "invoice_date": to_iso_date(inv.invoice_date),
            "due_date": to_iso_date(inv.due_date),
            "sender": sender_map.get(str(inv.id)),
            "notes": inv.notes,
            "invoice_type": inv.invoice_type,
            "approval_status": inv.approval_status,
            "line_items": inv.line_items,
            "payment_terms": inv.payment_terms,
            "email_direction": inv.email_direction,
            "financial_event": inv.financial_event,
            "transaction_type": inv.transaction_type,
            "financial_impact": inv.financial_impact,
            "cashflow": inv.cashflow,
            "event_status": inv.event_status,
            "event_timestamp": inv.event_timestamp.isoformat() if inv.event_timestamp else None,
            "pdf_url": f"/api/v1/invoices/{inv.id}/pdf",
            "document_type": inv.document_type
        }
        for inv in recent_invoices
    ]

    # Spend overview (last 6 months, using original EXPENSE invoices only)
    today = date.today()
    overview_data = []
    
    for i in range(5, -1, -1):
        m = today.month - i
        y = today.year
        if m <= 0:
            m += 12
            y -= 1
        month_name = calendar.month_abbr[m]
        
        # Calculate spend for this month/year
        spend = 0.0
        for inv in original_invoices:
            if inv.invoice_date and inv.total_amount and inv.transaction_type == 'EXPENSE':
                if inv.invoice_date.year == y and inv.invoice_date.month == m:
                    spend += inv.total_amount
                    
        overview_data.append({
            "name": month_name,
            "total": round(spend, 2)
        })

    # Prepare timeline (limit to 30 events)
    timeline = [
        {
            "id": str(fe.id),
            "invoice_id": str(fe.invoice_id) if fe.invoice_id else None,
            "email_id": str(fe.email_id) if fe.email_id else None,
            "email_direction": fe.email_direction,
            "financial_event": fe.financial_event,
            "transaction_type": fe.transaction_type,
            "financial_impact": fe.financial_impact,
            "cashflow": fe.cashflow,
            "amount": fe.amount,
            "status": fe.status,
            "created_at": fe.created_at.isoformat() if fe.created_at else None,
            "subject": subject,
            "sender": sender,
            "counterpart_name": vendor_name,
            "invoice_number": invoice_number
        }
        for fe, subject, sender, vendor_name, invoice_number in fe_rows[:30]
    ]

    # Ledger Intelligence calculations
    expense_by_ledger = {}
    for inv in original_invoices:
        if inv.transaction_type == 'EXPENSE' and inv.total_amount is not None:
            code = inv.ledger_code or 'UNCATEGORIZED'
            expense_by_ledger[code] = expense_by_ledger.get(code, 0.0) + inv.total_amount
            
    expense_by_ledger_list = [
        {
            "code": code,
            "name": next((i.ledger_name for i in original_invoices if i.ledger_code == code), "Uncategorized") or "Uncategorized",
            "value": round(val, 2)
        }
        for code, val in expense_by_ledger.items()
    ]
    expense_by_ledger_list.sort(key=lambda x: x["value"], reverse=True)
    
    income_by_ledger = {}
    for inv in original_invoices:
        if inv.transaction_type == 'REVENUE' and inv.total_amount is not None:
            code = inv.ledger_code or 'UNCATEGORIZED'
            income_by_ledger[code] = income_by_ledger.get(code, 0.0) + inv.total_amount
            
    income_by_ledger_list = [
        {
            "code": code,
            "name": next((i.ledger_name for i in original_invoices if i.ledger_code == code), "Uncategorized") or "Uncategorized",
            "value": round(val, 2)
        }
        for code, val in income_by_ledger.items()
    ]
    income_by_ledger_list.sort(key=lambda x: x["value"], reverse=True)

    top_expense_ledgers = expense_by_ledger_list[:5]
    top_revenue_ledgers = income_by_ledger_list[:5]

    valid_confidences = [inv.ledger_confidence for inv in original_invoices if inv.ledger_confidence is not None]
    avg_ledger_confidence = round(sum(valid_confidences) / len(valid_confidences), 1) if valid_confidences else 0.0
    
    total_ledger_tx = len(original_invoices)
    uncategorized_count = sum(1 for inv in original_invoices if (inv.ledger_code or 'UNCATEGORIZED') == 'UNCATEGORIZED')
    categorized_count = total_ledger_tx - uncategorized_count
    
    confidence_stats = {
        "avg_confidence": avg_ledger_confidence,
        "total_transactions": total_ledger_tx,
        "categorized_count": categorized_count,
        "uncategorized_count": uncategorized_count,
        "accuracy_rate": round((categorized_count / total_ledger_tx * 100), 1) if total_ledger_tx > 0 else 100.0
    }

    top_exp_codes = [x["code"] for x in expense_by_ledger_list[:3] if x["code"] != 'UNCATEGORIZED']
    top_inc_codes = [x["code"] for x in income_by_ledger_list[:3] if x["code"] != 'UNCATEGORIZED']
    
    today_date = date.today()
    monthly_trends = []
    for i in range(5, -1, -1):
        m = today_date.month - i
        y = today_date.year
        if m <= 0:
            m += 12
            y -= 1
        month_name = calendar.month_abbr[m]
        
        month_data = {"name": month_name}
        for code in top_exp_codes + top_inc_codes:
            month_data[code] = 0.0
            
        for inv in original_invoices:
            if inv.invoice_date and inv.total_amount:
                inv_date_val = inv.invoice_date.date() if isinstance(inv.invoice_date, datetime.datetime) else inv.invoice_date
                if inv_date_val.year == y and inv_date_val.month == m:
                    code = inv.ledger_code or 'UNCATEGORIZED'
                    if code in month_data:
                        month_data[code] += inv.total_amount
                        
        for key in month_data:
            if key != "name":
                month_data[key] = round(month_data[key], 2)
                
        monthly_trends.append(month_data)

    uncategorized_txs = [
        {
            "id": str(inv.id),
            "invoice_number": inv.invoice_number,
            "vendor_name": inv.vendor_name,
            "total_amount": inv.total_amount,
            "currency": inv.currency,
            "status": inv.payment_status,
            "confidence_score": inv.confidence_score,
            "created_at": (received_map.get(str(inv.id)) or inv.created_at).isoformat() if (received_map.get(str(inv.id)) or inv.created_at) else None,
            "invoice_date": to_iso_date(inv.invoice_date),
            "due_date": to_iso_date(inv.due_date),
            "notes": inv.notes,
            "transaction_type": inv.transaction_type,
            "ledger_confidence": inv.ledger_confidence,
            "document_type": inv.document_type
        }
        for inv in original_invoices if (inv.ledger_code or 'UNCATEGORIZED') == 'UNCATEGORIZED'
    ]
    uncategorized_txs.sort(
        key=lambda x: x["created_at"] or "",
        reverse=True
    )

    return {
        "total_spend": round(total_spend, 2),
        "processed_invoices": processed_count,
        "active_vendors": active_vendors,
        "avg_confidence": avg_confidence,
        "recent_invoices": recent,
        "spend_overview": overview_data,
        "revenue": {
            "revenue_raised": round(revenue_raised, 2),
            "revenue_received": round(revenue_received, 2),
            "pending_revenue": round(pending_revenue, 2),
            "overdue_revenue": round(overdue_revenue, 2),
            "customer_payments_count": customer_payments
        },
        "expense": {
            "expenses_raised": round(expenses_raised, 2),
            "expenses_paid": round(expenses_paid, 2),
            "pending_expenses": round(pending_expenses, 2),
            "overdue_expenses": round(overdue_expenses, 2),
            "vendor_payments_count": vendor_payments
        },
        "cashflow": {
            "cash_inflow": round(cash_inflow, 2),
            "cash_outflow": round(cash_outflow, 2),
            "net_cash_flow": round(net_cash_flow, 2)
        },
        "event_counts": event_counts,
        "mail_intelligence": {
            "sent_emails_count": sent_emails_count,
            "received_emails_count": received_emails_count,
            "recent_events": timeline[:10],
            "timeline": timeline
        },
        "ledger_intelligence": {
            "expense_by_ledger": expense_by_ledger_list,
            "income_by_ledger": income_by_ledger_list,
            "top_expense_ledgers": top_expense_ledgers,
            "top_revenue_ledgers": top_revenue_ledgers,
            "confidence_stats": confidence_stats,
            "monthly_trends": monthly_trends,
            "uncategorized_transactions": uncategorized_txs
        }
    }

class InvoiceUpdatePayload(BaseModel):
    status: Optional[str] = None
    approval_status: Optional[str] = None
    invoice_type: Optional[str] = None
    notes: Optional[str] = None
    email_direction: Optional[str] = None
    financial_event: Optional[str] = None
    transaction_type: Optional[str] = None
    financial_impact: Optional[str] = None
    cashflow: Optional[str] = None
    ledger_code: Optional[str] = None
    document_type: Optional[str] = None

@router.put("/{invoice_id}", response_model=dict)
async def update_invoice(
    invoice_id: str,
    payload: InvoiceUpdatePayload,
    db: AsyncSession = Depends(get_db)
):
    try:
        invoice_uuid = uuid.UUID(invoice_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")

    result = await db.execute(
        select(Invoice).filter(Invoice.id == invoice_uuid)
    )
    invoice = result.scalars().first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if payload.status is not None:
        invoice.payment_status = payload.status
        invoice.event_status = payload.status
    if payload.approval_status is not None:
        invoice.approval_status = payload.approval_status
    if payload.notes is not None:
        invoice.notes = payload.notes
    if payload.email_direction is not None:
        invoice.email_direction = payload.email_direction
    if payload.financial_event is not None:
        invoice.financial_event = payload.financial_event
    if payload.transaction_type is not None:
        invoice.transaction_type = payload.transaction_type
    if payload.financial_impact is not None:
        invoice.financial_impact = payload.financial_impact
    if payload.cashflow is not None:
        invoice.cashflow = payload.cashflow
    if payload.document_type is not None:
        invoice.document_type = payload.document_type

    # Update ledger classification if invoice_type or ledger_code changes
    new_ledger = payload.ledger_code if payload.ledger_code is not None else payload.invoice_type
    if new_ledger is not None:
        invoice.invoice_type = new_ledger
        invoice.ledger_code = new_ledger
        if new_ledger == "UNCATEGORIZED":
            invoice.ledger_name = "Uncategorized"
            invoice.ledger_category = "Uncategorized"
            invoice.ledger_group = "Uncategorized"
            invoice.ledger_confidence = 100.0
        else:
            from app.models import LedgerMaster
            ledger_res = await db.execute(
                select(LedgerMaster).filter(LedgerMaster.ledger_code == new_ledger)
            )
            ledger_obj = ledger_res.scalars().first()
            if ledger_obj:
                invoice.ledger_name = ledger_obj.ledger_name
                invoice.ledger_category = ledger_obj.ledger_category
                invoice.ledger_group = ledger_obj.ledger_group
                invoice.ledger_confidence = 100.0 # manual override classification
            else:
                # Fallback if unknown code passed
                invoice.ledger_name = new_ledger
                invoice.ledger_category = invoice.transaction_type or "Expense"
                invoice.ledger_group = "Uncategorized"
                invoice.ledger_confidence = 100.0

    await db.commit()
    await db.refresh(invoice)

    return {"message": "Invoice updated successfully", "id": str(invoice.id)}

@router.get("/ledgers", response_model=List[dict])
async def get_ledgers(db: AsyncSession = Depends(get_db)):
    from app.models import LedgerMaster
    result = await db.execute(
        select(LedgerMaster).filter(LedgerMaster.is_active == True).order_by(LedgerMaster.ledger_code)
    )
    ledgers = result.scalars().all()
    return [
        {
            "id": str(ledger.id),
            "ledger_code": ledger.ledger_code,
            "ledger_name": ledger.ledger_name,
            "ledger_category": ledger.ledger_category,
            "ledger_group": ledger.ledger_group,
            "description": ledger.description,
            "is_active": ledger.is_active,
            "created_at": ledger.created_at.isoformat() if ledger.created_at else None
        }
        for ledger in ledgers
    ]

@router.get("/events", response_model=List[dict])
async def get_financial_events(db: AsyncSession = Depends(get_db)):
    from app.models import FinancialEvent, EmailRecord
    result = await db.execute(
        select(FinancialEvent, EmailRecord.subject, EmailRecord.sender, Invoice.vendor_name, Invoice.invoice_number)
        .outerjoin(EmailRecord, FinancialEvent.email_id == EmailRecord.id)
        .outerjoin(Invoice, FinancialEvent.invoice_id == Invoice.id)
        .order_by(FinancialEvent.created_at.desc())
    )
    rows = result.all()
    return [
        {
            "id": str(fe.id),
            "invoice_id": str(fe.invoice_id) if fe.invoice_id else None,
            "email_id": str(fe.email_id) if fe.email_id else None,
            "email_direction": fe.email_direction,
            "financial_event": fe.financial_event,
            "transaction_type": fe.transaction_type,
            "financial_impact": fe.financial_impact,
            "cashflow": fe.cashflow,
            "amount": fe.amount,
            "status": fe.status,
            "created_at": fe.created_at.isoformat() if fe.created_at else None,
            "subject": subject,
            "sender": sender,
            "counterpart_name": vendor_name,
            "invoice_number": invoice_number
        }
        for fe, subject, sender, vendor_name, invoice_number in rows
    ]


@router.post("/sync")
async def trigger_sync(
    background_tasks: BackgroundTasks,
    full: bool = False,
    db: AsyncSession = Depends(get_db)
):
    from app.models import GmailConnection
    from app.api.auth import sync_gmail_invoices_background

    result = await db.execute(
        select(GmailConnection).filter(GmailConnection.status == "active")
    )
    connections = result.scalars().all()
    if not connections:
        raise HTTPException(status_code=400, detail="No active Gmail connections found.")

    days_back = 365 if full else 30
    for conn in connections:
        background_tasks.add_task(sync_gmail_invoices_background, str(conn.id), days_back)

    sync_type = "Full (365 days)" if full else "Recent (30 days)"
    return {"message": f"{sync_type} sync started for {len(connections)} connection(s)."}

class PubSubMessage(BaseModel):
    data: str
    messageId: str

class PubSubPayload(BaseModel):
    message: PubSubMessage
    subscription: str

@router.post("/webhook")
async def receive_gmail_webhook(
    payload: PubSubPayload,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    import base64
    import json

    try:
        decoded_bytes = base64.b64decode(payload.message.data)
        decoded_str = decoded_bytes.decode("utf-8")
        data_json = json.loads(decoded_str)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to decode Pub/Sub message data: {e}")

    email_address = data_json.get("emailAddress")
    if not email_address:
        return {"status": "ignored", "reason": "No emailAddress found in payload data"}

    from app.models import GmailConnection
    from app.api.auth import sync_gmail_invoices_background

    result = await db.execute(
        select(GmailConnection)
        .filter(GmailConnection.gmail_address == email_address)
        .filter(GmailConnection.status == "active")
    )
    connection = result.scalars().first()
    if not connection:
        return {"status": "ignored", "reason": f"No active Gmail connection found for {email_address}"}

    background_tasks.add_task(sync_gmail_invoices_background, str(connection.id), 30)

    return {"status": "triggered", "email": email_address, "connection_id": str(connection.id)}

@router.get("/{invoice_id}/pdf")
async def get_invoice_pdf(
    invoice_id: str,
    db: AsyncSession = Depends(get_db)
):
    import os
    from fastapi.responses import FileResponse
    
    try:
        invoice_uuid = uuid.UUID(invoice_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")

    result = await db.execute(
        select(Invoice).filter(Invoice.id == invoice_uuid)
    )
    invoice = result.scalars().first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if not invoice.email_record_id:
        raise HTTPException(status_code=404, detail="No email record associated with this invoice")

    att_result = await db.execute(
        select(Attachment).filter(Attachment.email_record_id == invoice.email_record_id)
    )
    attachment = att_result.scalars().first()
    if not attachment or not attachment.storage_path:
        raise HTTPException(status_code=404, detail="PDF attachment not found for this invoice")

    if not os.path.exists(attachment.storage_path):
        raise HTTPException(status_code=404, detail="PDF file not found on disk")

    return FileResponse(
        path=attachment.storage_path,
        media_type="application/pdf",
        filename=attachment.filename or "invoice.pdf"
    )

