-- GLOBAL CLICKER - Supabase setup
-- Run this entire script in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.game_state(
  id boolean primary key default true,
  global_clicks numeric not null default 0,
  online_count integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint one_game_state check (id=true)
);
insert into public.game_state(id) values(true) on conflict do nothing;

create table if not exists public.players(
  id uuid primary key,
  clicks numeric not null default 0,
  levels jsonb not null default '{}'::jsonb,
  online boolean not null default true,
  last_seen timestamptz not null default now()
);

alter table public.game_state enable row level security;
alter table public.players enable row level security;

drop policy if exists "public read game state" on public.game_state;
create policy "public read game state" on public.game_state for select using (true);
drop policy if exists "public read players" on public.players;
create policy "public read players" on public.players for select using (true);

create or replace function public.get_game_state(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r players%rowtype; g game_state%rowtype;
begin
 insert into players(id) values(p_user_id) on conflict do nothing;
 select * into r from players where id=p_user_id;
 select * into g from game_state where id=true;
 update players set online=true,last_seen=now() where id=p_user_id;
 update game_state set online_count=(select count(*) from players where online=true and last_seen>now()-interval '30 seconds') where id=true returning * into g;
 return jsonb_build_object('global',g.global_clicks,'user',r.clicks,'levels',r.levels,'online',g.online_count);
end $$;

create or replace function public.set_presence(p_user_id uuid,p_online boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 insert into players(id,online,last_seen) values(p_user_id,p_online,now())
 on conflict(id) do update set online=p_online,last_seen=now();
 update game_state set online_count=(select count(*) from players where online=true and last_seen>now()-interval '30 seconds'),updated_at=now() where id=true;
end $$;

create or replace function public.perform_click(p_user_id uuid,p_amount numeric)
returns jsonb language plpgsql security definer set search_path=public as $$
declare g numeric; u numeric;
begin
 if p_amount<1 or p_amount>1000000000000000000 then raise exception 'Invalid click amount'; end if;
 insert into players(id) values(p_user_id) on conflict do nothing;
 update game_state set global_clicks=global_clicks+p_amount,updated_at=now() where id=true returning global_clicks into g;
 update players set clicks=clicks+p_amount,last_seen=now(),online=true where id=p_user_id returning clicks into u;
 return jsonb_build_object('global_clicks',g,'user_clicks',u);
end $$;

create or replace function public.buy_upgrade(p_user_id uuid,p_upgrade_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 r players%rowtype; c numeric; l integer; newlevels jsonb; g numeric;
begin
 insert into players(id) values(p_user_id) on conflict do nothing;
 select * into r from players where id=p_user_id for update;
 l=coalesce((r.levels->>p_upgrade_id)::integer,0);
 c=case p_upgrade_id
  when 'finger' then floor(25*power(1.18,l))
  when 'grip' then floor(150*power(1.18,l))
  when 'double' then floor(1000*power(1.18,l))
  when 'turbo' then floor(15000*power(1.18,l))
  when 'overdrive' then floor(250000*power(1.18,l))
  when 'quantum' then floor(5000000*power(1.18,l))
  when 'cosmic' then floor(150000000*power(1.18,l))
  when 'reality' then floor(10000000000*power(1.18,l))
  when 'void' then floor(1000000000000*power(1.18,l))
  when 'infinite' then floor(1000000000000000*power(1.18,l))
  else -1 end;
 if c<0 then raise exception 'Unknown upgrade'; end if;
 if r.clicks<c then raise exception 'Not enough clicks'; end if;
 newlevels=jsonb_set(r.levels,array[p_upgrade_id],to_jsonb(l+1),true);
 update players set clicks=clicks-c,levels=newlevels,last_seen=now() where id=p_user_id;
 select global_clicks into g from game_state where id=true;
 return jsonb_build_object('global_clicks',g,'user_clicks',r.clicks-c,'levels',newlevels);
end $$;

grant execute on function public.get_game_state(uuid) to anon,authenticated;
grant execute on function public.set_presence(uuid,boolean) to anon,authenticated;
grant execute on function public.perform_click(uuid,numeric) to anon,authenticated;
grant execute on function public.buy_upgrade(uuid,text) to anon,authenticated;

-- Realtime: in Supabase Dashboard, enable Realtime for public.game_state.
-- IMPORTANT: for production, keep the write operations above as RPCs and do not
-- expose INSERT/UPDATE/DELETE policies on game_state or players to the browser.
