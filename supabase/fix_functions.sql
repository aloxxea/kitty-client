-- ============================================================
-- Исправление: устраняет "column reference role is ambiguous"
-- в админ-функциях. Запусти этот файл в SQL Editor (Run).
-- Содержит ТОЛЬКО функции (create or replace) — безопасно
-- пересоздаёт их без ошибок про политики.
-- ============================================================

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
  if new_role = 'owner' and caller_role <> 'owner' then
    raise exception 'Только овнер может выдавать роль овнер';
  end if;
  update public.profiles set role = new_role where login = target_login;
end;
$$;

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
  if caller_role <> 'owner' then
    if exists (select 1 from public.profiles p where p.login = target_login and p.role in ('owner','coder')) then
      raise exception 'Только овнер может управлять администрацией';
    end if;
  end if;
  update public.profiles set banned = do_ban where login = target_login;
end;
$$;

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
  if target_auth is not null then
    delete from auth.users where id = target_auth;
  end if;
end;
$$;

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
