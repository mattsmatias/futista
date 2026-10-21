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

-- 3) Ajastus ja siivous: ks. supabase/push-cron.sql (salaisuudet Supabase Vaultissa, ei tässä tiedostossa).
--    Ajastusta ei oteta käyttöön ennen kuin docs/ilmoitukset.md -ohjeen vaiheet on tehty.
