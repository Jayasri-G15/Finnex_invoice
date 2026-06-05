from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from app.api import invoices, auth

app = FastAPI(title="Invoice Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", '["*"]'),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to the Invoice Intelligence API"}

from fastapi import Request, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db

@app.get("/v1/gmail/callback")
async def gmail_callback_alias(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    # Alias to match the GOOGLE_REDIRECT_URI configured in the user's Google Cloud Console
    return await auth.google_callback(
        request=request,
        background_tasks=background_tasks,
        db=db
    )

app.include_router(invoices.router, prefix="/api/v1/invoices", tags=["Invoices"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
