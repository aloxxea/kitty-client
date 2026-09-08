-- ============================================================
-- Kitty Client — схема базы данных Supabase
-- Вставь этот код в SQL Editor (Supabase Dashboard -> SQL -> New query)
-- ============================================================

-- Расширение для генерации UUID
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Тип роли
-- ------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('owner', 'coder', 'media', 'user');
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------
-- Профили пользователей (связано с auth.users)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique references auth.users(id) on delete cascade,
  login text unique not null,
  email text unique not null,
  role public.user_role not null default 'user',
  banned boolean not null default false,
  tier text not null default 'free',
  key_used text,
  activated_at timestamptz not null default now(),
  expires_at text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Таблица демо-ключей
-- ------------------------------------------------------------
create table if not exists public.keys (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  tier text not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- История использования ключей
-- ------------------------------------------------------------
create table if not exists public.used_keys (
  id uuid primary key default gen_random_uuid(),
  key_code text not null,
  used_by uuid references public.profiles(id) on delete cascade,
  used_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Демо-ключи
-- ------------------------------------------------------------
insert into public.keys (code, tier) values
  ('KITTY-2026-PREMIUM-0001', 'quarter'),
  ('KITTY-2026-PREMIUM-0002', 'quarter'),
  ('KITTY-2026-PREMIUM-0003', 'quarter'),
  ('KITTY-2026-BASIC-0001', 'month'),
  ('KITTY-2026-BASIC-0002', 'month'),
  ('KITTY-2026-BASIC-0003', 'month'),
  ('KITTY-FREE-TEST-0001', 'demo')
on conflict (code) do nothing;

-- ============================================================
-- RLS (Row Level Security) — права доступа
-- ============================================================
alter table public.profiles enable row level security;
alter table public.keys enable row level security;
alter table public.used_keys enable row level security;

-- Юзер может читать свой профиль
create policy "read own profile" on public.profiles
  for select using (auth.uid() = auth_id);

-- Юзер может обновлять свой профиль вручную, но т.к. это можно
-- использовать для эскалации прав (роль/бан), обновления делаем
-- только через SECURITY DEFINER функции. Прямое обновление отключаем.
-- (политика update НЕ создаётся намеренно)

-- Разрешить юзеру создавать свой профиль при регистрации
-- (auth_id должен совпадать с текущим пользователем)
create policy "insert own profile" on public.profiles
  for insert with check (auth_id = auth.uid());

-- Ключи видит любой залогиненный (для проверки)
create policy "read keys" on public.keys
  for select using (auth.role() = 'authenticated');

-- Админ-функции (только для овнера и кодера)
-- Эти RLS-политики позволяют админке читать всех: админка вызывает
-- SECURITY DEFINER функции, которые проверим в самом коде.

-- ------------------------------------------------------------
-- Функция: выдать/снять роль (по login)
-- ------------------------------------------------------------
create or replace function public.admin_set_role(target_login text, new_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  select p.role::text into caller_role from public.profiles p where p.auth_id = auth.uid();
  if caller_role not in ('owner', 'coder') then
    raise exception 'Нет доступа';
  end if;
  -- выдавать роль owner может только owner
  if new_role = 'owner' and caller_role <> 'owner' then
    raise exception 'Только овнер может выдавать роль овнер';
  end if;
  update public.profiles set role = new_role where login = target_login;
end;
$$;

-- ------------------------------------------------------------
-- Функция: выдать/снять подписку (по login)
-- ------------------------------------------------------------
create or replace function public.admin_set_tier(target_login text, new_tier text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  select p.role::text into caller_role from public.profiles p where p.auth_id = auth.uid();
  if caller_role not in ('owner', 'coder') then
    raise exception 'Нет доступа';
  end if;
  update public.profiles set tier = new_tier, expires_at = case
    when new_tier = 'free' then null
    when new_tier = 'lifetime' then 'lifetime'
    else to_char(now() + interval '30 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  end where login = target_login;
end;
$$;

-- ------------------------------------------------------------
-- Функция: бан / разбан (по login)
-- ------------------------------------------------------------
create or replace function public.admin_set_ban(target_login text, do_ban boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  select p.role::text into caller_role from public.profiles p where p.auth_id = auth.uid();
  if caller_role not in ('owner', 'coder') then
    raise exception 'Нет доступа';
  end if;
  -- только овнер может банить администрацию
  if caller_role <> 'owner' then
    if exists (select 1 from public.profiles p where p.login = target_login and p.role in ('owner','coder')) then
      raise exception 'Только овнер может управлять администрацией';
    end if;
  end if;
  update public.profiles set banned = do_ban where login = target_login;
end;
$$;

-- ------------------------------------------------------------
-- Функция: удалить пользователя (по login)
-- ------------------------------------------------------------
create or replace function public.admin_delete_user(target_login text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  target_auth uuid;
begin
  select p.role::text into caller_role from public.profiles p where p.auth_id = auth.uid();
  if caller_role not in ('owner', 'coder') then
    raise exception 'Нет доступа';
  end if;
  if caller_role <> 'owner' then
    if exists (select 1 from public.profiles p where p.login = target_login and p.role in ('owner','coder')) then
      raise exception 'Только овнер может удалять администрацию';
    end if;
  end if;
  select p.auth_id into target_auth from public.profiles p where p.login = target_login;
  delete from public.profiles where login = target_login;
  -- удаление auth-записи (если профиль был создан из auth)
  if target_auth is not null then
    delete from auth.users where id = target_auth;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Функция: список всех пользователей для админки
-- (SECURITY DEFINER, но проверяет роль вызывающего)
-- ------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (id uuid, login text, email text, role public.user_role, banned boolean, tier text, key_used text, activated_at timestamptz, expires_at text)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  select p.role::text into caller_role from public.profiles p where p.auth_id = auth.uid();
  if caller_role not in ('owner', 'coder') then
    raise exception 'Нет доступа';
  end if;
  return query select p.id, p.login, p.email, p.role, p.banned, p.tier, p.key_used, p.activated_at, p.expires_at
    from public.profiles p order by p.role desc, p.created_at asc;
end;
$$;

-- Предоставить права на выполнение функций
grant execute on function public.admin_set_role(text, public.user_role) to authenticated;
grant execute on function public.admin_set_tier(text, text) to authenticated;
grant execute on function public.admin_set_ban(text, boolean) to authenticated;
grant execute on function public.admin_delete_user(text) to authenticated;
grant execute on function public.admin_list_users() to authenticated;

-- Права на чтение ключей
grant select on public.keys to authenticated;

-- ------------------------------------------------------------
-- Функция: активация ключа (проверка одноразовости + выдача подписки)
-- ------------------------------------------------------------
create or replace function public.activate_key(p_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_expires text;
  v_profile_id uuid;
  v_cur_tier text;
begin
  -- профиль текущего пользователя
  select id, tier into v_profile_id, v_cur_tier
    from public.profiles where auth_id = auth.uid();
  if v_profile_id is null then
    return 'ERROR_NO_PROFILE';
  end if;
  if v_cur_tier is not null and v_cur_tier <> 'free' then
    return 'ERROR_ALREADY_PAID';
  end if;

  -- проверяем ключ существует
  select tier into v_tier from public.keys where code = p_key;
  if v_tier is null then
    return 'ERROR_INVALID';
  end if;

  -- проверяем одноразовость
  if exists (select 1 from public.used_keys where key_code = p_key) then
    return 'ERROR_USED';
  end if;

  -- вычисляем срок
  if v_tier = 'lifetime' then
    v_expires := 'lifetime';
  else
    select to_char(now() + interval '30 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') into v_expires;
  end if;

  -- выдаём подписку
  update public.profiles set tier = v_tier, key_used = p_key, expires_at = v_expires
    where id = v_profile_id;

  -- записываем использование
  insert into public.used_keys (key_code, used_by) values (p_key, v_profile_id);

  return 'OK';
end;
$$;

grant execute on function public.activate_key(text) to authenticated;

-- ------------------------------------------------------------
-- Правда ли, что в системе ещё нет ни одного овнера
-- (SECURITY DEFINER: нужно для назначения роли при регистрации,
--  обычный count с RLS показывал бы только свои строки, т.е. 0)
-- ------------------------------------------------------------
create or replace function public.is_first_user()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return not exists (select 1 from public.profiles where role = 'owner');
end;
$$;
grant execute on function public.is_first_user() to authenticated;

-- ------------------------------------------------------------
-- Покупка подписки (эмуляция) — выдаёт тариф сроками
-- Используется SECURITY DEFINER, чтобы исключить самовольное
-- изменение роли/тарифа прямым SQL от клиента.
-- ------------------------------------------------------------
create or replace function public.buy_tier(p_tier text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expires text;
  v_cur_tier text;
begin
  select tier into v_cur_tier from public.profiles where auth_id = auth.uid();
  if v_cur_tier is not null and v_cur_tier <> 'free' then
    return 'ERROR_ALREADY_PAID';
  end if;
  if p_tier = 'free' then
    update public.profiles set tier = 'free', expires_at = null where auth_id = auth.uid();
    return 'OK';
  end if;
  v_expires := 'lifetime';
  if p_tier <> 'lifetime' then
    select to_char(now() + interval '30 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') into v_expires;
  end if;
  update public.profiles set tier = p_tier, expires_at = v_expires where auth_id = auth.uid();
  return 'OK';
end;
$$;
grant execute on function public.buy_tier(text) to authenticated;

