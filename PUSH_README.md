# Web Push 系统通知（纪念日 / 早安情话 / SOS）

本项目是纯静态（GitHub Pages），无法自己发推送。推送后端用 **Supabase Edge Functions** 实现，
复用你已有的中转 Supabase 项目，零额外服务器成本。

> 即使不部署后端，app 内也支持「打开 app 时」的本地通知（早安情话 + 今日纪念日提醒）。
> 部署后端后，解锁 **app 关闭/后台时** 也能收到系统通知（含 SOS 实时推送）。

---

## 一、生成 VAPID 密钥

```bash
npx web-push generate-vapid-keys
```

会得到一对：
- **公钥 (public key)** → 填进 `index.html` 里的 `push.VAPID_PUBLIC_KEY = '...'`
- **私钥 (private key)** → 设为 Supabase 的 Secret（下一步）

## 二、建表（在 Supabase 后台 SQL Editor 执行）

打开你的 Supabase 项目 → **SQL Editor** → 新建查询 → 粘贴 `supabase/push_setup.sql` 全部内容 → 运行。

该表 `push_subscriptions(room, device_id, subscription)` 与 `gfsync` 同级安全模型（anon 可读写）。

## 三、配置 Secrets

项目 **Settings → Edge Functions → Secrets（或 Project Settings → API → 下方 "Environment variables"）** 添加：

| 名称 | 值 |
|------|-----|
| `VAPID_PRIVATE_KEY` | 上一步生成的私钥 |
| `VAPID_PUBLIC_KEY` | 上一步生成的公钥（与 index.html 填的一致） |
| `VAPID_SUBJECT` | 任意，如 `mailto:you@example.com` |

> `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 在 Edge Function 运行时**自动注入**，无需手动填。

## 四、部署两个 Edge Functions

方式 A（推荐，Supabase CLI）：

```bash
supabase functions deploy push-send
supabase functions deploy push-cron
```

方式 B（无 CLI）：在 **Edge Functions** 页面分别新建 `push-send`、`push-cron`，
把 `supabase/functions/push-send/index.ts` 与 `supabase/functions/push-cron/index.ts` 的内容粘进去部署。

## 五、把 VAPID 公钥回填前端并重新部署

编辑 `index.html`：

```js
const push = {
  VAPID_PUBLIC_KEY: '这里填你的 VAPID 公钥',
  ...
```

然后照常把 `index.html`、`sw.js` 复制到部署目录并推到 GitHub Pages。

## 六、开启每日定时推送（纪念日 / 早安）

仓库已含 `.github/workflows/daily-push.yml`。在 **仓库 Settings → Secrets → Actions** 添加：

- `SUPABASE_URL`：你的 Project URL
- `SUPABASE_ANON_KEY`：你的 anon public key

之后每天（UTC 23:00 ≈ 北京 07:00）自动给所有订阅房间推送早安情话；若当天/次日是纪念日，附带提醒。
也可在 Actions 页面手动 `Run workflow` 立即试一次。

> 不想用 GitHub Actions，也可在 Supabase 用 `pg_cron` 定时 `SELECT net.http_post(... '/functions/v1/push-cron' ...)`，
> 或任意一台服务器/云函数定时 curl 该地址。

---

## 前端使用流程

1. 在「🔗 数据同步」卡片里**配置并启用中转服务**（Supabase URL + anon key，建好 `gfsync` 表）。
2. 创建/加入同步房间，让两人都在同一房间。
3. 同一卡片底部点「🔔 开启系统通知」→ 允许浏览器通知权限。
4. 之后：
   - 任一方触发 **SOS** → 对方（即便在后台）收到系统通知 🆘
   - 每天打开 app → 收到早安情话通知；若当天是纪念日 → 收到纪念日提醒
   - 部署了后端后 → 即便 app 关着，每日早安 / 纪念日 / SOS 也会作为系统通知送达

## 安全说明

- 与现有中转（gfsync）同级别：依赖房间号作为共享暗号，anon key 公开。适合私密情侣小软件。
- 若要给**多用户**公开使用，必须加账号体系 + RLS 行级隔离 + 校验 device_id，详见 `2026-07-30.md` 的多租户方案。
- 推送内容不含业务敏感数据（仅通知标题/正文），定位坐标等仍走既有实时通道。
