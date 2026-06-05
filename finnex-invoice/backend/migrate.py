import asyncio
import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

load_dotenv()

async def main():
    engine = create_async_engine(os.getenv("DATABASE_URL"))
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS user_id INTEGER;"))
            print("Successfully added user_id column.")
        except Exception as e:
            print(f"Error modifying schema: {e}")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
