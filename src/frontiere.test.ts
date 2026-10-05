/* PARTAGÉ DANS LA FAMILLE CASCADE — source : cascade-monitoring
   Les dépôts de la famille (cascade, -screening, -monitoring, -scoring, -dossier) en portent
   une copie identique AU BYTE. Corrigez-le dans la source, puis recopiez : la famille est
   EXCLUE de la diffusion d'identite (depots.json), aucune diffusion ne viendra le faire à
   votre place. `couche-famille.test.ts` compare les octets, nomme la direction du retard, et
   refuse aussi un fichier identique dans deux dépôts qui ne porte PAS cet en-tête — c'est
   ainsi qu'une copie neuve se déclare au lieu de dériver en silence. Si une divergence
   devient VOULUE dans un dépôt, retirez-y cet en-tête : la copie quitte le groupe. */
/**
 * LA FRONTIÈRE RÉSEAU DE CET OUTIL, TENUE PAR UN TEST ET PAS PAR UNE PHRASE.
 *
 * La promesse du README : « nothing of yours goes up ». Dans CET outil, AUCUN fichier n'a
 * le droit de toucher le réseau : il n'y a ni liste à descendre ni poids à tirer. Tout site
 * d'envoi fait tomber ce cas AVANT qu'un client l'exécute. Le jour où un téléchargeur
 * légitime arrive, il entre dans AUTORISES avec sa raison, et le test qui suit exige qu'il
 * lise CRUSETRA_OFFLINE et son ancien nom CASCADE_OFFLINE, gardé comme alias.
 *
 * Le détecteur porte son témoin : s'il ne voyait plus un `fetch(` planté dans une chaîne,
 * le zéro qu'il rend ne prouverait rien.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, sep } from "node:path";

const dossier = fileURLToPath(new URL(".", import.meta.url));

/** Les seuls fichiers autorisés à toucher le réseau, et pourquoi. */
const AUTORISES: Record<string, string> = {
  /* personne : cet outil ne télécharge rien */
};

const MOTIF = /\bfetch\s*\(|from\s+"node:(?:http|https|net|dns|tls|dgram|http2)"|from\s+"undici"|require\(\s*"(?:node:)?(?:http|https|net|dns|tls)"\s*\)|new\s+WebSocket\s*\(/g;

/** Les numéros de ligne où un module touche le réseau. */
export function sitesReseau(src: string): number[] {
  const lignes: number[] = [];
  for (const m of src.matchAll(MOTIF)) lignes.push(src.slice(0, m.index!).split("\n").length);
  return lignes;
}

test("le détecteur voit un site réseau planté : témoin positif", () => {
  assert.deepEqual(sitesReseau(`const x = 1;\nconst r = await fetch("https://a.example");`), [2]);
  assert.deepEqual(sitesReseau(`import { request } from "node:https";`), [1]);
  assert.deepEqual(sitesReseau(`const ws = new WebSocket("ws://a");`), [1]);
  assert.deepEqual(sitesReseau(`const s = "fetched"; const t = "prefetch";`), [],
    "un mot qui contient fetch sans être un appel ne doit pas compter");
});

test("aucun module ne touche le réseau", () => {
  // RÉCURSIF : un fetch planté dans src/scenarios/amount.ts laissait la garde verte quand
  // l'énumération s'arrêtait au premier niveau (constat de Mesure, lot L1, 7/09) ; et un
  // témoin sur l'énumération elle-même : elle doit voir au moins un fichier imbriqué
  /* Les chemins rendus portent le séparateur du système (`\` sous Windows) : ramenés à `/`, pour que
     « imbriqué » et AUTORISES se lisent pareil partout. */
  const tout = (readdirSync(dossier, { recursive: true }) as string[]).map((n) => n.split(sep).join("/"));
  assert.ok(tout.some((n) => n.includes("/")),
    "aucun chemin imbriqué énuméré : l'énumération n'est pas récursive, les sous-dossiers échappent à la garde");
  const fichiers = tout.filter((n) => /\.(ts|mjs)$/.test(n) && !/\.test\.(ts|mjs)$/.test(n) && !n.startsWith("fixtures/"));
  assert.ok(fichiers.length >= 6, `${fichiers.length} fichier(s) lus : la lecture a échoué.`);
  const fautifs: string[] = [];
  for (const n of fichiers) {
    const lignes = sitesReseau(readFileSync(join(dossier, n), "utf8"));
    if (lignes.length > 0 && !(n in AUTORISES)) fautifs.push(`${n}:${lignes.join(",")}`);
  }
  assert.deepEqual(fautifs, [],
    `site(s) réseau hors du téléchargeur : ${fautifs.join(" ")}.\n`
    + "  → « nothing of yours goes up » deviendrait une phrase, plus un fait. Un nouveau site\n"
    + "    d'envoi s'ajoute à AUTORISES avec sa raison, ou ne s'ajoute pas.");
});

/** Les noms du drapeau hors ligne qu'un téléchargeur doit lire, et qu'il ne lit pas.
 *  CRUSETRA_OFFLINE est le nom ; CASCADE_OFFLINE, l'ancien, reste un alias (5/10/2026) : un
 *  client qui l'a posé doit rester hors ligne exactement comme avant. */
export function drapeauxHorsLigneManquants(src: string): string[] {
  return ["CRUSETRA_OFFLINE", "CASCADE_OFFLINE"].filter((nom) => !new RegExp(`\\b${nom}\\b`).test(src));
}

test("un téléchargeur autorisé, s'il en vient un, obéit à CRUSETRA_OFFLINE et à son alias CASCADE_OFFLINE", () => {
  /* TÉMOIN D'ABORD : AUTORISES est vide ici, la boucle ne lit rien ; la règle doit quand même
     savoir dire non, sinon le jour où un téléchargeur arrive elle laisse passer l'un des deux noms. */
  assert.deepEqual(drapeauxHorsLigneManquants(`(process.env.CRUSETRA_OFFLINE ?? process.env.CASCADE_OFFLINE) === "1"`), []);
  assert.deepEqual(drapeauxHorsLigneManquants(`process.env.CASCADE_OFFLINE === "1"`), ["CRUSETRA_OFFLINE"],
    "un téléchargeur qui ne lit que l'ancien nom doit rougir");
  assert.deepEqual(drapeauxHorsLigneManquants(`process.env.CRUSETRA_OFFLINE === "1"`), ["CASCADE_OFFLINE"],
    "un téléchargeur qui oublie l'alias doit rougir : un client qui l'a posé repasserait en ligne");
  assert.deepEqual(drapeauxHorsLigneManquants(`process.env.XCRUSETRA_OFFLINE_2; MY_CASCADE_OFFLINE`),
    ["CRUSETRA_OFFLINE", "CASCADE_OFFLINE"], "un nom voisin n'est pas le drapeau");
  for (const nom of Object.keys(AUTORISES)) {
    const chemin = join(dossier, nom);
    if (!existsSync(chemin)) continue;   /* autorisé mais pas encore écrit : rien à feindre */
    const manquants = drapeauxHorsLigneManquants(readFileSync(chemin, "utf8"));
    assert.deepEqual(manquants, [],
      `${nom} touche le réseau sans lire ${manquants.join(" ni ")} : CRUSETRA_OFFLINE=1 (ou l'ancien `
      + "CASCADE_OFFLINE=1) ne peut pas le retenir.");
  }
});
