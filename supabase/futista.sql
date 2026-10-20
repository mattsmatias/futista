-- Futista: ilmoitusten tietokanta (Supabase → SQL Editor → aja tämä kerran)

-- 1) Tilaukset: yksi rivi per puhelin/selain
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  p256dh     text not null,
  auth       text not null,
  teams      text[] not null default '{}',
  lang       text not null default 'fi',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Jo ilmoitetut asiat, ettei samasta jutusta tule kahta ilmoitusta
create table if not exists public.push_sent (
  key     text primary key,
  sent_at timestamptz not null default now()
);

-- Vain palvelin (service role) pääsee tauluihin
alter table public.push_subscriptions enable row level security;
alter table public.push_sent enable row level security;

-- 3) Ajastus: kutsu Futistan tarkistusta 10 minuutin välein
--    Vaihda alta VERCEL-OSOITE ja CRON_SECRET (sama arvo kuin Vercelissä).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'futista-ilmoitukset',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := 'https://VERCEL-OSOITE.vercel.app/api/push/check',
    headers := jsonb_build_object('Authorization', 'Bearer CRON_SECRET')
  );
  $$
);

-- 4) Siivous: vanhat lähetysmerkinnät pois kerran päivässä
select cron.schedule(
  'futista-siivous',
  '15 4 * * *',
  $$ delete from public.push_sent where sent_at < now() - interval '14 days'; $$
);
