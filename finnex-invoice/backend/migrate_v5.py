import asyncio
import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

# Load environment variables from backend's parent directory (workspace root)
dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(dotenv_path)

async def main():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is not set.")
        return

    engine = create_async_engine(database_url)
    async with engine.begin() as conn:
        try:
            print("Starting DDL updates for Financial Document Classification...")
            
            # 1. Add document_type column to invoices table
            await conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS document_type VARCHAR;"))
            print("Successfully added document_type column to invoices table.")

            # 2. Backfill existing invoices
            print("Backfilling existing invoices with derived document types...")
            # Fetch all existing invoices
            result = await conn.execute(text("SELECT id, transaction_type, financial_event, notes, ledger_code FROM invoices;"))
            invoices = result.all()
            
            for row in invoices:
                inv_id, tx_type, event, notes, ledger = row
                
                doc_type = "invoice" # Default
                
                tx_type_upper = (tx_type or "EXPENSE").upper()
                event_upper = (event or "RAISED").upper()
                notes_lower = (notes or "").lower()
                
                if tx_type_upper == 'REVENUE':
                    if event_upper in ['PAID', 'PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_COMPLETED']:
                        doc_type = 'payment_receipt'
                    else:
                        doc_type = 'revenue_document'
                elif tx_type_upper == 'EXPENSE':
                    if event_upper in ['PAID', 'PAYMENT_COMPLETED', 'PAYMENT_CONFIRMED']:
                        doc_type = 'payment_receipt'
                    elif 'claim' in notes_lower or 'reimburse' in notes_lower or ledger in ['ASP-59', 'ARC-59', 'EXT-59', 'SISU-59', 'COM-COR-59', 'GSD-59']:
                        doc_type = 'expense_claim'
                    elif 'quote' in notes_lower or 'quotation' in notes_lower:
                        doc_type = 'quotation'
                    elif 'iou' in notes_lower:
                        doc_type = 'IOU'
                    elif event_upper == 'RENEWAL' or 'renewal' in notes_lower:
                        doc_type = 'renewal'
                    else:
                        doc_type = 'invoice'
                else:
                    doc_type = 'other'
                    
                await conn.execute(text("""
                    UPDATE invoices 
                    SET document_type = :doc_type
                    WHERE id = :id;
                """), {"id": inv_id, "doc_type": doc_type})
                
            print(f"Successfully backfilled {len(invoices)} invoices with document types.")
            print("Migration completed successfully.")

        except Exception as e:
            print(f"Error executing migration DDL: {e}")
            import traceback
            traceback.print_exc()

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
