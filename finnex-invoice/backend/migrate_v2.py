import asyncio
import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

load_dotenv()

async def main():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is not set.")
        return

    # Use the async connection string
    engine = create_async_engine(database_url)
    async with engine.begin() as conn:
        try:
            print("Starting DDL updates...")
            # 1. Add columns to invoices table
            await conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS email_direction VARCHAR;"))
            await conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS financial_event VARCHAR;"))
            await conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS transaction_type VARCHAR;"))
            await conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS financial_impact VARCHAR;"))
            await conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cashflow VARCHAR;"))
            await conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS event_status VARCHAR;"))
            await conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS event_timestamp TIMESTAMP WITH TIME ZONE;"))
            print("Successfully added new columns to invoices table.")

            # 2. Create financial_events table
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS financial_events (
                    id UUID PRIMARY KEY,
                    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
                    email_id UUID REFERENCES email_records(id) ON DELETE SET NULL,
                    email_direction VARCHAR,
                    financial_event VARCHAR,
                    transaction_type VARCHAR,
                    financial_impact VARCHAR,
                    cashflow VARCHAR,
                    amount FLOAT,
                    status VARCHAR,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """))
            print("Successfully checked/created financial_events table.")

            # 3. Backfill invoices
            print("Backfilling existing invoices...")
            await conn.execute(text("""
                UPDATE invoices 
                SET 
                    email_direction = COALESCE(email_direction, 'MAIL_RECEIVED'),
                    financial_event = COALESCE(financial_event, 'RAISED'),
                    transaction_type = COALESCE(transaction_type, 'EXPENSE'),
                    financial_impact = COALESCE(financial_impact, 'NONE'),
                    cashflow = COALESCE(cashflow, 'NONE'),
                    event_status = COALESCE(event_status, payment_status),
                    event_timestamp = COALESCE(event_timestamp, created_at)
                WHERE email_direction IS NULL OR financial_event IS NULL;
            """))

            # 4. Insert baseline financial_events for existing invoices
            print("Creating baseline records in financial_events...")
            # Check if there are existing records in financial_events first, or insert only those that don't exist
            await conn.execute(text("""
                INSERT INTO financial_events (id, invoice_id, email_id, email_direction, financial_event, transaction_type, financial_impact, cashflow, amount, status, created_at)
                SELECT 
                    gen_random_uuid() as id,
                    id as invoice_id,
                    CASE WHEN email_record_id IN (SELECT id FROM email_records) THEN email_record_id ELSE NULL END as email_id,
                    email_direction,
                    financial_event,
                    transaction_type,
                    financial_impact,
                    cashflow,
                    total_amount as amount,
                    event_status as status,
                    event_timestamp as created_at
                FROM invoices
                WHERE id NOT IN (SELECT DISTINCT invoice_id FROM financial_events WHERE invoice_id IS NOT NULL);
            """))

            print("Migration completed successfully.")

        except Exception as e:
            print(f"Error executing migration DDL: {e}")
            import traceback
            traceback.print_exc()

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
