-- Futista: ilmoitusten ajastus (Supabase pg_cron + pg_net). ÄLÄ tallenna salaisuuksia tähän tiedostoon.
-- Käyttöönotto: docs/ilmoitukset.md. Edellyttää, että supabase/futista.sql on ajettu.
--
-- Vaihe A (kerran, SQL Editorissa – EI versionhallintaan): tallenna salaisuudet Supabase Vaultiin
--   select vault.create_secret('<sama arvo kuin Vercelin CRON_SECRET>', 'futista_cron_secret');
--   select vault.create_secret('https://futista.fi/api/push/check', 'futista_check_url');
-- Vaihe B: aja tämä tiedosto.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Poistetaan mahdollinen vanha samanniminen ajastus (esim. paikkamerkeillä luotu)
select cron.unschedule(jobid) from cron.job where jobname in ('futista-ilmoitukset', 'futista-siivous');

-- Tarkistus 10 min välein. Osoite ja salaisuus luetaan Vaultista ajon hetkellä.
select cron.schedule(
  'futista-ilmoitukset',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'futista_check_url'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'futista_cron_secret')),
    timeout_milliseconds := 55000
  );
  $$
);

-- Siivous: vanhat lähetysmerkinnät pois kerran päivässä
select cron.schedule(
  'futista-siivous',
  '15 4 * * *',
  $$ delete from public.push_sent where sent_at < now() - interval '14 days'; $$
);

-- Pysäytys tarvittaessa:
--   select cron.unschedule('futista-ilmoitukset');
