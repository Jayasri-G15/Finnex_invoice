import io
import os
import uuid
import pypdf
import logging
from datetime import datetime
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Invoice, EmailRecord, GmailConnection, User, Attachment
from app.services.gmail_service import GmailService
from app.services.ai_extraction_service import AIExtractionService

logger = logging.getLogger(__name__)

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    try:
        pdf_file = io.BytesIO(pdf_bytes)
        reader = pypdf.PdfReader(pdf_file)
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""
        return text
    except Exception as e:
        logger.error(f"Failed to extract text from PDF: {e}")
        return ""

async def sync_gmail_invoices(db: AsyncSession, connection: GmailConnection) -> dict:
    """
    Syncs invoices from Gmail for the given connection.
    Returns a summary of processed emails and invoices created.
    """
    stats = {
        "emails_fetched": 0,
        "emails_processed": 0,
        "invoices_created": 0,
        "failed": 0
    }
    
    if not connection.encrypted_refresh_token:
        logger.error(f"No refresh token available for GmailConnection {connection.gmail_address}")
        return stats
        
    try:
        gmail_service = GmailService(connection.encrypted_refresh_token)
        emails = gmail_service.fetch_invoice_emails(days_back=30)
        stats["emails_fetched"] = len(emails)
        
        ai_service = AIExtractionService()
        
        # Get first user/org_id for default mapping if not set
        user_result = await db.execute(select(User).limit(1))
        first_user = user_result.scalars().first()
        default_org_id = connection.org_id or (first_user.org_id if first_user else None)
        default_user_id = first_user.id if first_user else None

        for email in emails:
            msg_id = email["message_id"]
            
            # Check if this email record is already in DB
            stmt = select(EmailRecord).filter(EmailRecord.gmail_message_id == msg_id)
            res = await db.execute(stmt)
            existing_record = res.scalars().first()
            
            if existing_record:
                if existing_record.processing_status == "completed":
                    # Already processed successfully
                    continue
                email_record = existing_record
                email_record.processing_status = "processing"
            else:
                # Create a new EmailRecord
                import datetime as dt_module
                received_at_dt = None
                if email.get("received_at"):
                    received_at_dt = dt_module.datetime.fromtimestamp(email["received_at"] / 1000.0, tz=dt_module.timezone.utc)

                email_record = EmailRecord(
                    org_id=default_org_id,
                    gmail_message_id=msg_id,
                    sender=email["sender"],
                    subject=email["subject"],
                    has_attachments=len(email.get("attachments", [])) > 0,
                    processing_status="processing",
                    received_at=received_at_dt
                )
                db.add(email_record)
                await db.flush() # Populate id
            
            pdf_text = ""
            first_pdf_bytes = None
            attachments = email.get("attachments", [])
            
            # Process PDF attachments
            for att in attachments:
                if att["filename"].lower().endswith(".pdf"):
                    pdf_bytes = gmail_service.download_attachment(msg_id, att["attachment_id"])
                    if pdf_bytes:
                        if first_pdf_bytes is None:
                            first_pdf_bytes = pdf_bytes
                        extracted_text = extract_text_from_pdf(pdf_bytes)
                        if extracted_text:
                            pdf_text += f"\n--- Attachment: {att['filename']} ---\n" + extracted_text
                        
                        # Save attachment file locally and add Attachment record to DB
                        try:
                            # Construct local directory: backend/data/invoices
                            data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "invoices"))
                            os.makedirs(data_dir, exist_ok=True)
                            
                            att_id = uuid.uuid4()
                            file_path = os.path.join(data_dir, f"{att_id}.pdf")
                            with open(file_path, "wb") as f:
                                f.write(pdf_bytes)
                                
                            attachment_record = Attachment(
                                id=att_id,
                                org_id=default_org_id,
                                email_record_id=email_record.id,
                                gmail_attachment_id=att["attachment_id"],
                                filename=att["filename"],
                                mime_type="application/pdf",
                                file_size_bytes=len(pdf_bytes),
                                storage_path=file_path,
                                processing_status="completed",
                                extracted_text=extracted_text
                            )
                            db.add(attachment_record)
                        except Exception as store_err:
                            logger.error(f"Failed to save PDF attachment locally or to DB: {store_err}", exc_info=True)
            
            # Fallback to email body text if no PDF text is available
            extraction_source_text = pdf_text.strip()
            if not extraction_source_text:
                extraction_source_text = email.get("body", "").strip()
            
            if not extraction_source_text and not first_pdf_bytes:
                email_record.processing_status = "failed"
                email_record.raw_body_preview = "No text extracted from PDF or email body."
                await db.commit()
                stats["failed"] += 1
                continue
                
            # Run AI extraction
            extracted_data = await ai_service.extract_invoice_data(extraction_source_text, first_pdf_bytes)
            
            if not extracted_data or (not extracted_data.get("vendor_name") and not extracted_data.get("total_amount")):
                email_record.processing_status = "failed"
                email_record.raw_body_preview = f"AI extraction did not identify this PDF as an invoice. Result: {extracted_data}"
                await db.commit()
                stats["failed"] += 1
                continue
                
            # Parse dates
            invoice_date = None
            if extracted_data.get("invoice_date"):
                try:
                    invoice_date = datetime.strptime(extracted_data["invoice_date"], "%Y-%m-%d")
                except ValueError:
                    pass
                    
            due_date = None
            if extracted_data.get("due_date"):
                try:
                    due_date = datetime.strptime(extracted_data["due_date"], "%Y-%m-%d")
                except ValueError:
                    pass
            
            # Validate total_amount (not null constraint in PostgreSQL)
            total_amount = extracted_data.get("total_amount")
            if total_amount is None:
                subtotal = extracted_data.get("subtotal")
                tax_amount = extracted_data.get("tax_amount") or 0.0
                if subtotal is not None:
                    total_amount = subtotal + tax_amount
            
            if total_amount is None:
                email_record.processing_status = "failed"
                email_record.raw_body_preview = f"AI extraction did not identify total amount. Result: {extracted_data}"
                await db.commit()
                stats["failed"] += 1
                continue
            
            # Save invoice to DB
            invoice = Invoice(
                org_id=default_org_id,
                user_id=default_user_id,
                email_record_id=email_record.id,
                invoice_number=extracted_data.get("invoice_number"),
                vendor_name=extracted_data.get("vendor_name"),
                vendor_email=extracted_data.get("vendor_email"),
                vendor_address=extracted_data.get("vendor_address"),
                invoice_type=extracted_data.get("invoice_type"), # Save category ledger code
                invoice_date=invoice_date,
                due_date=due_date,
                subtotal=extracted_data.get("subtotal"),
                total_tax=extracted_data.get("tax_amount"),
                total_amount=total_amount,
                currency=extracted_data.get("currency"),
                confidence_score=extracted_data.get("confidence_score"),
                notes=extracted_data.get("purpose"),
                line_items=extracted_data.get("line_items"),
                payment_terms=extracted_data.get("payment_terms"),
                payment_status="pending",
                approval_status="pending"
            )
            db.add(invoice)
            
            # Update EmailRecord status
            email_record.processing_status = "completed"
            email_record.raw_body_preview = extraction_source_text[:500]
            
            await db.commit()
            stats["emails_processed"] += 1
            stats["invoices_created"] += 1
            
    except Exception as e:
        logger.error(f"Gmail sync failed: {e}", exc_info=True)
        stats["failed"] += 1
        
    return stats
