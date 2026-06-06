import asyncio
import os
import uuid
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

# Load environment variables from backend's parent directory (workspace root)
dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(dotenv_path)

EXPENSE_LEDGERS = {
    "ARC-23": "Team Lunch & Outing, Medical Kits",
    "ARC-26": "Vendors, Partners, Freelancers, Gig Workers",
    "ARC-29": "Learning & Development",
    "ARC-30": "Marketing & Branding Expenses",
    "ARC-31": "Staff Welfare",
    "ARC-32": "Printing & Stationery",
    "ARC-35": "Food, Beverages, Event",
    "ARC-36": "Celebration & Goodies",
    "ARC-59": "Travelling & Conveyance",
    "ASP-23": "Team Lunch & Outing",
    "ASP-24": "Workspace Rent",
    "ASP-26": "Vendors, Partners, Freelancers, Gig Workers",
    "ASP-28": "Softwares, Laptop Rental",
    "ASP-29": "Learning & Development",
    "ASP-30": "Marketing & Branding Expenses",
    "ASP-31": "Staff Welfare",
    "ASP-32": "Printing & Stationery",
    "ASP-33": "Professional & Legal Expense",
    "ASP-34": "Books & Magazines",
    "ASP-35": "Food, Beverages, Event",
    "ASP-36": "Celebration & Goodies",
    "ASP-40": "Client Meeting/Food Expense",
    "ASP-59": "Travelling & Conveyance",
    "COM-25": "Equipment Rental",
    "COM-26": "Transport & Freight",
    "COM-27": "Professional & Consultancy",
    "COM-COR-59": "Travelling & Conveyance",
    "COR-UNL-01": "IT Expenses",
    "EXT-23": "Team Lunch & Outing, Medical Kits",
    "EXT-25": "Business Promotion",
    "EXT-26": "Vendors, Partners, Freelancers, Gig Workers",
    "EXT-28": "Softwares, Laptop Rental",
    "EXT-29": "Learning & Development",
    "EXT-30": "Marketing & Branding Expenses",
    "EXT-31": "Staff Welfare",
    "EXT-32": "Printing & Stationery",
    "EXT-33": "Professional & Legal Expense",
    "EXT-34": "Books & Magazines",
    "EXT-35": "Food, Beverages, Event",
    "EXT-36": "Celebration & Goodies",
    "EXT-37": "Telephone & Mobile",
    "EXT-40": "Client Meeting/Food Expense",
    "EXT-59": "Travelling & Conveyance",
    "EXT-61": "Softwares, Laptop Rental",
    "GSD-25": "Business Promotion",
    "GSD-33": "Professional & Legal Expense",
    "GSD-59": "Travelling & Conveyance",
    "SISU-23": "Team Lunch & Outing",
    "SISU-25": "Business Promotion",
    "SISU-26": "Vendors, Partners, Freelancers, Gig Workers",
    "SISU-28": "Softwares, Laptop Rental",
    "SISU-29": "Learning & Development",
    "SISU-30": "Marketing & Branding Expenses",
    "SISU-31": "Staff Welfare",
    "SISU-32": "Printing & Stationery",
    "SISU-33": "Professional & Legal Expense",
    "SISU-34": "Books & Magazines",
    "SISU-35": "Food, Beverages, Event",
    "SISU-36": "Celebration & Goodies",
    "SISU-37": "Telephone & Mobile",
    "SISU-40": "Client Meeting/Food Expense",
    "SISU-59": "Travelling & Conveyance",
    "SISU-61": "Rent for Office Space",
    "ULD-30": "Marketing Expenses for Unlimited"
}

INCOME_LEDGERS = {
    "ARC-02": "Management Consulting Service",
    "ARC-03": "Management Consultancy Service",
    "ASP-02": "Management Consulting Service",
    "ASP-03": "Management Consultancy Service",
    "ASP-04": "Others",
    "DOL-02": "Management Consulting Service",
    "DOL-03": "Management Consulting Service",
    "EDG-02": "Management Consulting Service",
    "EXT-01": "Management Consulting Service",
    "GSD-02": "Internship Income",
    "SISU-01": "Management Consulting Service",
    "SUBSCRIPTION": "Subscription Income"
}

KEYWORD_MAPPINGS = [
    {
        "keywords": ["google ads", "facebook ads", "linkedin ads", "advertising", "marketing", "promotion"],
        "ledger_code": "ASP-30",
        "ledger_name": "Marketing & Branding Expenses",
        "ledger_category": "Expense"
    },
    {
        "keywords": ["microsoft 365", "google workspace", "chatgpt", "claude", "software", "rental", "saas", "aws", "gcp", "azure"],
        "ledger_code": "ASP-28",
        "ledger_name": "Softwares, Laptop Rental",
        "ledger_category": "Expense"
    },
    {
        "keywords": ["lawyer", "legal", "consultant", "compliance", "audit", "counsel"],
        "ledger_code": "ASP-33",
        "ledger_name": "Professional & Legal Expense",
        "ledger_category": "Expense"
    },
    {
        "keywords": ["flight", "hotel", "uber", "travel", "taxi", "conveyance", "train", "cab"],
        "ledger_code": "ASP-59",
        "ledger_name": "Travelling & Conveyance",
        "ledger_category": "Expense"
    },
    {
        "keywords": ["office rent", "workspace rent", "coworking", "rent"],
        "ledger_code": "SISU-61",
        "ledger_name": "Rent for Office Space",
        "ledger_category": "Expense"
    },
    {
        "keywords": ["consulting service", "consultancy", "management consulting"],
        "ledger_code": "ARC-02",
        "ledger_name": "Management Consulting Service",
        "ledger_category": "Income"
    },
    {
        "keywords": ["subscription", "membership", "recurring customer payment"],
        "ledger_code": "SUBSCRIPTION",
        "ledger_name": "Subscription Income",
        "ledger_category": "Income"
    }
]

def get_ledger_group(code):
    if code == "SUBSCRIPTION":
        return "SUBSCRIPTION"
    parts = code.split('-')
    if len(parts) > 1:
        if parts[-1].isdigit():
            return "-".join(parts[:-1])
        else:
            return "-".join(parts)
    return code

async def main():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is not set.")
        return

    engine = create_async_engine(database_url)
    async with engine.begin() as conn:
        try:
            print("Starting DDL updates for Ledger Intelligence...")
            
            # 1. Create ledger_master table
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS ledger_master (
                    id UUID PRIMARY KEY,
                    ledger_code VARCHAR UNIQUE NOT NULL,
                    ledger_name VARCHAR NOT NULL,
                    ledger_category VARCHAR NOT NULL,
                    ledger_group VARCHAR,
                    description VARCHAR,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """))
            print("Successfully created ledger_master table.")

            # 2. Add columns to invoices table
            await conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ledger_code VARCHAR;"))
            await conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ledger_name VARCHAR;"))
            await conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ledger_category VARCHAR;"))
            await conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ledger_group VARCHAR;"))
            await conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ledger_confidence FLOAT DEFAULT 0.0;"))
            print("Successfully added new ledger columns to invoices table.")

            # 3. Seed ledger_master table
            print("Seeding ledger_master table...")
            for code, name in EXPENSE_LEDGERS.items():
                group = get_ledger_group(code)
                await conn.execute(text("""
                    INSERT INTO ledger_master (id, ledger_code, ledger_name, ledger_category, ledger_group, is_active)
                    VALUES (:id, :code, :name, 'Expense', :group, TRUE)
                    ON CONFLICT (ledger_code) DO UPDATE 
                    SET ledger_name = EXCLUDED.ledger_name, ledger_category = EXCLUDED.ledger_category, ledger_group = EXCLUDED.ledger_group;
                """), {"id": str(uuid.uuid4()), "code": code, "name": name, "group": group})
                
            for code, name in INCOME_LEDGERS.items():
                group = get_ledger_group(code)
                await conn.execute(text("""
                    INSERT INTO ledger_master (id, ledger_code, ledger_name, ledger_category, ledger_group, is_active)
                    VALUES (:id, :code, :name, 'Income', :group, TRUE)
                    ON CONFLICT (ledger_code) DO UPDATE 
                    SET ledger_name = EXCLUDED.ledger_name, ledger_category = EXCLUDED.ledger_category, ledger_group = EXCLUDED.ledger_group;
                """), {"id": str(uuid.uuid4()), "code": code, "name": name, "group": group})
            
            print("Successfully seeded ledger_master.")

            # 4. Backfill existing invoices
            print("Backfilling existing invoices...")
            # Fetch all existing invoices
            result = await conn.execute(text("SELECT id, invoice_type, vendor_name, notes, total_amount FROM invoices;"))
            invoices = result.all()
            
            all_ledgers = {**EXPENSE_LEDGERS, **INCOME_LEDGERS}
            
            for row in invoices:
                inv_id, inv_type, vendor, notes, amount = row
                
                matched_code = None
                matched_name = None
                matched_category = None
                confidence = 0.0
                
                # Check 1: If invoice_type is set and is a valid ledger code
                if inv_type and inv_type in all_ledgers:
                    matched_code = inv_type
                    matched_name = all_ledgers[inv_type]
                    matched_category = "Expense" if inv_type in EXPENSE_LEDGERS else "Income"
                    confidence = 100.0
                else:
                    # Check 2: Try keyword matching on vendor or notes
                    search_str = f"{(vendor or '')} {(notes or '')}".lower()
                    for mapping in KEYWORD_MAPPINGS:
                        if any(kw in search_str for kw in mapping["keywords"]):
                            matched_code = mapping["ledger_code"]
                            matched_name = mapping["ledger_name"]
                            matched_category = mapping["ledger_category"]
                            confidence = 85.0
                            break
                
                # Fallback: Uncategorized
                if not matched_code:
                    matched_code = "UNCATEGORIZED"
                    matched_name = "Uncategorized"
                    matched_category = "Uncategorized"
                    confidence = 0.0
                    
                group = get_ledger_group(matched_code)
                
                await conn.execute(text("""
                    UPDATE invoices 
                    SET ledger_code = :code, ledger_name = :name, ledger_category = :category, ledger_group = :group, ledger_confidence = :confidence, invoice_type = :code
                    WHERE id = :id;
                """), {"id": inv_id, "code": matched_code, "name": matched_name, "category": matched_category, "group": group, "confidence": confidence})
                
            print(f"Successfully backfilled {len(invoices)} invoices.")
            print("Migration completed successfully.")

        except Exception as e:
            print(f"Error executing migration DDL: {e}")
            import traceback
            traceback.print_exc()

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
