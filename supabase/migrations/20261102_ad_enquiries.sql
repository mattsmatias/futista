-- Futista: Mainosta-sivun yhteydenottopyynnöt hallintapaneeliin (/hallinta). Idempotentti; ei muuta muita tauluja.
-- Tallennetaan lomakkeen tiedot (nimi, yritys, sähköposti, viesti), tila (uusi / käsitelty) ja tieto sähköpostin lähetyksestä.
-- Ei IP-osoitetta. Rivit poistetaan automaattisesti 12 kuukauden jälkeen; ylläpito voi poistaa yksittäisen pyynnön heti.
-- Vain palvelin (service_role) pääsee tauluun; hallintapaneelin rajapinta tarkistaa ylläpitäjän.

create table if not exists public.ad_enquiries (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  request_id text check (request_id ~ '^[a-zA-Z0-9-]{8,64}$'),
  name       text not null check (char_length(name) between 2 and 100),
  company    text not null default '' check (char_length(company) <= 120),
  email      text not null check (char_length(email) between 6 and 254),
  message    text not null check (char_length(message) between 10 and 3000),
  mailed     boolean not null default false,
  status     text not null default 'new' check (status in ('new', 'done'))
);
create unique index if not exists ad_enquiries_req on public.ad_enquiries (request_id) where request_id is not null;
create index if not exists ad_enquiries_created on public.ad_enquiries (created_at desc);
alter table public.ad_enquiries enable row level security;
revoke all on table public.ad_enquiries from public, anon, authenticated;
grant select, insert, update, delete on public.ad_enquiries to service_role;

-- Uusi pyyntö (sama request_id uudelleen → sama rivi, ei kaksoiskappaletta)
create or replace function public.s_enquiry_add(p_request text, p_name text, p_company text, p_email text, p_message text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_new boolean := true;
begin
  if p_request is not null then
    select id into v_id from public.ad_enquiries where request_id = p_request;
    if v_id is not null then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  end if;
  insert into public.ad_enquiries (request_id, name, company, email, message) values (p_request, p_name, coalesce(p_company, ''), p_email, p_message)
  on conflict (request_id) where request_id is not null do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.ad_enquiries where request_id = p_request; v_new := false; end if;
  delete from public.ad_enquiries where created_at < now() - interval '12 months';
  return jsonb_build_object('id', v_id, 'duplicate', not v_new);
end $$;

create or replace function public.s_enquiry_mailed(p_id bigint) returns jsonb
language sql security definer set search_path = '' as $$
  update public.ad_enquiries set mailed = true where id = p_id returning jsonb_build_object('ok', true)
$$;

create or replace function public.s_enquiries(p_limit integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'new', (select count(*) from public.ad_enquiries where status = 'new'),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'at', created_at, 'name', name, 'company', company, 'email', email,
              'message', message, 'mailed', mailed, 'status', status) order by created_at desc)
              from (select * from public.ad_enquiries order by created_at desc limit greatest(1, least(p_limit, 200))) x), '[]'::jsonb))
$$;

create or replace function public.s_enquiry_set(p_id bigint, p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_action = 'delete' then delete from public.ad_enquiries where id = p_id;
  elsif p_action in ('new', 'done') then update public.ad_enquiries set status = p_action where id = p_id;
  else return jsonb_build_object('error', 'action'); end if;
  if not found then return jsonb_build_object('error', 'notfound'); end if;
  return jsonb_build_object('ok', true);
end $$;

do $$ declare f text; begin
  foreach f in array array['s_enquiry_add(text,text,text,text,text)','s_enquiry_mailed(bigint)','s_enquiries(integer)','s_enquiry_set(bigint,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
