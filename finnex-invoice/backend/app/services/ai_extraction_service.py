import os
import json
from openai import AsyncOpenAI
import google.generativeai as genai

class AIExtractionService:
    def __init__(self):
        self.openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
        self.primary_model = os.getenv("OPENAI_EXTRACTION_MODEL", "gpt-4o")

    async def extract_invoice_data(
        self, 
        text_content: str = "", 
        pdf_bytes: bytes = None,
        email_sender: str = "",
        email_subject: str = "",
        connection_email: str = ""
    ) -> dict:
        """
        Extracts structured financial event and invoice information. Prioritizes multimodal direct PDF extraction using Gemini
        if PDF bytes are available, falling back to text-based extraction using OpenAI/Gemini if needed.
        """
        prompt = f"""
        Extract financial event metadata and structured information from the following financial document or email thread.
        
        Email Context:
        Sender: {email_sender}
        Subject: {email_subject}
        Connection Email Address: {connection_email}

        Return ONLY a valid JSON object matching this schema:
        {{
            "document_type": "string",
            "email_direction": "string",
            "financial_event": "string",
            "transaction_type": "string",
            "financial_impact": "string",
            "cashflow": "string",
            "status": "string",
            "vendor_or_customer_name": "string or null",
            "vendor_name": "string or null",
            "invoice_number": "string or null",
            "invoice_date": "YYYY-MM-DD or null",
            "due_date": "YYYY-MM-DD or null",
            "currency": "string or null",
            "amount": float,
            "subtotal": float or null,
            "tax_amount": float or null,
            "total_amount": float,
            "payment_status": "string",
            "purpose": "string or null",
            "invoice_type": "string or null",
            "payment_terms": "string or null",
            "line_items": [
                {{
                    "description": "string",
                    "quantity": float or null,
                    "unit_price": float or null,
                    "amount": float or null
                }}
            ],
            "ledger_code": "string or null",
            "ledger_name": "string or null",
            "ledger_category": "string or null",
            "ledger_group": "string or null",
            "ledger_confidence": float,
            "confidence_score": float
        }}

        Follow these classification steps in sequence:
        
        Step 1: Identify document type
        - Analyze the email text, subject, filename, and contents to classify the document type.
        - The value for "document_type" MUST be exactly one of the following:
          * "invoice": Standard bill or invoice indicating amount due.
          * "revenue_document": A document reflecting incoming business revenue (other than standard invoice or payment confirmation).
          * "IOU": A signed document acknowledging debt or informal loan.
          * "payment_confirmation": Confirmation/notification from bank or service that a payment transaction has been initiated or processed.
          * "payment_receipt": Receipt issued to show proof of successful payment or settlement of a bill.
          * "purchase_order": Official document issued by a buyer committing to pay the seller for the sale of specific products or services.
          * "quotation": Offer or estimate of prices for goods or services.
          * "credit_note": Document sent by a seller to a buyer reducing the amount the buyer owes.
          * "debit_note": Document sent by a buyer to a seller requesting a credit note, or issued by a seller to increase the amount due.
          * "bank_statement": Statement of transactions on a bank account.
          * "renewal": Document/notice relating to the renewal of a subscription, license, lease, or service contract.
          * "expense_claim": Claim made by an employee or contractor for business expenses incurred.
          * "reimbursement": Record or notice of paying back an expense.
          * "other": Any other financial documents.

        Step 2: Identify email direction
        - "email_direction": Must be exactly "MAIL_SENT" or "MAIL_RECEIVED".
        - If Sender contains Connection Email Address, classify as "MAIL_SENT". Otherwise, "MAIL_RECEIVED".

        Step 3: Identify financial event
        - "financial_event": Must be one of:
          "REQUESTED", "RAISED", "PENDING", "REMINDER", "PAID", "PAYMENT_COMPLETED", "PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_OVERDUE", "CANCELLED", "RENEWAL", "REFUND", "PARTIAL_PAYMENT", "APPROVED", "REJECTED"
        - Classify based on the current communication stage. For example, if it says payment completed, choose PAYMENT_COMPLETED.

        Step 4: Identify transaction type
        - "transaction_type": Must be exactly "REVENUE" or "EXPENSE".
          * "REVENUE" examples: Customer invoice, Revenue raised, Customer payment received, Accounts receivable.
          * "EXPENSE" examples: Vendor invoice, Expense raised, Vendor payment, Accounts payable.

        Step 5: Map to ledger
        - Determine if the transaction category is "Expense" or "Income" (must match transaction_type).
        - Map the transaction to exactly one of the ledger codes from the Chart of Accounts below based on vendor/customer name, line items, document content, and purpose:
          * Expense Ledgers Chart of Accounts:
            - ARC-23: Team Lunch & Outing, Medical Kits
            - ARC-26: Vendors, Partners, Freelancers, Gig Workers
            - ARC-29: Learning & Development
            - ARC-30: Marketing & Branding Expenses
            - ARC-31: Staff Welfare
            - ARC-32: Printing & Stationery
            - ARC-35: Food, Beverages, Event
            - ARC-36: Celebration & Goodies
            - ARC-59: Travelling & Conveyance
            - ASP-23: Team Lunch & Outing
            - ASP-24: Workspace Rent
            - ASP-26: Vendors, Partners, Freelancers, Gig Workers
            - ASP-28: Softwares, Laptop Rental
            - ASP-29: Learning & Development
            - ASP-30: Marketing & Branding Expenses
            - ASP-31: Staff Welfare
            - ASP-32: Printing & Stationery
            - ASP-33: Professional & Legal Expense
            - ASP-34: Books & Magazines
            - ASP-35: Food, Beverages, Event
            - ASP-36: Celebration & Goodies
            - ASP-40: Client Meeting/Food Expense
            - ASP-59: Travelling & Conveyance
            - COM-25: Equipment Rental
            - COM-26: Transport & Freight
            - COM-27: Professional & Consultancy
            - COM-COR-59: Travelling & Conveyance
            - COR-UNL-01: IT Expenses
            - EXT-23: Team Lunch & Outing, Medical Kits
            - EXT-25: Business Promotion
            - EXT-26: Vendors, Partners, Freelancers, Gig Workers
            - EXT-28: Softwares, Laptop Rental
            - EXT-29: Learning & Development
            - EXT-30: Marketing & Branding Expenses
            - EXT-31: Staff Welfare
            - EXT-32: Printing & Stationery
            - EXT-33: Professional & Legal Expense
            - EXT-34: Books & Magazines
            - EXT-35: Food, Beverages, Event
            - EXT-36: Celebration & Goodies
            - EXT-37: Telephone & Mobile
            - EXT-40: Client Meeting/Food Expense
            - EXT-59: Travelling & Conveyance
            - EXT-61: Softwares, Laptop Rental
            - GSD-25: Business Promotion
            - GSD-33: Professional & Legal Expense
            - GSD-59: Travelling & Conveyance
            - SISU-23: Team Lunch & Outing
            - SISU-25: Business Promotion
            - SISU-26: Vendors, Partners, Freelancers, Gig Workers
            - SISU-28: Softwares, Laptop Rental
            - SISU-29: Learning & Development
            - SISU-30: Marketing & Branding Expenses
            - SISU-31: Staff Welfare
            - SISU-32: Printing & Stationery
            - SISU-33: Professional & Legal Expense
            - SISU-34: Books & Magazines
            - SISU-35: Food, Beverages, Event
            - SISU-36: Celebration & Goodies
            - SISU-37: Telephone & Mobile
            - SISU-40: Client Meeting/Food Expense
            - SISU-59: Travelling & Conveyance
            - SISU-61: Rent for Office Space
            - ULD-30: Marketing Expenses for Unlimited
          * Income Ledgers Chart of Accounts:
            - ARC-02: Management Consulting Service
            - ARC-03: Management Consultancy Service
            - ASP-02: Management Consulting Service
            - ASP-03: Management Consultancy Service
            - ASP-04: Others
            - DOL-02: Management Consulting Service
            - DOL-03: Management Consulting Service
            - EDG-02: Management Consulting Service
            - EXT-01: Management Consulting Service
            - GSD-02: Internship Income
            - SISU-01: Management Consulting Service
            - SUBSCRIPTION: Subscription Income
        - Prefix Selection Rules:
          Identify if the client/customer name matches or relates to "ARC", "ASP", "EXT", "SISU", "COM", "GSD", etc. Select the ledger code starting with that prefix. If not specified or not clear, default to the ASP- prefix (e.g. ASP-28 for software/SaaS, ASP-59 for flights/travel, ASP-26 for gig workers).
        - Keyword Mappings:
          * "google ads", "facebook ads", "linkedin ads", "advertising", "marketing", "promotion" -> ASP-30 (Marketing & Branding Expenses)
          * "microsoft 365", "google workspace", "chatgpt", "claude", "software" -> ASP-28 (Softwares, Laptop Rental)
          * "lawyer", "legal", "consultant", "compliance" -> ASP-33 (Professional & Legal Expense)
          * "flight", "hotel", "uber", "travel", "taxi" -> ASP-59 (Travelling & Conveyance)
          * "office rent", "workspace rent", "coworking" -> SISU-61 (Rent for Office Space)
          * "consulting service", "consultancy", "management consulting" -> ARC-02 (Management Consulting Service)
          * "subscription", "membership", "recurring customer payment" -> SUBSCRIPTION (Subscription Income)
        - Populate the fields:
          * ledger_code: The exact ledger code chosen (e.g., ASP-30, SUBSCRIPTION)
          * ledger_name: The exact name of the ledger chosen (e.g., Marketing & Branding Expenses, Subscription Income)
          * ledger_category: "Expense" or "Income" (must match transaction_type)
          * ledger_group: The entity prefix before the first number (e.g. ARC, ASP, EXT, SISU, COM, COM-COR, COR-UNL, GSD, ULD, DOL, EDG, SUBSCRIPTION)
          * ledger_confidence: A confidence score from 0.0 to 100.0 for this mapping.
          * Also set the "invoice_type" field to the same value as "ledger_code" to maintain compatibility.

        Step 6: Store structured data
        - Populate financial_impact & cashflow:
          * Received payment (MAIL_RECEIVED + financial_event is PAYMENT_RECEIVED, PAYMENT_CONFIRMED, or PAYMENT_COMPLETED):
            - financial_impact = "INCREASE"
            - cashflow = "INFLOW"
          * Sent payment (MAIL_SENT + financial_event is PAID, PAYMENT_COMPLETED, or PAYMENT_CONFIRMED):
            - financial_impact = "DECREASE"
            - cashflow = "OUTFLOW"
          * Non-settlement/Informational events (REQUESTED, RAISED, PENDING, REMINDER, PAYMENT_OVERDUE, RENEWAL, CANCELLED, APPROVED, REJECTED):
            - financial_impact = "NONE"
            - cashflow = "NONE"
        - status: The transaction/event status. E.g. "pending", "paid", "cancelled", "overdue", "approved", "rejected".
        - amount: The transaction or event amount. For invoice raised/requested, it is the total invoice amount.
        - total_amount: The total amount of the invoice.

        General Rules:
        - Return valid JSON only conforming to the schema.
        - Normalize dates strictly to YYYY-MM-DD. If a date cannot be parsed or is missing, return null for that field.
        - Convert amounts to numeric values (floats). Do not include currency symbols or commas.
        - Assign a confidence score from 0.0 to 100.0 based on how clear and complete the information is.
        - 'vendor_or_customer_name' (and 'vendor_name') MUST be the counterpart name (the vendor for expenses, customer for revenues).
        - 'vendor_address' is the physical address of the vendor.
        - 'currency' is the 3-letter currency code (e.g. USD, EUR, CAD, INR, AUD). If the currency is not explicitly mentioned or is missing, default it to "INR".
        """

        # 1. Prioritize Gemini multimodal direct PDF extraction if PDF bytes are available
        if pdf_bytes:
            try:
                print("Prioritizing Gemini direct PDF multimodal extraction...")
                model = genai.GenerativeModel("gemini-2.5-flash")
                response = model.generate_content(
                    [
                        {
                            'mime_type': 'application/pdf',
                            'data': pdf_bytes
                        },
                        prompt
                    ],
                    generation_config={"response_mime_type": "application/json"}
                )
                result = json.loads(response.text)
                if result and (result.get("vendor_name") or result.get("vendor_or_customer_name") or result.get("total_amount")):
                    print("Gemini direct PDF extraction succeeded.")
                    return result
            except Exception as gemini_err:
                print(f"Gemini direct PDF extraction failed: {gemini_err}. Trying fallback...")

        # 2. Text-based extraction using OpenAI
        text_prompt = prompt + f"\n\nInvoice/Email Text:\n{text_content}"
        try:
            print(f"Running OpenAI text extraction using {self.primary_model}...")
            response = await self.openai_client.chat.completions.create(
                model=self.primary_model,
                messages=[
                    {"role": "system", "content": "You are an expert financial communication data extraction assistant. Return only JSON."},
                    {"role": "user", "content": text_prompt}
                ],
                response_format={ "type": "json_object" }
            )
            
            result_json = response.choices[0].message.content
            result = json.loads(result_json)
            if result:
                return result
            
        except Exception as e:
            print(f"OpenAI extraction failed: {e}. Trying Gemini text fallback...")
            try:
                model = genai.GenerativeModel("gemini-2.5-flash")
                if pdf_bytes:
                    content = [
                        {
                            'mime_type': 'application/pdf',
                            'data': pdf_bytes
                        },
                        prompt
                    ]
                else:
                    content = [text_prompt]
                    
                response = model.generate_content(
                    content,
                    generation_config={"response_mime_type": "application/json"}
                )
                return json.loads(response.text)
            except Exception as gemini_err:
                print(f"Gemini fallback also failed: {gemini_err}")
                return {}



