import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

type Row = { ts_hour: string; chat_id: string; chat_title: string; token: string; mentions: number };

export default function ChatHeatmap() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("v_token_mentions_by_chat_hour")
        .select("*");
      if (!error && data) setRows(data as Row[]);
    })();
  }, []);

  // build matrix: chats x tokens with summed mentions (last 24h)
  const { chats, tokens, matrix } = useMemo(() => {
    const chatSet = new Set<string>();
    const tokenSet = new Set<string>();
    rows.forEach(r => { chatSet.add(r.chat_title); tokenSet.add(r.token); });
    const chats = Array.from(chatSet);
    const tokens = Array.from(tokenSet);
    const idxChat = new Map(chats.map((c,i)=>[c,i]));
    const idxTok = new Map(tokens.map((t,i)=>[t,i]));
    const m = Array.from({length: chats.length}, ()=>Array(tokens.length).fill(0));
    rows.forEach(r => {
      const i = idxChat.get(r.chat_title)!;
      const j = idxTok.get(r.token)!;
      m[i][j] += r.mentions;
    });
    return { chats, tokens, matrix: m };
  }, [rows]);

  return (
    <div className="p-5 rounded-2xl bg-gray-900 text-gray-100 shadow-xl space-y-4">
      <h2 className="text-lg font-semibold">Per-Chat Token Mentions (Last 24h)</h2>
      <div className="overflow-auto">
        <table className="text-sm">
          <thead>
            <tr>
              <th className="p-2 text-left">Chat</th>
              {tokens.map(t => <th key={t} className="p-2">{t}</th>)}
            </tr>
          </thead>
          <tbody>
            {chats.map((c, i) => (
              <tr key={c}>
                <td className="p-2 pr-4 font-medium">{c}</td>
                {tokens.map((t, j) => {
                  const v = matrix[i][j];
                  const intensity = v === 0 ? "bg-gray-800" :
                                    v < 3 ? "bg-gray-700" :
                                    v < 6 ? "bg-gray-600" :
                                    v < 10 ? "bg-gray-500" : "bg-gray-400";
                  return <td key={t} className={`p-2 text-center ${intensity}`}>{v}</td>;
                })}
              </tr>
            ))}
            {!chats.length && (
              <tr><td className="p-2 text-gray-400">No data yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
