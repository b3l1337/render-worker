# worker-python/main.py
import os
import asyncio
from supabase import create_client, Client
from telethon import TelegramClient, events

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
API_ID = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]
SESSION = os.environ.get("TELEGRAM_SESSION", "anon")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
client = TelegramClient(SESSION, API_ID, API_HASH)

# Optional: restrict to chats by username or id, comma-separated
allowed = os.environ.get("ALLOWED_CHAT_IDS", "")
ALLOWED = set([s.strip() for s in allowed.split(",") if s.strip()])

def allowed_chat(chat_id: int, title: str | None) -> bool:
    if not ALLOWED:
        return True
    return str(chat_id) in ALLOWED or (title and title in ALLOWED)

@client.on(events.NewMessage)
async def handler(event):
    try:
        msg = event.message
        chat = await event.get_chat()
        chat_id = getattr(chat, "id", None)
        chat_title = getattr(chat, "title", None) or getattr(chat, "username", None)
        if chat_id is None:
            return
        if not allowed_chat(chat_id, chat_title):
            return

        text = msg.message or ""
        if not text:
            return

        username = None
        if msg.sender:
            username = getattr(msg.sender, "username", None) or str(getattr(msg.sender, "id", ""))

        data = {
            "telegram_msg_id": str(msg.id),
            "chat_id": str(chat_id),
            "chat_title": chat_title,
            "username": username,
            "message": text,
            "timestamp": msg.date.isoformat(),
            "processed": False,
        }
        supabase.table("telegram_messages").insert(data).execute()
        print("Stored:", text[:80].replace("\n"," "))

    except Exception as e:
        print("INGEST ERROR:", e)

def main():
    print("Starting Telethon worker...")
    client.start()
    client.run_until_disconnected()

if __name__ == "__main__":
    main()
