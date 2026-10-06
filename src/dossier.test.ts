/**
 * Le dossier, éprouvé contre un REGISTRE FACTICE de cinq contrôles et un lecteur factice :
 * les vrais appartiennent au lot D1. Les contrôles factices jugent les MARQUES de
 * RapportLu selon la sémantique du contrat, assez pour éprouver l'assemblage : l'état
 * sans trou, les comptes d'en-tête, les doublons, et « jamais une valeur ».
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assembler, etatAtteint, executer, rendreDossier } from "./dossier.ts";
import { reglagesAvec } from "./assumptions.ts";
import { fraicheur, type Registre, type Controle, type Reglages, type Verdict } from "./controle.ts";
import type { RapportLu } from "./rapport-lu.ts";
import { scelleIntact } from "./empreinte.ts";
import { mesurePublique } from "./measure.ts";

export function registreFactice(sans: string[] = []): Registre {
  const controles: Controle[] = [
    { id: "present", rang: 1, description: "fake", juger: (r) => ({ controle: "present", tenu: r.chemin !== "", detail: "a report file exists, or does not" }) },
    { id: "sealed", rang: 2, description: "fake", juger: (r) => ({ controle: "sealed", tenu: r.sceauPorte !== null && r.sceauPorte === r.sceauCalcule, detail: "the carried seal must match the recomputed one" }) },
    { id: "signed", rang: 3, description: "fake", juger: (r) => ({ controle: "signed", tenu: r.relevePublic.signatureValide === true, detail: "a signature verified against the public key" }) },
    { id: "fresh", rang: 4, description: "fake", juger: (r, _t, g) => ({ controle: "fresh", tenu: r.mesureLe !== null && fraicheur(r.mesureLe, g) === "fresh", detail: "measured within one rhythm of the reference day" }) },
    { id: "consistent", rang: 5, description: "fake", juger: () => ({ controle: "consistent", tenu: true, detail: "consistent with the other reports" }) },
  ];
  return new Map(controles.filter((c) => !sans.includes(c.id)).map((c) => [c.id, c]));
}

export function rapportFactice(sur: Partial<RapportLu> = {}): RapportLu {
  return {
    chemin: "r-measured.json", outil: "screening", version: "1",
    mesureLe: "2026-09-01", sceauPorte: "abcd", sceauCalcule: "abcd",
    relevePublic: { sceau: "abcd", signatureValide: true },
    sourceSceau: "s1", regle: "lower bound then fewest false alerts",
    ...sur,
  };
}

const REGLAGES: Reglages = { rythmeJours: 90, staleApres: 2, auJour: "2026-09-08" };

/* ─── l'état sans trou ─── */

test("l'état atteint est le plus haut contrôle tenu SANS TROU : signé mais non scellé = present", () => {
  const r = registreFactice();
  const casse = rapportFactice({ sceauPorte: "abcd", sceauCalcule: "autre" });   /* sealed casse, signed tiendrait */
  const verdicts = [...r.values()].map((c) => c.juger(casse, [casse], REGLAGES));
  assert.equal(etatAtteint(verdicts, r), "present",
    "un maillon sauté n'existe pas : la chaîne se tient par le plus bas");
  const sain = rapportFactice();
  const v2 = [...r.values()].map((c) => c.juger(sain, [sain], REGLAGES));
  assert.equal(etatAtteint(v2, r), "consistent");
  const jamais = rapportFactice({ chemin: "" });
  const v3 = [...r.values()].map((c) => c.juger(jamais, [jamais], REGLAGES));
  assert.equal(etatAtteint(v3, r), "none");
});

/* ─── l'assemblage ─── */

test("l'en-tête compte ce que le relecteur lit en premier, et les doublons sont refusés", () => {
  const r = registreFactice();
  const d = assembler([
    rapportFactice(),
    rapportFactice({ outil: "routing", chemin: "v.json", sceauPorte: null, sourceSceau: "s2",
      relevePublic: { sceau: null, signatureValide: null } }),
  ], r, REGLAGES);
  assert.deepEqual(d.couverture, { n: 2, sur: 4 });
  assert.deepEqual(d.sceauxValides, { n: 1, sur: 2 });
  assert.deepEqual(d.signaturesVerifiees, { n: 1, sur: 1 }, "une signature absente n'entre pas au dénominateur");
  assert.equal(d.controlesAbsents.length, 0);
  /* le doublon : même outil, même jeu de données */
  assert.throws(() => assembler([rapportFactice(), rapportFactice({ chemin: "autre.json" })], r, REGLAGES),
    /same question on the same data set/);
  /* même outil, AUTRE jeu : légitime */
  assert.doesNotThrow(() => assembler([rapportFactice(), rapportFactice({ chemin: "b.json", sourceSceau: "s9" })], r, REGLAGES));
  assert.throws(() => assembler([], r, REGLAGES), /No report was given/);
});

test("un registre amputé rend des contrôles absents DÉRIVÉS, et l'état s'arrête au trou", () => {
  const r = registreFactice(["signed"]);
  const d = assembler([rapportFactice()], r, REGLAGES);
  assert.deepEqual(d.controlesAbsents, ["signed"]);
  assert.equal(d.questions[0]!.etat, "sealed", "sans le contrôle signed, la chaîne jugée s'arrête à sealed puis saute");
});

/* ─── les réglages ─── */

test("--validity et --as-of se lisent strictement, et le défaut du jour est ÉCRIT", () => {
  const g = reglagesAvec("30", "2026-09-08");
  assert.deepEqual([g.rythmeJours, g.auJour, g.staleApres], [30, "2026-09-08", 2]);
  for (const brut of ["", "0", "abc", "-3", "9.5"]) {
    assert.throws(() => reglagesAvec(brut, undefined), /not a validity period/);
  }
  assert.throws(() => reglagesAvec(undefined, "08/09/2026"), /not a day/);
  assert.equal(reglagesAvec(undefined, undefined, "2026-09-08").auJour, "2026-09-08");
});

test("l'ancien nom du drapeau se refuse en nommant le nouveau", () => {
  /*
   * `--rhythm` a été renommé `--validity` le 13 septembre 2026 : VOIX.md range « rhythm » dans
   * le jargon interne, et cascade-routing a pris le même mot le même jour, pour que le lecteur
   * qui a appris un outil ait appris l'autre. Le refus nomme le nouveau nom et réécrit la
   * commande ; sans ce cas, il suffirait de retirer `--rhythm` des drapeaux connus pour rendre
   * le refus muet et laisser un acheteur chercher.
   */
  /* La commande imprime d'abord l'horloge d'évaluation, qui écrit son marqueur dans le dossier
     personnel : un dossier fabriqué, pour que la suite ne démarre jamais l'horloge du poste. */
  const maison = mkdtempSync(join(tmpdir(), "dossier-maison-"));
  const r = spawnSync(process.execPath, [
    fileURLToPath(new URL("./dossier.ts", import.meta.url)),
    "--reports=x.json", "--rhythm=90",
  ], { encoding: "utf8", env: { ...process.env, HOME: maison, USERPROFILE: maison } });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /--rhythm was renamed --validity/, "le refus ne dit pas le nouveau nom");
  assert.match(r.stderr, /--validity=90/, "le refus ne réécrit pas la commande pour le lecteur");
});

/* ─── never a value, avec témoin ─── */

test("le dossier ne porte AUCUNE valeur du rapport source, et le détecteur sait voir", () => {
  const SENTINELLES = ["MONTANT-424242", "CLIENT-SENTINELLE", "97.3"];
  const d = mkdtempSync(join(tmpdir(), "dossier-"));
  /* un rapport TRUFFÉ de sentinelles : le lecteur factice n'en extrait que les marques,
     comme le contrat l'exige du vrai lecteur de D1 */
  const cheminRapport = join(d, "r-measured.json");
  writeFileSync(cheminRapport, JSON.stringify({
    tool: "screening", grille: { montant: SENTINELLES[0], client: SENTINELLES[1], taux: SENTINELLES[2] },
    measuredAt: "2026-09-01", empreinte: "abcd",
  }));
  const lecteurFactice = (chemin: string): RapportLu => rapportFactice({ chemin });
  const { cheminMd, cheminJson, dossier } = executer([cheminRapport], lecteurFactice, registreFactice(), REGLAGES, d);
  for (const fichier of [cheminMd, cheminJson]) {
    const emis = readFileSync(fichier, "utf8");
    for (const s of SENTINELLES) {
      assert.ok(!emis.includes(s),
        `« ${s} » sort du rapport source vers ${fichier} : « jamais une valeur » vient de devenir faux.`);
    }
    assert.ok(!emis.includes(d), "le chemin absolu ne sort pas non plus : basename seul");
  }
  assert.ok(JSON.stringify({ fuite: SENTINELLES[0] }).includes(SENTINELLES[0]!));
  assert.ok(scelleIntact(JSON.parse(readFileSync(cheminJson, "utf8"))), "le dossier émis est scellé");
  assert.match(rendreDossier(dossier), /held/);
});

/* ─── la mesure publique ─── */

test("le registre plein mesure : la question de la suite absente de la machine est dite present:false", () => {
  /* Récrit À LA FUSION DE D1 (lot Mesure, avec le rapport qui l'annonce à Portfolio) : le
     registre réel porte les cinq contrôles, le refus « registry is empty » ne peut plus se
     déclencher par lui — l'ancienne assertion figeait l'état transitoire (le mauvais rouge,
     leçon du lot E). La ligne du refus reste dans measure.ts, éprouvée par mutation. */
  const m = mesurePublique(REGLAGES);
  assert.equal(m.controles.presents.length, 5, "les cinq contrôles du contrat sont présents");
  assert.equal(m.controles.absents.length, 0, "cinq contrôles présents : aucun absent dérivé");
  assert.equal(m.couverture.sur, 4, "les quatre questions de la suite, comptées même absentes");
});
