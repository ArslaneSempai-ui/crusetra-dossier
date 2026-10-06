/**
 * CHAQUE COMMANDE TIENT L'HORLOGE DE SON OUTIL, JAMAIS CELLE D'UN AUTRE (6 octobre 2026).
 *
 * Le trou : `evaluation.ts` est recopié dans quatre outils et désignait un marqueur par
 * défaut, celui de Screening. Monitoring appelait `lignesEvaluation()` sans nommer le sien :
 * un évaluateur qui avait lancé Screening en janvier lisait « day 279 » au premier lancement
 * de Monitoring, et la licence de Monitoring (trente jours « from first use » de CE logiciel)
 * devenait fausse à l'écran. Scoring et Dossier, eux, n'affichaient aucune horloge.
 *
 * Ce témoin lance les VRAIES commandes de ce dépôt, dans un dossier personnel fabriqué (HOME
 * et USERPROFILE) où les marqueurs des trois autres outils portent une date ancienne. Une
 * commande qui retombe sur le marqueur d'un autre outil imprime cette date ; une commande qui
 * oublie l'horloge n'imprime rien ; les deux rougissent ici. Le vrai dossier personnel du
 * poste n'est jamais lu ni écrit.
 *
 * Ce fichier existe dans les quatre dépôts et diffère par ses deux constantes : l'outil et
 * ses commandes. Le module qu'il éprouve, lui, est identique au byte (couche-famille).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { OUTILS, marqueursDe, type Outil } from "./evaluation.ts";

/** L'outil de CE dépôt, et les commandes npm qui lisent les données du client. */
const OUTIL: Outil = "dossier";
const COMMANDES = ["dossier"];

const racine = fileURLToPath(new URL("..", import.meta.url));
const scripts = (JSON.parse(readFileSync(join(racine, "package.json"), "utf8")) as
  { scripts: Record<string, string> }).scripts;

/** Le fichier qu'un script npm lance : « node src/x.ts » donne src/x.ts. */
function fichierDe(script: string): string {
  const m = /^node (src\/[\w-]+\.ts)$/.exec(scripts[script] ?? "");
  assert.ok(m, `npm run ${script} ne lance plus « node src/<fichier>.ts » : ce témoin ne sait plus quoi lancer`);
  return m[1]!;
}

function poser(fichier: string, iso: string): void {
  mkdirSync(join(fichier, ".."), { recursive: true });
  writeFileSync(fichier, JSON.stringify({ premiereUtilisation: iso }) + "\n");
}

const lue = (fichier: string): string =>
  (JSON.parse(readFileSync(fichier, "utf8")) as { premiereUtilisation: string }).premiereUtilisation;

/** Lance la commande sans argument (elle imprime son mode d'emploi) dans la maison donnée. */
function lancer(fichier: string, maison: string): string {
  const r = spawnSync(process.execPath, [join(racine, fichier)], {
    cwd: racine, encoding: "utf8", timeout: 120_000,
    env: { ...process.env, HOME: maison, USERPROFILE: maison },
  });
  return `${r.stdout}${r.stderr}`;
}

const maisonFabriquee = (): string => mkdtempSync(join(tmpdir(), `horloge-${OUTIL}-`));

/* Une propriété, un test, et les commandes parcourues DANS le test : screening compte ses
   tests dans les sources (readme.ts), où un test écrit dans une boucle compterait une fois
   pour plusieurs exécutions. Chaque message nomme la commande qui a failli. */
test(`les commandes de ${OUTIL} tiennent son horloge : les marqueurs des autres outils n'y entrent pas`, () => {
  for (const script of COMMANDES) {
    const maison = maisonFabriquee();
    const autres: string[] = OUTILS.filter((o) => o !== OUTIL).flatMap((o) => Object.values(marqueursDe(o, maison)));
    for (const f of autres) poser(f, "2026-01-01T09:00:00.000Z");
    const avant: Buffer[] = autres.map((f) => readFileSync(f));

    const sortie = lancer(fichierDe(script), maison);
    assert.match(sortie, /evaluation clock · day 1 of 30 since first use/,
      `npm run ${script} n'imprime pas l'horloge de ${OUTIL} au jour 1 : elle retombe sur le marqueur `
      + `d'un autre outil, ou elle n'en imprime aucune.\n${sortie.slice(0, 600)}`);
    assert.doesNotMatch(sortie, /2026-01-01/, `npm run ${script} : la date d'un autre outil est sortie à l'écran`);
    const mien = marqueursDe(OUTIL, maison);
    assert.ok(existsSync(mien.fichier), `npm run ${script} n'a pas écrit ${mien.fichier.split(sep).slice(-2).join("/")}`);
    assert.deepEqual(autres.map((f) => readFileSync(f)), avant, `npm run ${script} a réécrit le marqueur d'un autre outil`);
    assert.deepEqual(readdirSync(join(maison, ".crusetra")).sort(),
      OUTILS.map((o) => `premiere-utilisation-${o}.json`).sort(),
      `npm run ${script} : un seul fichier neuf, le marqueur de cet outil`);
    assert.equal(existsSync(mien.ancien), false, `npm run ${script} : l'ancienne maison n'est jamais écrite`);
  }
});

test(`les commandes de ${OUTIL} relisent son ancienne maison, et la date la plus ancienne gagne`, () => {
  for (const script of COMMANDES) {
    const maison = maisonFabriquee();
    const mien = marqueursDe(OUTIL, maison);
    poser(mien.ancien, "2026-09-01T09:00:00.000Z");
    poser(mien.fichier, "2026-09-20T09:00:00.000Z");
    const octets = readFileSync(mien.ancien);

    const sortie = lancer(fichierDe(script), maison);
    assert.match(sortie, /since first use \(2026-09-01\)/,
      `npm run ${script} : le renommage ne doit ni remettre à zéro ni prolonger l'horloge de ${OUTIL}.\n`
      + sortie.slice(0, 600));
    assert.equal(lue(mien.fichier), "2026-09-01T09:00:00.000Z", `npm run ${script} : la vraie date passe dans la nouvelle maison`);
    assert.deepEqual(readFileSync(mien.ancien), octets, `npm run ${script} : l'ancien marqueur est lu, jamais réécrit`);
  }
});

/** Les appels d'horloge d'un source qui ne sont pas `lignesEvaluationDe("<outil>")`. */
export function appelsEtrangers(source: string, outil: Outil): string[] {
  const appels = [...source.matchAll(/\b(lignesEvaluationDe|lignesEvaluation|marquer|marqueursDe)\s*\(([^)]*)\)/g)];
  return appels.map((m) => m[0]).filter((a) => a !== `lignesEvaluationDe("${outil}")`);
}

test("le détecteur d'appels voit un appel sans outil, ou à l'outil d'un autre : témoin", () => {
  assert.deepEqual(appelsEtrangers(`for (const l of lignesEvaluation()) console.log(l);`, OUTIL), ["lignesEvaluation()"]);
  const autre = OUTILS.find((o) => o !== OUTIL)!;
  assert.deepEqual(appelsEtrangers(`lignesEvaluationDe("${autre}")`, OUTIL), [`lignesEvaluationDe("${autre}")`]);
  assert.equal(appelsEtrangers(`marquer(marqueursDe("${autre}").fichier)`, OUTIL).length, 1);
  assert.deepEqual(appelsEtrangers(`for (const l of lignesEvaluationDe("${OUTIL}")) console.log(l);`, OUTIL), []);
});

test(`dans src/, seules les commandes de ${OUTIL} appellent l'horloge, et toujours à son nom`, () => {
  const attendus = COMMANDES.map(fichierDe).map((f) => f.slice("src/".length)).sort();
  const dossier = join(racine, "src");
  const sources = (readdirSync(dossier, { recursive: true }) as string[]).map((n) => n.split(sep).join("/"))
    .filter((n) => /\.(ts|mjs)$/.test(n) && !/\.test\.(ts|mjs)$/.test(n) && n !== "evaluation.ts");
  assert.ok(sources.length >= 6, `${sources.length} fichier(s) lus : la lecture a échoué`);
  const fautes: string[] = [];
  const appelants: string[] = [];
  for (const n of sources) {
    const texte = readFileSync(join(dossier, n), "utf8");
    for (const a of appelsEtrangers(texte, OUTIL)) fautes.push(`${n}: ${a}`);
    if (texte.includes(`lignesEvaluationDe("${OUTIL}")`)) appelants.push(n);
  }
  assert.deepEqual(fautes, [], "un appel d'horloge qui ne nomme pas cet outil compte les jours d'un autre");
  assert.deepEqual(appelants.sort(), attendus, "chaque commande qui lit les données du client imprime l'horloge, et elles seules");
});
