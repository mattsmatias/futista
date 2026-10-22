-- Livekatsomon ajastukset (aja migraation 20261022_livekatsomo.sql jälkeen, Supabase → SQL Editor).
-- Edellyttää pg_cron-laajennuksen (Database → Extensions → pg_cron). Ei käytä CRON_SECRET-arvoa eikä
-- HTTP-kutsuja: funktiot ajetaan suoraan tietokannassa. Ajettavissa uudelleen (sama nimi korvaa ajastuksen).
create extension if not exists pg_cron;

-- Realtime-kooste 2 s välein: lähettää väliin jääneet viestit, poistot ja huoneen tilamuutokset
-- (avautuminen/sulkeutuminen ajan mukaan). Ilman tätä viimeinen viesti voi viipyä seuraavaan lähetykseen asti.
select cron.schedule('livekatsomo-kooste', '2 seconds', $$select public.lk_flush_all()$$);

-- Säilytysajan poisto tunnin välein
select cron.schedule('livekatsomo-poisto', '17 * * * *', $$select public.lk_purge()$$);

-- Tarkistus:
--   select jobname, schedule, active from cron.job where jobname like 'livekatsomo%';
--   select status, start_time from cron.job_run_details where jobid in (select jobid from cron.job where jobname like 'livekatsomo%') order by start_time desc limit 5;
--   select last_flush_at, last_purge_at from public.lk_settings;     -- myös ylläpitonäkymässä
-- Pysäytys: select cron.unschedule('livekatsomo-kooste'); select cron.unschedule('livekatsomo-poisto');
-- Huom. cron.job_run_details kasvaa 2 s ajastuksesta (~43 000 riviä/vrk). Siivous:
select cron.schedule('livekatsomo-cron-siivous', '43 3 * * *', $$delete from cron.job_run_details where end_time < now() - interval '2 days'$$);
