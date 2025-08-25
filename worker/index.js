// worker/index.js
import TelegramBot from "node-telegram-bot-api";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

const allowedChats = (process.env.ALLOWED_CHAT_IDS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

bot.on("message", async (msg) => {
  try {
    if (!msg?.text) return;
    if (allowedChats.length && !allowedChats.includes(String(msg.chat.id))) return;

    await supabase.from("telegram_messages").insert({
      telegram_msg_id: String(msg.message_id),
      chat_id: String(msg.chat.id),
      chat_title: msg.chat.title || null,
      username: msg.from?.username || String(msg.from?.id || ""),
      message: msg.text,
      timestamp: new Date(msg.date * 1000).toISOString(),
      processed: false
    });
  } catch (e) {
    console.error("ingest error:", e);
  }
});
