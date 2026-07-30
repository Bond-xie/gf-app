// 定时推送函数：由 GitHub Actions（每日）或 Supabase 定时任务调用。
// 对每一个有订阅的房间：
//   1) 推送一条“早安情话”（按日期取稳定的一条）
//   2) 若今天 / 明天是纪念日，附带纪念日提醒
// 纪念日数据读取该房间在 gfsync 表中的同步快照（gfapp_anniversaries）。
// deno-lint-ignore-file
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MORNING_LINES = [
  "早安，今天也要想我哦 💗",
  "新的一天，先给你一个拥抱 🤗",
  "醒来第一个想到的就是你 ☀️",
  "今天也要一起变更好呀 🌱",
  "你的笑容是我今天的动力 😊",
  "无论多远，我的心都在你身边 💞",
  "乖，吃好喝好，我会想你的 🍰",
  "今天的你，比昨天更让我心动 ✨",
  "记得喝水、记得想我、记得开心 💧",
  "世界很甜，因为你都在 🍬",
];

function ymd(d: Date) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function annivComputeLocal(dateStr: string, today: Date) {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const isToday = d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  let next = new Date(t.getFullYear(), d.getMonth(), d.getDate());
  if (next < t) next = new Date(t.getFullYear() + 1, d.getMonth(), d.getDate());
  const left = Math.round((next - t) / 86400000);
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((t - base) / 86400000);
  const years = diffDays >= 0 ? Math.floor(diffDays / 365.25) : 0;
  return { past: diffDays >= 0, years, days: diffDays, left, isToday };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPriv = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubj = Deno.env.get("VAPID_SUBJECT") || "mailto:push@example.com";
    const vapidPub = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    if (!vapidPriv) {
      return new Response(JSON.stringify({ error: "VAPID_PRIVATE_KEY 未配置" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
    webpush.setVapidDetails(vapidSubj, vapidPub, vapidPriv);
    const hdr = { apikey: serviceRole, Authorization: "Bearer " + serviceRole };

    // 所有有订阅的房间（去重）
    const roomsResp = await fetch(supabaseUrl.replace(/\/+$/, "") + "/rest/v1/push_subscriptions?select=room", { headers: hdr });
    const roomsRows = await roomsResp.json();
    const rooms = [...new Set((roomsRows || []).map((r: any) => r.room))];

    const today = new Date();
    const todayStr = ymd(today);
    let total = 0;

    for (const room of rooms) {
      // 该房间订阅
      const subsResp = await fetch(
        supabaseUrl.replace(/\/+$/, "") + "/rest/v1/push_subscriptions?room=eq." + encodeURIComponent(room) + "&select=subscription",
        { headers: hdr }
      );
      const subs = await subsResp.json();

      // 纪念日：读该房间 gfsync 同步快照
      let annivNote = "";
      try {
        const gf = await fetch(supabaseUrl.replace(/\/+$/, "") + "/rest/v1/gfsync?room=eq." + encodeURIComponent(room) + "&select=data", { headers: hdr });
        const gfRows = await gf.json();
        if (gfRows && gfRows[0] && gfRows[0].data) {
          const snap = JSON.parse(gfRows[0].data);
          const raw = snap.data && snap.data.gfapp_anniversaries;
          const list = raw ? JSON.parse(raw) : [];
          for (const a of list) {
            const c = annivComputeLocal(a.date, today);
            if (c && (c.isToday || c.left === 1)) {
              annivNote = (c.isToday ? "💞 今天是 " : "💞 明天是 ") + (a.name || "纪念日") + (c.isToday ? " 🎉" : "（还有 1 天）");
              break;
            }
          }
        }
      } catch (_) {}

      const line = MORNING_LINES[hashStr(todayStr) % MORNING_LINES.length];
      const bodyText = annivNote ? line + "\n" + annivNote : line;
      const payload = JSON.stringify({ title: "☀️ 早安", body: bodyText, tag: "morning-" + todayStr, url: "/" });

      for (const row of (subs || [])) {
        const sub = row.subscription;
        if (!sub || !sub.endpoint) continue;
        try {
          await webpush.sendNotification(sub, payload);
          total++;
        } catch (_) {}
      }
    }
    return new Response(JSON.stringify({ rooms: rooms.length, sent: total }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
