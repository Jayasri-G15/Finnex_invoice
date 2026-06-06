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

    # Use the async connection string
    engine = create_async_engine(database_url)
    async with engine.begin() as conn:
        try:
            print("Starting DDL updates for currency...")
            # 1. Alter table defaults
            await conn.execute(text("ALTER TABLE invoices ALTER COLUMN currency SET DEFAULT 'INR';"))
            print("Successfully set currency default to 'INR' in invoices table.")

            # 2. Backfill existing records
            print("Backfilling existing records to 'INR'...")
            await conn.execute(text("UPDATE invoices SET currency = 'INR' WHERE currency IS NULL OR currency = 'USD';"))
            print("Successfully backfilled existing records.")

        except Exception as e:
            print(f"Error executing migration DDL: {e}")
            import traceback
            traceback.print_exc()

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
