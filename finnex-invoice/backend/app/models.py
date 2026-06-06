from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), nullable=True)
    email = Column(String, unique=True, index=True)
    full_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=True)
    role = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class GmailConnection(Base):
    __tablename__ = "gmail_connections"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), nullable=True)
    gmail_address = Column(String, index=True)
    encrypted_access_token = Column(String, nullable=True)
    encrypted_refresh_token = Column(String)
    token_expiry = Column(DateTime(timezone=True), nullable=True)
    watch_expiry = Column(DateTime(timezone=True), nullable=True)
    history_id = Column(String, nullable=True)
    status = Column(String, default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class EmailRecord(Base):
    __tablename__ = "email_records"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), nullable=True)
    gmail_message_id = Column(String, unique=True, index=True)
    gmail_thread_id = Column(String, nullable=True)
    sender = Column(String, nullable=True)
    subject = Column(String, nullable=True)
    received_at = Column(DateTime(timezone=True), nullable=True)
    has_attachments = Column(Boolean, default=False)
    raw_body_preview = Column(String, nullable=True)
    processing_status = Column(String, default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class Invoice(Base):
    __tablename__ = "invoices"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), nullable=True)
    user_id = Column(UUID(as_uuid=True), nullable=True)
    email_record_id = Column(UUID(as_uuid=True), nullable=True)
    transaction_id = Column(UUID(as_uuid=True), nullable=True)
    invoice_number = Column(String, index=True, nullable=True)
    invoice_type = Column(String, nullable=True)
    vendor_name = Column(String, index=True, nullable=True)
    vendor_email = Column(String, nullable=True)
    vendor_address = Column(String, nullable=True)
    invoice_date = Column(DateTime(timezone=True), nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)
    subtotal = Column(Float, nullable=True)
    total_tax = Column(Float, nullable=True)
    total_amount = Column(Float, nullable=True)
    currency = Column(String, nullable=True, server_default='INR')
    net_payable = Column(Float, nullable=True)
    payment_status = Column(String, default="pending")
    approval_status = Column(String, default="pending")
    confidence_score = Column(Float, nullable=True)
    notes = Column(String, nullable=True)
    line_items = Column(JSON, nullable=True)
    payment_terms = Column(String, nullable=True)
    email_direction = Column(String, nullable=True)
    financial_event = Column(String, nullable=True)
    transaction_type = Column(String, nullable=True)
    financial_impact = Column(String, nullable=True)
    cashflow = Column(String, nullable=True)
    event_status = Column(String, nullable=True)
    event_timestamp = Column(DateTime(timezone=True), nullable=True)
    ledger_code = Column(String, nullable=True)
    ledger_name = Column(String, nullable=True)
    ledger_category = Column(String, nullable=True)
    ledger_group = Column(String, nullable=True)
    ledger_confidence = Column(Float, nullable=True)
    document_type = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class Attachment(Base):
    __tablename__ = "attachments"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), nullable=True)
    email_record_id = Column(UUID(as_uuid=True), ForeignKey("email_records.id"), nullable=True)
    gmail_attachment_id = Column(String, nullable=True)
    filename = Column(String, nullable=True)
    mime_type = Column(String, nullable=True)
    file_size_bytes = Column(Integer, nullable=True)
    attachment_type = Column(String, nullable=True)
    extracted_text = Column(String, nullable=True)
    extracted_data = Column(JSON, nullable=True)
    processing_status = Column(String, default="pending")
    ocr_confidence = Column(Integer, nullable=True)
    storage_path = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    file_hash = Column(String, nullable=True)
    ocr_engine = Column(String, nullable=True)

class FinancialEvent(Base):
    __tablename__ = "financial_events"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id"), nullable=True)
    email_id = Column(UUID(as_uuid=True), ForeignKey("email_records.id"), nullable=True)
    email_direction = Column(String, nullable=True)
    financial_event = Column(String, nullable=True)
    transaction_type = Column(String, nullable=True)
    financial_impact = Column(String, nullable=True)
    cashflow = Column(String, nullable=True)
    amount = Column(Float, nullable=True)
    status = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class LedgerMaster(Base):
    __tablename__ = "ledger_master"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ledger_code = Column(String, unique=True, index=True, nullable=False)
    ledger_name = Column(String, nullable=False)
    ledger_category = Column(String, nullable=False)
    ledger_group = Column(String, nullable=True)
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
