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
    result = await db.execute(
        select(Invoice, EmailRecord.received_at, EmailRecord.sender)
        .outerjoin(EmailRecord, Invoice.email_record_id == EmailRecord.id)
        .order_by(Invoice.created_at.desc())
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
            "pdf_url": f"/api/v1/invoices/{inv.id}/pdf"
        }
        for inv, received_at, sender in rows
    ]

@router.get("/summary")
async def get_dashboard_summary(db: AsyncSession = Depends(get_db)):
    from app.models import EmailRecord
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
    
    # Total Spend (sum of original invoices)
    total_spend = sum(inv.total_amount for inv in original_invoices if inv.total_amount is not None)
    
    # Processed Invoices (all invoices processed by system)
    processed_count = len(all_invoices)
    
    # Active Vendors (number of unique vendor names among original invoices)
    unique_vendors = {inv.vendor_name.strip() for inv in original_invoices if inv.vendor_name}
    active_vendors = len(unique_vendors)
    
    # Avg. Confidence Score
    avg_confidence = 0.0
    if all_invoices:
        valid_scores = [inv.confidence_score for inv in all_invoices if inv.confidence_score is not None]
        if valid_scores:
            avg_confidence = round(sum(valid_scores) / len(valid_scores), 1)
            
    # Recent Invoices (limit to 20, sorted by created_at desc to allow frontend carousel/paging)
    recent_invoices = sorted(
        all_invoices, 
        key=lambda x: x.created_at or x.id, 
        reverse=True
    )[:20]
    
    def to_iso_date(val):
        if val is None:
            return None
        if isinstance(val, date):
            return val.isoformat()
        if hasattr(val, "date"):
            return val.date().isoformat()
        return None
 
    recent = [
        {
            "id": str(inv.id),
            "invoice_number": inv.invoice_number,
            "vendor_name": inv.vendor_name,
            "total_amount": inv.total_amount,
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
            "pdf_url": f"/api/v1/invoices/{inv.id}/pdf"
        }
        for inv in recent_invoices
    ]
    
    # Spend overview (last 6 months, using original invoices only)
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
            if inv.invoice_date and inv.total_amount:
                if inv.invoice_date.year == y and inv.invoice_date.month == m:
                    spend += inv.total_amount
                    
        overview_data.append({
            "name": month_name,
            "total": round(spend, 2)
        })
        
    return {
        "total_spend": round(total_spend, 2),
        "processed_invoices": processed_count,
        "active_vendors": active_vendors,
        "avg_confidence": avg_confidence,
        "recent_invoices": recent,
        "spend_overview": overview_data
    }

class InvoiceUpdatePayload(BaseModel):
    status: Optional[str] = None
    approval_status: Optional[str] = None
    invoice_type: Optional[str] = None
    notes: Optional[str] = None

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
    if payload.approval_status is not None:
        invoice.approval_status = payload.approval_status
    if payload.invoice_type is not None:
        invoice.invoice_type = payload.invoice_type
    if payload.notes is not None:
        invoice.notes = payload.notes

    await db.commit()
    await db.refresh(invoice)

    return {"message": "Invoice updated successfully", "id": str(invoice.id)}

@router.post("/sync")
async def trigger_sync(
    background_tasks: BackgroundTasks,
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

    for conn in connections:
        background_tasks.add_task(sync_gmail_invoices_background, str(conn.id))

    return {"message": f"Sync started for {len(connections)} connection(s)."}

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

    background_tasks.add_task(sync_gmail_invoices_background, str(connection.id))

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

