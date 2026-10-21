-- Futista: uutisten "Piditkö tästä uutisesta?" -reaktiot (peukku ylös / alas).
-- Aja kerran: Supabase → SQL Editor → tämä tiedosto. Lisää vain uuden taulun ja funktion; ei muuta olemassa olevia.
--
-- Toiminta
--  * Tallennetaan VAIN jutun yhteissummat (ylös, alas). Ei käyttäjä-, laite- eikä IP-tietoja.
--  * Selain muistaa oman äänensä omassa muistissaan; palvelin välittää muutoksen (edellinen → uusi ääni),
--    jolloin äänen voi vaihtaa tai perua. Summat eivät voi mennä alle nollan.
--  * Taulu ja funktio vain palvelimen secret / service_role -avaimelle (RLS päällä, ei käytäntöjä anonille).
--  * SECURITY DEFINER -funktiossa tyhjä search_path ja täysin nimetyt objektit.
--  * Idempotentti: ajettavissa uudelleen.
--  * Poisto (tarvittaessa): drop function public.news_react(text, smallint, smallint); drop table public.news_reactions;

create table if not exists public.news_reactions (
  article    text primary key check (char_length(article) between 1 and 300),
  up         integer not null default 0 check (up >= 0),
  down       integer not null default 0 check (down >= 0),
  updated_at timestamptz not null default now()
);

alter table public.news_reactions enable row level security;
revoke all on public.news_reactions from anon, authenticated;

-- Muuttaa yhden jutun summia: p_prev = aiempi ääni (-1, 0, 1), p_next = uusi ääni (-1, 0, 1).
-- Palauttaa {"up": n, "down": n}.
create or replace function public.news_react(p_article text, p_prev smallint, p_next smallint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_up int; v_down int;
begin
  if p_article is null or char_length(p_article) < 1 or char_length(p_article) > 300
     or p_prev not in (-1, 0, 1) or p_next not in (-1, 0, 1) then
    raise exception 'invalid reaction arguments';
  end if;
  insert into public.news_reactions as r (article, up, down)
    values (p_article, greatest(0, (p_next = 1)::int), greatest(0, (p_next = -1)::int))
  on conflict (article) do update set
    up   = greatest(0, r.up   - (p_prev = 1)::int  + (p_next = 1)::int),
    down = greatest(0, r.down - (p_prev = -1)::int + (p_next = -1)::int),
    updated_at = now()
  returning r.up, r.down into v_up, v_down;
  return jsonb_build_object('up', v_up, 'down', v_down);
end;
$$;

revoke all on function public.news_react(text, smallint, smallint) from public, anon, authenticated;
grant execute on function public.news_react(text, smallint, smallint) to service_role;
grant select, insert, update on public.news_reactions to service_role;
