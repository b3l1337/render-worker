import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

type Row = {
  id: string;
  summary: string;
  overall_sentiment: "bullish" | "bearish" | "neutral" | null;
  total_messages: number | null;
  model: string | null;
  created_at: string;
  token: string | null;
  sentiment: "bullish" | "bearish" | "neutral" | null;
  confidence: number | null;
  mentions: number | null;
  notes: string | null;
};

export default function TelegramIntelligenceCard() {
  const [summary, setSummary] = useState<string>("Loading...");
  const [overall, setOverall] = useState<string>("neutral");
  const [model, setModel] = useState<string>("");
  const [tokens, setTokens] = useState<Row[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  async function refresh() {
    setLoading(true);
    try {
      // Optional: trigger summarize run
      await supabase.functions.invoke("summarize");

      const { data, error } = await supabase
        .from("v_latest_telegram_intel")
        .select("*")
        .order("token", { ascending: true });

      if (!error && data && data.length) {
        const first = data[0];
        setSummary(first.summary);
        setOverall(first.overall_sentiment || "neutral");
        setModel(first.model || "");
        setTokens(data.filter((r: Row) => r.token));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const sentimentColor = (s?: string | null) =>
    s === "bullish" ? "bg-green-600"
    : s === "bearish" ? "bg-red-600"
    : "bg-yellow-600";

  return (
    <div className="p-5 rounded-2xl bg-gray-900 text-gray-100 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Telegram Intelligence</h2>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-3 py-1 rounded-xl bg-gray-700 hover:bg-gray-600 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`px-2 py-1 rounded-lg text-xs ${sentimentColor(overall)}`}>
          Overall: {overall}
        </span>
        <span className="px-2 py-1 rounded-lg text-xs bg-gray-700">Model: {model}</span>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Summary</h3>
        <p className="text-sm whitespace-pre-wrap">{summary}</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Token Signals</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-300">
              <tr>
                <th className="py-2 pr-4">Token</th>
                <th className="py-2 pr-4">Sentiment</th>
                <th className="py-2 pr-4">Confidence</th>
                <th className="py-2 pr-4">Mentions</th>
                <th className="py-2 pr-4">Notes</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((r, i) => (
                <tr key={i} className="border-t border-gray-800">
                  <td className="py-2 pr-4 font-mono">{r.token}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-1 rounded ${sentimentColor(r.sentiment)}`}>
                      {r.sentiment}
                    </span>
                  </td>
                  <td className="py-2 pr-4">{(r.confidence ?? 0).toFixed(2)}</td>
                  <td className="py-2 pr-4">{r.mentions ?? 0}</td>
                  <td className="py-2 pr-4">{r.notes}</td>
                </tr>
              ))}
              {!tokens.length && (
                <tr><td colSpan={5} className="py-2 text-gray-400">No tokens detected.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
