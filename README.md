# Telegram → Supabase → AI Summarizer (OpenAI/xAI) → Frontend

End-to-end pipeline:
- **Render worker** ingests Telegram messages into Supabase
- **Supabase Edge Function** summarizes + classifies sentiment + extracts token insights
- **Frontend (lovable.dev)** displays latest summary and per-token signals
- **Scheduler** (Supabase Scheduled Functions) runs summarize periodically

---

## 1) Supabase Setup

Run the SQL:
```
\i supabase/migrations.sql
```

Then deploy the Edge Function:
```
cd supabase/functions/summarize
supabase functions deploy summarize
```

Grant env vars in Supabase project (Settings → Functions → Secrets):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `AI_PROVIDER` = `openai` or `xai`
- `OPENAI_API_KEY` (if using OpenAI)
- `XAI_API_KEY` (if using xAI)

---

## 2) Render Worker (Telegram ingestion)

```
cd worker
npm i
```
Ensure env vars in Render:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `ALLOWED_CHAT_IDS` (optional)

Start command: `node index.js`

You can use the included `render.yaml` to create the Worker service.

---

## 3) Scheduler (Supabase Scheduled Functions)

In Supabase Dashboard → **Edge Functions → Schedules → New Schedule**:
- Function: `summarize`
- Method: `POST`
- Cron: every 10 minutes → `*/10 * * * *`
- Payload: empty

Alternatively with CLI:
```
supabase functions schedule create summarize-every-10   --function summarize   --cron "*/10 * * * *"   --request-body "{}"   --request-method POST
```

This will call the summarize function every 10 minutes to process new messages.

---

## 4) Frontend (lovable.dev)

Use the provided component:
```
frontend/components/TelegramIntelligenceCard.tsx
```
It invokes the summarize function (optional) and reads from the `v_latest_telegram_intel` view.

Set env:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

## 5) Notes

- If you need private channels, consider a full Telegram Client (GramJS / Telethon). The worker sample uses the Bot API.
- The Edge Function constrains token analysis with a local extractor; you can expand `COMMON` or add contract indexers.
- RLS: raw tables are service-only; aggregate intel is public (read) for easy frontend consumption.
- Switch providers by changing `AI_PROVIDER` env without code changes.


---

## Private channel access options

### A) Python Telethon worker (private groups/channels)
- Deploy `worker-python/` on Render as a **background worker**.
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, optional `TELEGRAM_SESSION`, `ALLOWED_CHAT_IDS`.
- Start command: `python -u main.py`.

### B) Node GramJS worker
- Deploy `worker-gramjs/` on Render.
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_PHONE` (optional), `TELEGRAM_2FA_PASSWORD` (optional), `TELEGRAM_SESSION` (captured after first login).
- Start: `node index.mjs`.

---

## Heatmap & Time-Series Charts

Use these components in your Lovable.dev app:

- `frontend/components/ChatHeatmap.tsx` – per-chat x token **heatmap** (last 24h)
- `frontend/components/TokenTimeSeries.tsx` – per-chat **time series** (last 7 days), optional `tokenFilter` prop

They read from the provided SQL views:
- `v_token_mentions_by_chat_hour`
- `v_token_mentions_by_chat_day`

> Note: Sentiment in heatmaps is not per-chat unless you extend the Edge Function to score per-chat batches. This version visualizes **mention volume**; you can layer sentiment by adding a `message_sentiment` table and scoring in the edge function.
