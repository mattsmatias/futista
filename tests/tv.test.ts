import { test } from "node:test";
import assert from "node:assert/strict";
import { tvFor } from "../lib/tv";

test("lähetys Suomessa: varmistetut sarjat, Huuhkajat Yleltä, muille ei mitään", () => {
  assert.equal(tvFor("valioliiga", "Arsenal", "Chelsea")?.name, "Viaplay");
  assert.equal(tvFor("laliga", "Barcelona", "Real Madrid")?.name, "Disney+");
  assert.equal(tvFor("seriea", "Lazio", "Roma")?.name, "MTV Katsomo");
  assert.equal(tvFor("ucl", "a", "b")?.name, "MTV Katsomo");
  assert.equal(tvFor("veikkausliiga", "HJK Helsinki", "KuPS")?.name, "Ruutu+");
  assert.equal(tvFor("mls", "LAFC", "LA Galaxy")?.name, "Apple TV");
  assert.equal(tvFor("kansojenliiga", "Finland", "Greece")?.name, "Yle");
  assert.equal(tvFor("kansojenliiga", "Spain", "Italy")?.name, "MTV Katsomo");
  assert.equal(tvFor("liigacup", "Arsenal", "Fleetwood")?.name, "Viaplay");
  assert.equal(tvFor("eredivisie", "Ajax", "PSV"), null); // ei varmistettua tietoa → ei keksitä
  assert.equal(tvFor("superlig", "Galatasaray", "Fenerbahce"), null);
});
