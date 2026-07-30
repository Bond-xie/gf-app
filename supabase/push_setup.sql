-- Web Push 订阅表：存储每台设备（房间 + 设备ID）的推送订阅
-- 与 gfsync 同级别安全模型：中转 anon 密钥本就公开，所以 anon 可读写本表。
-- 房间号是两人共享的“暗号”，非敏感；订阅仅用于给同房间成员推通知。
create table if not exists public.push_subscriptions (
  room        text        not null,
  device_id   text        not null,
  subscription jsonb      not null,
  updated_at  timestamptz default now(),
  primary key (room, device_id)
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_select" on public.push_subscriptions;
create policy "push_select" on public.push_subscriptions
  for select using (true);

drop policy if exists "push_insert" on public.push_subscriptions;
create policy "push_insert" on public.push_subscriptions
  for insert with check (true);

drop policy if exists "push_update" on public.push_subscriptions;
create policy "push_update" on public.push_subscriptions
  for update using (true) with check (true);

grant select, insert, update on public.push_subscriptions to anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create index if not exists push_subscriptions_room_idx on public.push_subscriptions(room);
