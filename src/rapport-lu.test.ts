/**
 * LE LECTEUR, ÉPROUVÉ CONTRE LES QUATRE FORMATS — des rapports factices MINIMAUX, modelés
 * sur ce que les writers des dépôts écrivent vraiment (your-cases.ts du vert, your-alerts.ts
 * du rouge et du bleu, relevés du 8/09), et la convention de famille pour l'améthyste tant
 * que L3 n'a pas livré. Puis la signature : la forme détachée et la forme document, avec
 * une paire Ed25519 engendrée ICI — la vraie clé de la maison n'a rien à faire dans un test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign as signerBrut } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { lireRapport } from "./rapport-lu-lecteur.ts";
import { lireRelevePublic } from "./measure.ts";
import { empreinteDuReleve } from "./empreinte.ts";
import { empreinteDeCle, verifier, verifierDetachee } from "./signature.ts";

const dossier = mkdtempSync(join(tmpdir(), "dossier-lu-"));
test.after(() => rmSync(dossier, { recursive: true, force: true }));

/** Un rapport factice minimal du format réel de chaque outil, scellé ou non. */
function rapportFactice(kind: string, ecarts: Record<string, unknown> = {}, sceller = true): string {
  const r: Record<string, unknown> = {
    kind, version: 1, measuredAt: "2026-09-01T22:00:00.000Z",
    source: { file: "donnees.csv", sha256: "ab".repeat(32), cases: 120 },
    ...ecarts,
  };
  if (sceller) r.empreinte = empreinteDuReleve(r);
  const chemin = join(dossier, `${kind}-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(chemin, JSON.stringify(r));
  return chemin;
}

test("les quatre formats de la suite se lisent, chacun vers son outil", () => {
  const attendus: [string, string][] = [
    ["crusetra-client-record", "routing"],
    ["screening-client-record", "screening"],
    ["monitoring-client-record", "monitoring"],
    /* L3 de l'améthyste n'a pas livré : la convention de famille, remplacée par son message. */
    ["scoring-client-record", "scoring"],
  ];
  assert.equal(attendus.length, 4, "les quatre outils de la suite, un format chacun");
  for (const [kind, outil] of attendus) {
    const r = lireRapport(rapportFactice(kind));
    assert.equal(r.outil, outil);
    assert.equal(r.version, "1");
    assert.equal(r.mesureLe, "2026-09-01", "le JOUR de measuredAt, jamais l'heure");
    assert.equal(r.sceauPorte, r.sceauCalcule, "le sceau recalculé confirme le sceau posé");
    assert.equal(r.sourceSceau, "ab".repeat(32));
    assert.equal(r.relevePublic.sceau, null);
    assert.equal(r.relevePublic.signatureValide, null, "aucun relevé cité : rien à vérifier, jamais « valide »");
    assert.ok(!r.chemin.includes("/"), "le NOM du fichier seulement : un chemin porterait le nom d'utilisateur");
  }
});

test("les refus du lecteur disent quoi corriger, sans citer que le nom du fichier", () => {
  assert.throws(() => lireRapport(join(dossier, "absent.json")), /unreadable file/);
  const pasJson = join(dossier, "pas.json");
  writeFileSync(pasJson, "{coupé");
  assert.throws(() => lireRapport(pasJson), /not readable JSON/);
  const sansKind = join(dossier, "sans-kind.json");
  writeFileSync(sansKind, JSON.stringify({ version: 1 }));
  assert.throws(() => lireRapport(sansKind), /no "kind" field[\s\S]*crusetra-client-record[\s\S]*cascade-client-record/,
    "le refus nomme le kind du vert ET son ancien nom, que le lecteur accepte toujours");
  const horsSuite = join(dossier, "hors.json");
  writeFileSync(horsSuite, JSON.stringify({ kind: "invoicing-client-record" }));
  assert.throws(() => lireRapport(horsSuite), /not a tool of this suite/);
  const prototype = join(dossier, "prototype.json");
  writeFileSync(prototype, JSON.stringify({ kind: "constructor" }));
  assert.throws(() => lireRapport(prototype), /not a tool of this suite/,
    "un nom hérité d'Object.prototype n'est pas un outil de la suite");
});

/* ─── le changement de nom du 5/10/2026 : l'ancien kind du vert se lit à vie ─── */

/** Un rapport du vert DÉJÀ LIVRÉ sous l'ancien kind : copié octet pour octet de
 *  cascade/examples/cord-receipts au commit 2bd9a89 (4/10/2026), scellé et signé par la maison.
 *  L'empreinte des octets prouve que la copie n'a pas été retouchée ; on ne la rescelle jamais. */
const RAPPORT_LIVRE = fileURLToPath(new URL("fixtures/cord-labels-grouped-tesseract-measured.json", import.meta.url));
const OCTETS_DU_RAPPORT_LIVRE = "ccf970ceacd11cee7ecf4baadcee10b5bcdf8ca31ac4995cbb959d77fc0af031";

test("l'ancien kind du vert se lit toujours : un rapport livré, scellé et signé, n'est jamais réécrit", () => {
  const octets = readFileSync(RAPPORT_LIVRE);
  assert.equal(createHash("sha256").update(octets).digest("hex"), OCTETS_DU_RAPPORT_LIVRE,
    "la copie du rapport livré a changé : elle doit rester les octets du dépôt du vert");
  assert.equal(JSON.parse(octets.toString("utf8")).kind, "cascade-client-record");
  const r = lireRapport(RAPPORT_LIVRE);
  assert.equal(r.outil, "routing", "l'ancien kind désigne toujours le vert");
  assert.equal(r.mesureLe, "2026-10-04");
  assert.equal(r.sceauPorte, "1817f176853fc0e9");
  assert.equal(r.sceauCalcule, r.sceauPorte, "le sceau posé avant le changement de nom tient encore");
  const signature = JSON.parse(readFileSync(RAPPORT_LIVRE.replace(/\.json$/, ".signature.json"), "utf8"));
  const cle = readFileSync(fileURLToPath(new URL("../cle-publique.pem", import.meta.url)), "utf8");
  assert.equal(verifierDetachee(r.sceauPorte!, signature, cle).valide, true,
    "la signature de la maison sur ce sceau se vérifie toujours contre cle-publique.pem");

  /* Les deux noms, côte à côte, sur un rapport factice : le même outil, le même sceau. */
  for (const kind of ["cascade-client-record", "crusetra-client-record"]) {
    const lu = lireRapport(rapportFactice(kind));
    assert.equal(lu.outil, "routing", `${kind} doit se lire comme un rapport du vert`);
    assert.equal(lu.sceauPorte, lu.sceauCalcule);
  }

  /* Le relevé PUBLIC du vert porte lui aussi un kind (« cascade-routing-record » dans le relevé
     scellé du 20/08, « crusetra-routing-record » à la prochaine mesure). Le dossier le lit par ses
     marques : les deux noms doivent donner le même jugement, sans qu'aucun soit refusé. */
  for (const kind of ["cascade-routing-record", "crusetra-routing-record"]) {
    const releve: Record<string, unknown> = { kind, version: 1, measuredAt: "2026-08-20T10:40:28.826Z" };
    releve.empreinte = empreinteDuReleve(releve);
    const chemin = join(dossier, `${kind}.json`);
    writeFileSync(chemin, JSON.stringify(releve));
    const lu = lireRelevePublic("routing", chemin);
    assert.equal(lu.mesureLe, "2026-08-20", `${kind} : la date se lit`);
    assert.equal(lu.sceauPorte, lu.sceauCalcule, `${kind} : le sceau tient`);
  }
});

test("une marque absente est un null nommé, jamais deviné", () => {
  const r = lireRapport(rapportFactice("screening-client-record",
    { measuredAt: "pas une date", version: undefined, source: undefined }, false));
  assert.equal(r.mesureLe, null, "une date illisible n'est pas une date");
  assert.equal(r.version, null);
  assert.equal(r.sceauPorte, null);
  assert.equal(r.sourceSceau, null);
  assert.ok(r.sceauCalcule.length === 16, "le sceau se recalcule même sur un rapport qui n'en porte pas");
});

/* ─── la signature : une paire engendrée ici, jamais la clé de la maison ─── */

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pemPublique = publicKey.export({ type: "spki", format: "pem" }) as string;
const signer = (octets: string): string =>
  signerBrut(null, Buffer.from(octets, "utf8"), privateKey).toString("base64");
const blocDe = (message: string) => ({ alg: "Ed25519", cle: empreinteDeCle(pemPublique), valeur: signer(message) });

test("la forme détachée : la signature du sceau cité se vérifie, et chaque refus est nommé", () => {
  const sceau = "0123456789abcdef";
  assert.equal(verifierDetachee(sceau, blocDe(sceau), pemPublique).valide, true);
  assert.equal(verifierDetachee("autre-sceau", blocDe(sceau), pemPublique).valide, false,
    "la signature d'un autre message ne vaut rien ici");
  assert.match(verifierDetachee(sceau, { ...blocDe(sceau), alg: "RSA" }, pemPublique).motif, /only Ed25519/);
  assert.match(verifierDetachee(sceau, { ...blocDe(sceau), extra: 1 } as never, pemPublique).motif, /nothing signs/,
    "une quatrième clé dans le bloc est un canal, refusé avant de le devenir");
  assert.match(verifierDetachee(sceau, { ...blocDe(sceau), cle: "beef".repeat(8) }, pemPublique).motif, /other than the one/);
});

test("un rapport qui cite son relevé public signé passe par la vérification, dans les deux sens", () => {
  const sceau = "feedfacefeedface";
  const bon = lireRapport(rapportFactice("monitoring-client-record",
    { publicRecord: { seal: sceau, signature: blocDe(sceau) } }), pemPublique);
  assert.equal(bon.relevePublic.sceau, sceau);
  assert.equal(bon.relevePublic.signatureValide, true);
  const faux = lireRapport(rapportFactice("monitoring-client-record",
    { publicRecord: { seal: "autre-sceau-cite-", signature: blocDe(sceau) } }), pemPublique);
  assert.equal(faux.relevePublic.signatureValide, false, "un sceau retouché fait mentir la signature");
  const muet = lireRapport(rapportFactice("monitoring-client-record",
    { publicRecord: { seal: sceau } }), pemPublique);
  assert.equal(muet.relevePublic.signatureValide, null, "cité sans signature : rien à vérifier");
});

test("la forme document : le rapport signé entier, et les gardes payées tiennent encore", () => {
  const donnees = '<script type="application/json" id="rapport">{"n":42}</script>';
  const construire = (prefixe: string, suffixe: string): string => {
    const corps = prefixe + donnees + suffixe;
    const bloc = JSON.stringify(blocDe(corps));
    return prefixe + donnees + '<script type="application/json" id="signature">' + bloc + "</script>" + suffixe;
  };
  const authentique = construire("<html>", "</html>");
  assert.equal(verifier(authentique, pemPublique).valide, true);
  /* Un octet ajouté APRÈS le bloc de signature tombe dans le corps signé : refusé. */
  assert.equal(verifier(authentique + "<style>.x{}</style>", pemPublique).valide, false,
    "ce qui suit la signature est signé aussi : le style ajouté a déjà réécrit un chiffre une fois");
  /* Un chiffre changé dans le document : refusé. */
  assert.equal(verifier(authentique.replace('{"n":42}', '{"n":43}'), pemPublique).valide, false);
  const sansBloc = verifier("<html>rien</html>", pemPublique);
  assert.ok(!sansBloc.valide && /not a signed report/.test(sansBloc.motif));
});
