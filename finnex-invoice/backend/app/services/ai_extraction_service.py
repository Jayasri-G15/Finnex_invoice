import os
import json
from openai import AsyncOpenAI
import google.generativeai as genai

class AIExtractionService:
    def __init__(self):
        self.openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
        self.primary_model = os.getenv("OPENAI_EXTRACTION_MODEL", "gpt-4o")

    async def extract_invoice_data(self, text_content: str = "", pdf_bytes: bytes = None) -> dict:
        """
        Extracts structured invoice information. Prioritizes multimodal direct PDF extraction using Gemini
        if PDF bytes are available, falling back to text-based extraction using OpenAI/Gemini if needed.
        """
        prompt = """
        Extract the following information from the invoice text or document.
        Return ONLY a valid JSON object matching this schema:
        {
            "invoice_number": "string or null",
            "vendor_name": "string or null",
            "vendor_email": "string or null",
            "vendor_address": "string or null",
            "invoice_date": "YYYY-MM-DD or null",
            "due_date": "YYYY-MM-DD or null",
            "currency": "string or null",
            "subtotal": float or null,
            "tax_amount": float or null,
            "total_amount": float or null,
            "purpose": "string or null",
            "invoice_type": "string or null",
            "payment_terms": "string or null",
            "line_items": [
                {
                    "description": "string",
                    "quantity": float,
                    "unit_price": float,
                    "amount": float
                }
            ],
            "confidence_score": float
        }
        
        Rules:
        - Return valid JSON only.
        - Normalize dates strictly to YYYY-MM-DD. If a date cannot be parsed or is missing, return null for that field.
        - Convert amounts to numeric values (floats). Do not include currency symbols or commas.
        - Assign a confidence score from 0.0 to 100.0 based on how clear and complete the information is.
        - 'vendor_name' MUST be the vendor selling goods/services (the issuer of the invoice), NOT the customer receiving it (e.g. do not use names under 'Bill To', 'Attention to', 'Client', or 'Ship To').
        - 'vendor_address' is the physical address of the vendor.
        - 'total_amount' is the final grand total amount due. If not explicitly found but subtotal and tax_amount are found, calculate total_amount = subtotal + tax_amount.
        - 'currency' is the 3-letter currency code (e.g. USD, EUR, CAD, INR, AUD).
        - 'payment_terms' are the terms of payment (e.g. "Net 30", "Due on Receipt").
        - 'line_items' is a list of individual items/services listed on the invoice.
        - 'invoice_type' MUST be classified as one of these category ledger codes based on what the invoice is for:
          * Team lunch & outing, team events, medical kits: Choose ARC-23 or ASP-23
          * Vendors, Partners, Freelancers, Gig Workers, contractors: Choose ARC-26 or ASP-26
          * Learning & Development, courses, training: Choose ARC-29 or ASP-29
          * Marketing & Branding, ads, promotional expenses: Choose ARC-30 or ASP-30
          * Staff Welfare, employee benefits/perks: Choose ARC-31 or ASP-31
          * Printing & Stationery, office supplies: Choose ARC-32 or ASP-32
          * Food, Beverages, Event catering: Choose ARC-35 or ASP-35
          * Celebration, goodies, gifts, decorations: Choose ARC-36 or ASP-36
          * Travelling & Conveyance, transport, taxi, flights, hotels: Choose ARC-59 or ASP-59
          * Workspace Rent, office rent: Choose ASP-24
          * Softwares, SaaS, laptop rental, IT hardware rentals: Choose ASP-28
          * Professional & Legal Expense, audits, legal fees: Choose ASP-33
          * Telephone, Mobile, Books, Magazines, Internet bills: Choose ASP-34
          * Client Meeting, client entertainment, business food: Choose ASP-40
          * Management Consulting Service, advisory, travel reimbursement: Choose ARC-02, ARC-03, ASP-02, or ASP-03
          * Others (miscellaneous): Choose ASP-04
          
          Prefix rules:
          Determine if the invoice client/customer name is "ARC" or "ASP". If the client/customer is ARC, choose the ARC- prefix. If the client/customer is ASP, choose the ASP- prefix. If not specified or not clear, default to the ASP- prefix (e.g., ASP-28 for software subscriptions).
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
                if result and (result.get("vendor_name") or result.get("total_amount")):
                    print("Gemini direct PDF extraction succeeded.")
                    return result
            except Exception as gemini_err:
                print(f"Gemini direct PDF extraction failed: {gemini_err}. Trying fallback...")

        # 2. Text-based extraction using OpenAI
        text_prompt = prompt + f"\n\nInvoice Text:\n{text_content}"
        try:
            print(f"Running OpenAI text extraction using {self.primary_model}...")
            response = await self.openai_client.chat.completions.create(
                model=self.primary_model,
                messages=[
                    {"role": "system", "content": "You are an expert invoice data extraction assistant. Return only JSON."},
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


