// Web Push 发送函数：接收 { room, title, body, tag, url }，
// 把系统通知推送给该房间内所有已订阅设备（含对方）。需要 VAPID 私钥（环境变量）。
// deno-lint-ignore-file
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    const body = await req.json();
    const room = body.room;
    if (!room) {
      return new Response(JSON.stringify({ error: "room required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // 读取该房间所有订阅（用 service_role 绕过 RLS）
    const q = supabaseUrl.replace(/\/+$/, "") + "/rest/v1/push_subscriptions?room=eq." + encodeURIComponent(room) + "&select=subscription";
    const r = await fetch(q, { headers: { apikey: serviceRole, Authorization: "Bearer " + serviceRole } });
    const rows = await r.json();

    const payload = JSON.stringify({
      title: body.title || "💗 小软件",
      body: body.body || "",
      tag: body.tag,
      url: body.url || "/",
    });

    let sent = 0, failed = 0;
    for (const row of (rows || [])) {
      const sub = row.subscription;
      if (!sub || !sub.endpoint) continue;
      try {
        await webpush.sendNotification(sub, payload);
        sent++;
      } catch (e) {
        failed++;
        // 410/404 表示订阅已失效，可在此删除（可选）
        if (e && (e.statusCode === 404 || e.statusCode === 410)) {
          try {
            await fetch(
              supabaseUrl.replace(/\/+$/, "") + "/rest/v1/push_subscriptions?room=eq." + encodeURIComponent(room) + "&subscription->>endpoint=eq." + encodeURIComponent(sub.endpoint),
              { method: "DELETE", headers: { apikey: serviceRole, Authorization: "Bearer " + serviceRole } }
            );
          } catch (_) {}
        }
      }
    }
    return new Response(JSON.stringify({ sent, failed }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
