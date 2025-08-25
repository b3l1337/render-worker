// supabase/functions/summarize/index.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_KEY")!
);

const AI_PROVIDER = (Deno.env.get("AI_PROVIDER") || "openai").toLowerCase();
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const XAI_API_KEY = Deno.env.get("XAI_API_KEY") || "";

const CASHTAG = /\$[A-Za-z0-9]{2,10}\b/g;
const TICKER   = /\b[A-Z]{2,10}\b/g;
const ADDRESS  = /0x[a-fA-F0-9]{6,}\b/g;
const COMMON = new Set(["BTC","ETH","SOL","ORDI","DOGE","TON","BNB","XRP","ADA","AVAX","ARB","OP","PEPE","WIF","SHIB","LINK","APT","SUI"]);

function extractCandidates(text: string): string[] {
  const set = new Set<string>();
  const add = (v: string) => set.add(v.replace(/^\$/,"").toUpperCase());
  (text.match(CASHTAG) || []).forEach(add);
  (text.match(ADDRESS) || []).forEach(v => set.add(v));
  (text.match(TICKER)  || []).forEach(w => {
    if (COMMON.has(w)) set.add(w);
  });
  return [...set].slice(0, 100);
}

function toStrictJSON(text: string): any | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : text;
  try { return JSON.parse(raw); } catch { return null; }
}

async function callOpenAI(prompt: any) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `You analyze Telegram crypto chats and return STRICT JSON.
Schema:
{
 "overall_sentiment": "bullish" | "bearish" | "neutral",
 "summary": string,
 "per_token": [
   { "token": string, "sentiment": "bullish"|"bearish"|"neutral", "confidence": number, "mentions": number, "notes": string }
 ]
}
Rules:
- Use only tokens from the provided candidate list.
- Aggregate by symbol or address.
- Confidence in [0,1]. Mentions = reference count in batch.
- Keep 'notes' under 200 chars.` },
        { role: "user", content: JSON.stringify(prompt) }
      ]
    })
  });
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  return toStrictJSON(content);
}

async function callXAI(prompt: any) {
  const resp = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${XAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "grok-2",
      temperature: 0.2,
      messages: [
        { role: "system", content: `You analyze Telegram crypto chats and return STRICT JSON.
Schema:
{
 "overall_sentiment": "bullish" | "bearish" | "neutral",
 "summary": string,
 "per_token": [
   { "token": string, "sentiment": "bullish"|"bearish"|"neutral", "confidence": number, "mentions": number, "notes": string }
 ]
}` },
        { role: "user", content: JSON.stringify(prompt) }
      ]
    })
  });
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  return toStrictJSON(content);
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 80)));

    const { data: messages, error } = await supabase
      .from("telegram_messages")
      .select("id, message")
      .eq("processed", false)
      .order("timestamp", { ascending: true })
      .limit(limit);

    if (error) throw error;
    if (!messages?.length) return new Response("No new messages", { status: 200 });

    const allText = messages.map(m => m.message).join("\n");
    const candidates = extractCandidates(allText);

    const perMessageRows: { message_id: string; token: string; source: string }[] = [];
    for (const m of messages) {
      const c = extractCandidates(m.message);
      c.forEach(tok => perMessageRows.push({ message_id: m.id, token: tok, source: "regex" }));
    }
    if (perMessageRows.length) {
      await supabase.from("telegram_message_tokens").insert(perMessageRows);
    }

    const prompt = {
      candidate_tokens: candidates,
      batch_size: messages.length,
      excerpts: messages.map(m => m.message).slice(0, 500),
    };

    const parsed = AI_PROVIDER === "xai" ? await callXAI(prompt) : await callOpenAI(prompt);
    if (!parsed || !parsed.per_token || !Array.isArray(parsed.per_token)) {
      throw new Error("AI response not parseable or missing per_token");
    }

    const { data: inserted, error: insErr } = await supabase
      .from("telegram_summaries")
      .insert({
        summary: String(parsed.summary || "").slice(0, 8000),
        overall_sentiment: parsed.overall_sentiment || "neutral",
        total_messages: messages.length,
        model: AI_PROVIDER
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    const summaryId = inserted.id;

    const tokenRows = (parsed.per_token as any[])
      .filter(t => t?.token)
      .slice(0, 100)
      .map(t => ({
        summary_id: summaryId,
        token: String(t.token).slice(0, 64).toUpperCase(),
        sentiment: (["bullish","bearish","neutral"].includes(String(t.sentiment)) ? t.sentiment : "neutral"),
        confidence: Math.max(0, Math.min(1, Number(t.confidence || 0))),
        mentions: Math.max(0, parseInt(String(t.mentions || 0))),
        notes: String(t.notes || "").slice(0, 500)
      }));

    if (tokenRows.length) {
      await supabase.from("token_insights").insert(tokenRows);
    }

    await supabase
      .from("telegram_messages")
      .update({ processed: true })
      .in("id", messages.map(m => m.id));

    return new Response(JSON.stringify({ summary_id: summaryId, tokens: tokenRows.length }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("summarize error:", e);
    return new Response(`Error: ${e.message || e}`, { status: 500 });
  }
});
