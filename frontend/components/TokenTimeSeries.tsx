import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from "recharts";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

type Row = { ts_day: string; chat_id: string; chat_title: string; token: string; mentions: number };

export default function TokenTimeSeries({ tokenFilter }: { tokenFilter?: string }) {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      let query = supabase.from("v_token_mentions_by_chat_day").select("*");
      if (tokenFilter) query = query.eq("token", tokenFilter.toUpperCase());
      const { data, error } = await query;
      if (!error && data) setRows(data as Row[]);
    })();
  }, [tokenFilter]);

  // pivot by chat over days
  const data = useMemo(() => {
    const map = new Map<string, any>(); // key: day
    const chats = new Set<string>();
    rows.forEach(r => {
      const day = r.ts_day.slice(0,10);
      const key = day;
      chats.add(r.chat_title);
      const obj = map.get(key) || { day };
      obj[r.chat_title] = (obj[r.chat_title] || 0) + r.mentions;
      map.set(key, obj);
    });
    const arr = Array.from(map.values()).sort((a,b)=>a.day.localeCompare(b.day));
    return { data: arr, chats: Array.from(chats) };
  }, [rows]);

  return (
    <div className="p-5 rounded-2xl bg-gray-900 text-gray-100 shadow-xl space-y-4">
      <h2 className="text-lg font-semibold">Token Mentions by Chat (7 days){tokenFilter ? ` – ${tokenFilter}` : ""}</h2>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            {data.chats.map((c, i) => (
              <Line key={c} type="monotone" dataKey={c} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
