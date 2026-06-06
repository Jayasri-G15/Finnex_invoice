import os
import json
import base64
from typing import List, Dict, Any
from datetime import datetime, timedelta
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

def get_email_body(msg: dict) -> str:
    """
    Extracts text body from Gmail message payload, preferring text/plain over text/html.
    """
    import re
    
    def find_text_parts(part, parts_dict):
        mime_type = part.get('mimeType', '')
        body_data = part.get('body', {}).get('data', '')
        if mime_type == 'text/plain' and body_data:
            parts_dict['plain'].append(body_data)
        elif mime_type == 'text/html' and body_data:
            parts_dict['html'].append(body_data)
            
        if 'parts' in part:
            for subpart in part['parts']:
                find_text_parts(subpart, parts_dict)

    parts_dict = {'plain': [], 'html': []}
    find_text_parts(msg.get('payload', {}), parts_dict)
    
    # Prefer plain text
    if parts_dict['plain']:
        data = "\n".join(parts_dict['plain'])
    elif parts_dict['html']:
        data = "\n".join(parts_dict['html'])
    else:
        return ""
        
    try:
        decoded = base64.urlsafe_b64decode(data.encode('UTF-8')).decode('utf-8', errors='ignore')
        # If it's HTML, simple tag stripping to reduce tokens
        if parts_dict['html'] and not parts_dict['plain']:
            # Strip style and script tags first
            decoded = re.sub(r'<style[^>]*>[\s\S]*?</style>', '', decoded)
            decoded = re.sub(r'<script[^>]*>[\s\S]*?</script>', '', decoded)
            # Strip other HTML tags
            decoded = re.sub(r'<[^>]+>', ' ', decoded)
            # Normalize whitespace
            decoded = re.sub(r'\s+', ' ', decoded).strip()
        return decoded
    except Exception as e:
        print(f"Error decoding body: {e}")
        return ""

class GmailService:
    def __init__(self, refresh_token: str):
        self.credentials = Credentials(
            token=None,
            refresh_token=refresh_token,
            client_id=os.getenv("GOOGLE_CLIENT_ID"),
            client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
            token_uri="https://oauth2.googleapis.com/token"
        )
        self.service = build('gmail', 'v1', credentials=self.credentials)

    def fetch_invoice_emails(self, days_back: int = 30) -> List[Dict[str, Any]]:
        try:
            # Broaden query to fetch emails with financial communication-related terms OR PDF attachments
            query = f"newer_than:{days_back}d (subject:(invoice OR bill OR receipt OR payment OR revenue OR IOU OR confirmation OR \"purchase order\" OR quotation OR quote OR \"credit note\" OR \"debit note\" OR statement OR renewal OR expense OR claim OR reimbursement) OR filename:pdf)"
            
            results = self.service.users().messages().list(userId='me', q=query).execute()
            messages = results.get('messages', [])
            
            email_data = []
            for message in messages:
                msg = self.service.users().messages().get(userId='me', id=message['id']).execute()
                
                headers = msg['payload'].get('headers', [])
                subject = next((h['value'] for h in headers if h['name'] == 'Subject'), "Unknown Subject")
                sender = next((h['value'] for h in headers if h['name'] == 'From'), "Unknown Sender")
                internal_date_ms = int(msg.get('internalDate', 0))
                
                parts = msg['payload'].get('parts', [])
                attachments = []
                
                def extract_attachments(payload_parts):
                    for part in payload_parts:
                        if part.get('filename') and part.get('body', {}).get('attachmentId'):
                            attachments.append({
                                'filename': part['filename'],
                                'attachment_id': part['body']['attachmentId']
                            })
                        if 'parts' in part:
                            extract_attachments(part['parts'])
                
                extract_attachments(parts)
                
                email_data.append({
                    'message_id': message['id'],
                    'subject': subject,
                    'sender': sender,
                    'body': get_email_body(msg),
                    'attachments': attachments,
                    'received_at': internal_date_ms
                })
                
            return email_data
            
        except HttpError as error:
            print(f"An error occurred: {error}")
            return []

    def download_attachment(self, message_id: str, attachment_id: str) -> bytes:
        try:
            attachment = self.service.users().messages().attachments().get(
                userId='me', messageId=message_id, id=attachment_id
            ).execute()
            
            file_data = base64.urlsafe_b64decode(attachment['data'].encode('UTF-8'))
            return file_data
        except HttpError as error:
            print(f"An error occurred: {error}")
            return b""
