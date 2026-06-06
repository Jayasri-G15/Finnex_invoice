import os
os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from google_auth_oauthlib.flow import Flow

from app.database import get_db
from app.models import GmailConnection, User
from app.services.sync_service import sync_gmail_invoices
from sqlalchemy.future import select
from sqlalchemy.sql import func
from googleapiclient.discovery import build

router = APIRouter()

# Client configs for Google OAuth
CLIENT_SECRETS_FILE = os.getenv("GOOGLE_CLIENT_SECRET_FILE", "client_secret.json")
SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'openid', 'email', 'profile']

@router.get("/google/login")
async def login_google():
    """Initiates the Google OAuth flow."""
    # Note: In a real app, use the actual client_secret.json file or construct from env vars
    try:
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": os.getenv("GOOGLE_CLIENT_ID"),
                    "project_id": os.getenv("GCP_PROJECT_ID", "finnex-dev"),
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                    "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
                    "redirect_uris": [os.getenv("GOOGLE_REDIRECT_URI")]
                }
            },
            scopes=SCOPES,
            autogenerate_code_verifier=False
        )
        flow.redirect_uri = os.getenv("GOOGLE_REDIRECT_URI")
        authorization_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            prompt='consent'
        )
        return RedirectResponse(url=authorization_url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def sync_gmail_invoices_background(connection_id: str, days_back: int = 30):
    from app.database import AsyncSessionLocal
    from app.models import GmailConnection
    from app.services.sync_service import sync_gmail_invoices
    from sqlalchemy.future import select
    
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(GmailConnection).filter(GmailConnection.id == connection_id)
        )
        connection = result.scalars().first()
        if connection:
            await sync_gmail_invoices(session, connection, days_back=days_back)

@router.get("/google/callback")
async def google_callback(
    request: Request, 
    background_tasks: BackgroundTasks, 
    db: AsyncSession = Depends(get_db)
):
    """Handles the callback from Google OAuth."""
    state = request.query_params.get("state")
    code = request.query_params.get("code")
    
    if not code:
        raise HTTPException(status_code=400, detail="Authorization code not found.")
    
    try:
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": os.getenv("GOOGLE_CLIENT_ID"),
                    "project_id": os.getenv("GCP_PROJECT_ID", "finnex-dev"),
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                    "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
                    "redirect_uris": [os.getenv("GOOGLE_REDIRECT_URI")]
                }
            },
            scopes=SCOPES,
            state=state,
            autogenerate_code_verifier=False
        )
        flow.redirect_uri = os.getenv("GOOGLE_REDIRECT_URI")
        flow.fetch_token(authorization_response=str(request.url))
        
        credentials = flow.credentials
        
        # Retrieve user profile info from Google API
        user_info_service = build('oauth2', 'v2', credentials=credentials)
        user_info = user_info_service.userinfo().get().execute()
        gmail_address = user_info.get("email")
        
        if not gmail_address:
            raise HTTPException(status_code=400, detail="Failed to retrieve Gmail address from profile.")
            
        # Get first user/org_id for default mapping if not set
        user_result = await db.execute(select(User).limit(1))
        first_user = user_result.scalars().first()
        org_id = first_user.org_id if first_user else None
        
        # Check if connection already exists
        connection_result = await db.execute(
            select(GmailConnection).filter(GmailConnection.gmail_address == gmail_address)
        )
        connection = connection_result.scalars().first()
        
        if connection:
            connection.encrypted_access_token = credentials.token
            if credentials.refresh_token:
                connection.encrypted_refresh_token = credentials.refresh_token
            connection.token_expiry = credentials.expiry
            connection.status = "active"
            connection.updated_at = func.now()
        else:
            connection = GmailConnection(
                org_id=org_id,
                gmail_address=gmail_address,
                encrypted_access_token=credentials.token,
                encrypted_refresh_token=credentials.refresh_token or "",
                token_expiry=credentials.expiry,
                status="active"
            )
            db.add(connection)
            
        await db.commit()
        await db.refresh(connection)
        
        # Trigger the sync workflow in the background to prevent HTTP timeouts
        background_tasks.add_task(sync_gmail_invoices_background, str(connection.id), 30)
        
        return RedirectResponse(url=f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/?sync=started")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OAuth callback failed: {str(e)}")
