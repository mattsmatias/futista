# Supabase-avaimen vaihto (omistajan tehtävä)

Tilanne: Vercelissä on ympäristömuuttuja, jonka NIMI on Supabasen secret-avain (sb_secret_…).
Avain on siis näkynyt kaikille, joilla on pääsy Vercel-projektin asetuksiin. Riski poistuu vasta, kun
vanha avain on mitätöity Supabasessa. Koodimuutos ei poista riskiä.

Koodi (tämä haara): `lib/supabase-rest.ts` lähettää secret-avaimen (sb_secret_) vain `apikey`-otsakkeessa
ja vanhan JWT-muotoisen service_role-avaimen sekä `apikey`- että `Authorization: Bearer` -otsakkeessa.
Supabasen ohje: "Send publishable and secret keys on the apikey header only"
(https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).
Avainta käyttää vain `lib/push-server.ts` (ilmoitukset) ja `lib/quota.ts` (kiintiö); molemmat ovat
palvelinkoodia, eikä muuttujalla ole NEXT_PUBLIC_-etuliitettä, joten se ei päädy selaimeen.

Tällä työllä ei ole pääsyä Futistan Supabase-projektiin, joten vaihtoa ei voi tehdä täältä.

## Vaiheet
1. Yhdistä tämä haara mainiin vasta kun kiintiömigraatio on ajettu (docs/kiintio.md).
2. Supabase → Futistan projekti → Project Settings → API Keys → Secret keys → "+ New secret key",
   nimi esim. `vercel-2026-10` → kopioi avain (näytetään kerran).
3. Vercel → futista → Settings → Environment Variables → `SUPABASE_SERVICE_ROLE_KEY` → Edit →
   liitä uusi avain arvoksi (Production ja Preview, tyyppi Sensitive) → Save.
4. Deployments → uusin tuotantojulkaisu → Redeploy.
5. Tarkista: ota sivulla ilmoitukset käyttöön (Suosikit → ilmoitukset) → Vercel → Logs: ei virheitä
   `/api/push/subscribe`-kutsussa; Supabase → Table Editor → `push_subscriptions` saa rivin.
6. Supabase → API Keys → Secret keys → vanha avain → ⋯ → Delete / Revoke.
7. Vercel → Environment Variables → poista muuttuja, jonka nimi alkaa `sb_secret_` (⋯ → Delete).
8. Muuta samalla `VAPID_PRIVATE_KEY` ja `CRON_SECRET` tyypiksi Sensitive (Vercel merkitsee ne
   "readable-secret"): Edit → Sensitive → Save, ja Redeploy.
