-- Futista: ottelujen kohokohtavideot (virallisten YouTube-kanavien syötteistä kerätyt videot).
-- Aja kerran: Supabase → SQL Editor → tämä tiedosto. Lisää vain uuden taulun ja ajastuksen; ei muuta olemassa olevia.
-- Ilman tätä tiedostoa koosteet toimivat silti, mutta vain niin kauan kuin video on kanavan syötteessä (15 uusinta).
--
--  * Taulu vain palvelimen secret / service_role -avaimelle (RLS päällä, ei käytäntöjä anonille). Ei käyttäjätietoja.
--  * Ajastus kutsuu /api/kohokohdat/keraa 20 min välein. Salaisuus luetaan Vaultista ('futista_cron_secret',
--    sama kuin ilmoituksissa, docs/ilmoitukset.md). Salaisuutta EI tallenneta tähän tiedostoon.
--  * Idempotentti: ajettavissa uudelleen.
--  * Poisto: select cron.unschedule('futista-kohokohdat'); select cron.unschedule('futista-kohokohdat-siivous'); drop table public.yt_videos;

create table if not exists public.yt_videos (
  video_id     text primary key check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  channel_id   text not null check (channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  title        text not null check (char_length(title) between 1 and 300),
  published_at timestamptz not null,
  seen_at      timestamptz not null default now()
);
create index if not exists yt_videos_channel_published on public.yt_videos (channel_id, published_at);

alter table public.yt_videos enable row level security;
revoke all on public.yt_videos from anon, authenticated;
grant select, insert, update, delete on public.yt_videos to service_role;

-- AJASTUS (Supabase pg_cron + pg_net; paikallinen testi ajaa vain yllä olevan taulun)
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname in ('futista-kohokohdat', 'futista-kohokohdat-siivous');

select cron.schedule(
  'futista-kohokohdat',
  '7,27,47 * * * *',
  $$
  select net.http_get(
    url := 'https://www.futista.fi/api/kohokohdat/keraa',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'futista_cron_secret')),
    timeout_milliseconds := 55000
  );
  $$
);

-- vanhat videot pois kerran päivässä (koosteita haetaan enintään 5 vrk ottelun jälkeen; löytynyt muistetaan erikseen)
select cron.schedule(
  'futista-kohokohdat-siivous',
  '25 4 * * *',
  $$ delete from public.yt_videos where published_at < now() - interval '60 days'; $$
);
