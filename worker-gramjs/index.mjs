// worker-gramjs/index.mjs
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessionStr = process.env.TELEGRAM_SESSION || "";
const stringSession = new StringSession(sessionStr);

const allowed = (process.env.ALLOWED_CHAT_IDS || "")
  .split(",").map(s => s.trim()).filter(Boolean);

function allowedChat(id, title) {
  if (!allowed.length) return true;
  return allowed.includes(String(id)) || (title && allowed.includes(title));
}

const client = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
});

await client.start({
  phoneNumber: async () => process.env.TELEGRAM_PHONE || await input.text("phone: "),
  password: async () => process.env.TELEGRAM_2FA_PASSWORD || await input.text("2FA password (if any): "),
  phoneCode: async () => await input.text("Code: "),
  onError: (err) => console.error(err),
});

console.log("Connected. Session:", client.session.save());

client.addEventHandler(async (event) => {
  try {
    const message = event.message;
    if (!message || !message.message) return;

    const chat = await message.getChat();
    const chatId = chat.id;
    const title = chat.title || chat.username || null;
    if (!allowedChat(chatId, title)) return;

    const from = await message.getSender();
    const username = from?.username || String(from?.id || "");

    await supabase.from("telegram_messages").insert({
      telegram_msg_id: String(message.id),
      chat_id: String(chatId),
      chat_title: title,
      username: username,
      message: message.message,
      timestamp: new Date(message.date * 1000).toISOString(),
      processed: false
    });
  } catch (e) {
    console.error("GRAMJS ERROR:", e);
  }
});
