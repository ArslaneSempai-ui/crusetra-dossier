/**
 * LE DOSSIER — la question de la cinquième pierre :
 *
 *     npm run dossier -- --reports=<a.json>,<b.json>,... [--validity=90] [--as-of=YYYY-MM-DD]
 *     → is the whole chain measured, sealed, fresh and yours, in one file a reviewer
 *       can verify without us
 *
 * Un à quatre rapports `measure:yours` de la suite entrent ; le lot D1 en lit les MARQUES
 * (sceaux, dates, signature, règle : jamais une valeur client) ; les cinq contrôles jugent
 * chaque question, et l'ÉTAT ATTEINT est le plus haut contrôle tenu SANS TROU : un rapport
 * signé mais non scellé n'est pas « signed », il est « present » : la chaîne se tient par
 * son maillon le plus bas, et un état sauté serait exactement le vert vide.
 *
 * ─── JAMAIS UNE VALEUR ───
 *
 * Le dossier cite les sceaux et les dates des rapports, JAMAIS leur contenu : aucune
 * cellule de grille, aucun montant, aucun identifiant client n'entre dans RapportLu, donc
 * aucun ne peut sortir d'ici : la frontière est le type, et un test le prouve quand même
 * sur un rapport truffé de sentinelles.
 */
/* piege:ok facade-en-francais — le mot « dossier » est LE NOM ANGLAIS du produit
   (Crusetra · Dossier) : les phrases anglaises destinées au client le portent
   légitimement, et la liste française de la règle le compte comme un mot français.
   Même faux positif de domaine que dossier.ts/facteur.ts chez l'améthyste : signalé
   au chef pour un témoin côté règle. */
import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import { execFileSync } from "node:child_process";
import { isMain, refuserDrapeauxInconnus } from "./cli.ts";
import { OUTILS, CONTROLES, type OutilId, type ControleId, type Verdict, type Reglages,
         type Registre, fraicheur, joursEntre } from "./controle.ts";
import type { RapportLu } from "./rapport-lu.ts";
import { empreinteDuReleve } from "./empreinte.ts";
import { ASSUMPTIONS, reglagesAvec, ligneDHypothese } from "./assumptions.ts";
import { table } from "./figures.ts";
import { lignesEvaluationDe } from "./evaluation.ts";

export type QuestionDossier = {
  outil: OutilId;
  fichier: string;
  mesureLe: string | null;
  sceauPorte: string | null;
  scelle: boolean;
  signee: boolean | null;
  joursDepuis: number | null;
  fraicheur: "fresh" | "due" | "stale" | null;
  /** le plus haut contrôle tenu SANS TROU, dans l'ordre des rangs ; "none" si le premier casse */
  etat: ControleId | "none";
  verdicts: Verdict[];
  /** ce qui manque pour l'état suivant, en une ligne ; null quand tout est tenu */
  manquePourSuivant: string | null;
};

export type DossierClient = {
  kind: "dossier-client-record";
  version: 1;
  asOf: string;
  reglages: Reglages;
  couverture: { n: number; sur: number };
  sceauxValides: { n: number; sur: number };
  signaturesVerifiees: { n: number; sur: number };
  questions: QuestionDossier[];
  /** les contrôles absents du registre, DÉRIVÉS, jamais récités */
  controlesAbsents: ControleId[];
  code: { commit: string } | null;
  empreinte?: string;
};

/**
 * L'état atteint : le préfixe des contrôles DU CONTRAT entièrement tenu : « sans trou ».
 *
 * L'ordre parcouru est celui du contrat (CONTROLES), pas celui du registre : un contrôle
 * ABSENT du registre est un trou comme un autre : personne ne l'a jugé, et affirmer un
 * état au-dessus d'un maillon jamais jugé serait le vert vide : la chaîne s'arrête au
 * premier contrôle absent OU non tenu. Le test l'a exigé avant que le code le fasse.
 */
export function etatAtteint(verdicts: readonly Verdict[], registre: Registre): ControleId | "none" {
  let dernier: ControleId | "none" = "none";
  for (const id of CONTROLES) {
    if (!registre.has(id)) break;
    const v = verdicts.find((x) => x.controle === id);
    if (!v || !v.tenu) break;
    dernier = id;
  }
  return dernier;
}

export function assembler(
  rapports: readonly RapportLu[],
  registre: Registre,
  reglages: Reglages,
): DossierClient {
  if (rapports.length === 0) {
    throw new Error("No report was given: the dossier assembles what measure:yours wrote,\n"
      + "  it does not invent a chain. Pass --reports=<a.json>,<b.json>,...");
  }
  /* Deux rapports pour la même question ET le même jeu de données sont un doublon : le
     dossier compterait deux fois la même mesure. Même outil sur un AUTRE jeu : légitime. */
  const vus = new Map<string, string>();
  for (const r of rapports) {
    if (r.sourceSceau === null) continue;
    const cle = `${r.outil}:${r.sourceSceau}`;
    const deja = vus.get(cle);
    if (deja !== undefined) {
      throw new Error(`two reports answer the same question on the same data set: `
        + `${deja} and ${basename(r.chemin)} (tool ${r.outil}, same source seal).\n`
        + `  A dossier counting one measurement twice would overstate the chain. Keep one.`);
    }
    vus.set(cle, basename(r.chemin));
  }

  const parRang = [...registre.values()].sort((a, b) => a.rang - b.rang);
  const questions: QuestionDossier[] = rapports.map((r) => {
    const verdicts = parRang.map((c) => c.juger(r, rapports, reglages));
    const etat = etatAtteint(verdicts, registre);
    const rangAtteint = etat === "none" ? 0 : parRang.find((c) => c.id === etat)!.rang;
    const suivant = parRang.find((c) => c.rang === rangAtteint + 1);
    const verdictSuivant = suivant ? verdicts.find((v) => v.controle === suivant.id) : undefined;
    const jours = r.mesureLe !== null ? joursEntre(r.mesureLe, reglages.auJour) : null;
    return {
      outil: r.outil,
      fichier: basename(r.chemin),
      mesureLe: r.mesureLe,
      sceauPorte: r.sceauPorte,
      scelle: r.sceauPorte !== null && r.sceauPorte === r.sceauCalcule,
      signee: r.relevePublic.signatureValide,
      joursDepuis: jours,
      fraicheur: r.mesureLe !== null && jours !== null && jours >= 0
        ? fraicheur(r.mesureLe, reglages) : null,
      etat, verdicts,
      manquePourSuivant: verdictSuivant ? verdictSuivant.detail : null,
    };
  });

  return {
    kind: "dossier-client-record", version: 1,
    asOf: reglages.auJour, reglages,
    couverture: { n: new Set(questions.map((q) => q.outil)).size, sur: OUTILS.length },
    sceauxValides: { n: questions.filter((q) => q.scelle).length, sur: questions.length },
    signaturesVerifiees: { n: questions.filter((q) => q.signee === true).length,
      sur: questions.filter((q) => q.signee !== null).length },
    questions,
    controlesAbsents: CONTROLES.filter((c) => !registre.has(c)),
    code: commitCourant(),
  };
}

export function commitCourant(): { commit: string } | null {
  try {
    const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"],
      { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" }).trim();
    return commit ? { commit } : null;
  } catch { return null; }
}

/* ─────────────────────────────── le rendu lisible ─────────────────────────────── */

export function rendreDossier(d: DossierClient): string {
  const l: string[] = [`# The dossier: is the whole chain measured, sealed, fresh and yours?`, ``];
  l.push(`Assembled on this machine, reference day ${d.asOf}, under a declared validity period `
    + `of ${d.reglages.rythmeJours} day(s) (stale after ${d.reglages.staleApres} validity periods).`
    + ` Nothing left it.`);
  l.push(``);
  l.push(`## The header a reviewer reads first`, ``);
  l.push(`- coverage: ${d.couverture.n} of ${d.couverture.sur} questions of the suite`);
  l.push(`- valid seals: ${d.sceauxValides.n} of ${d.sceauxValides.sur} report(s)`);
  l.push(`- verified signatures: ${d.signaturesVerifiees.n} of ${d.signaturesVerifiees.sur} with one to verify`);
  const parEtat = new Map<string, number>();
  for (const q of d.questions) parEtat.set(q.fraicheur ?? "unknown", (parEtat.get(q.fraicheur ?? "unknown") ?? 0) + 1);
  l.push(`- freshness: ${[...parEtat.entries()].map(([e, n]) => `${n} ${e}`).join(", ")}`);
  l.push(``);
  l.push(`## Question by question`, ``);
  const entetes = ["question", "file", "measured", "days since", "state reached", ...CONTROLES];
  const lignes = d.questions.map((q) => [
    q.outil, q.fichier, q.mesureLe ?? "not carried", q.joursDepuis ?? "",
    q.etat,
    ...CONTROLES.map((c) => {
      const v = q.verdicts.find((x) => x.controle === c);
      return v === undefined ? "not judged" : v.tenu ? "held" : "NOT held";
    }),
  ]);
  l.push(table(entetes, lignes), ``);
  l.push(`A state is the highest control held WITHOUT A GAP, in rank order: a signed but`);
  l.push(`unsealed report reaches "present", not "signed"; a chain holds by its lowest link.`);
  l.push(``);
  l.push(`## What is missing, question by question`, ``);
  for (const q of d.questions) {
    l.push(q.manquePourSuivant === null
      ? `- ${q.outil}: nothing; every control of the registry holds.`
      : `- ${q.outil}: ${q.manquePourSuivant}`);
  }
  if (d.controlesAbsents.length) {
    l.push(``, `Controls absent from the registry, said rather than guessed: `
      + `${d.controlesAbsents.join(", ")}; the states above are bounded by what could be judged.`);
  }
  l.push(``);
  l.push(`## Provenance`, ``);
  l.push(`- settings: ${(["rythmeJours", "staleApres"] as const).map((k) => ligneDHypothese(k)).join("; ")};`);
  l.push(`  reference day ${d.asOf} (written, never guessed) · reading cost assumption: ${ligneDHypothese("minutesParQuestion")}.`);
  l.push(`- this dossier cites the seals and dates of the reports, never their content: no`);
  l.push(`  grid cell, no amount, no identifier of yours can appear here, because none enters`);
  l.push(`  the mark-reading this dossier is built from.`);
  l.push(`- seal of this dossier: ${d.empreinte ?? "(sealed after rendering; see the .json beside this file)"}`
    + (d.code ? ` · code at commit ${d.code.commit}` : ""));
  l.push(``);
  l.push(`Verify without us: npm run verify -- dossier-${d.asOf}.json recomputes the seal.`);
  l.push(``);
  return l.join("\n");
}

/* ─────────────────────────────── l'exécution entière ─────────────────────────────── */

export function executer(
  chemins: readonly string[],
  lireRapport: (chemin: string) => RapportLu,
  registre: Registre,
  reglages: Reglages,
  dossierDeSortie = ".",
): { dossier: DossierClient; cheminMd: string; cheminJson: string } {
  const rapports = chemins.map((c) => lireRapport(c));
  const d = assembler(rapports, registre, reglages);
  d.empreinte = empreinteDuReleve(d);
  const base = `${dossierDeSortie}/dossier-${d.asOf}`;
  writeFileSync(`${base}.json`, JSON.stringify(d, null, 2) + "\n");
  writeFileSync(`${base}.md`, rendreDossier(d));
  return { dossier: d, cheminMd: `${base}.md`, cheminJson: `${base}.json` };
}

async function principal(): Promise<void> {
  for (const l of lignesEvaluationDe("dossier")) console.log(l);
  refuserDrapeauxInconnus(["--reports", "--validity", "--rhythm", "--as-of"]);
  const arg = (nom: string) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.split("=").slice(1).join("=");
  const brutReports = arg("reports");
  if (!brutReports) {
    console.log(`
Is the whole chain measured, sealed, fresh and yours, in one file a reviewer can
verify without us.

  npm run dossier -- --reports=<a.json>,<b.json>,... [--validity=90] [--as-of=YYYY-MM-DD]

--reports   one to four <file>-measured.json written by the suite's measure:yours
--validity  the recertification validity period your bank declares (days; default ${ASSUMPTIONS.rythmeJours}, assumed)
--as-of     the reference day for freshness (default: today, and the dossier writes it)

It writes, next to where you run it:
  dossier-<as-of>.md     the dossier a reviewer reads
  dossier-<as-of>.json   the sealed record; npm run verify recomputes its seal

The dossier cites the seals and dates of your reports, never their content.
`);
    return;
  }
  /*
   * L'ANCIEN NOM SE REFUSE EN NOMMANT LE NOUVEAU. `--rhythm` reste dans les drapeaux connus
   * pour que le refus vienne d'ici avec son issue, et pas du garde-drapeaux avec un « unknown
   * flag ». VOIX.md (tranché le 9/09) range « rhythm » dans le jargon interne ; le mot du
   * lecteur est « validity period », et cascade-routing l'a pris le même jour.
   */
  if (arg("rhythm") !== undefined) {
    console.error(`\n--rhythm was renamed --validity on 2026-09-13, the word a reader uses for`
      + ` this\n  setting. Write --validity=${arg("rhythm")} instead.\n`);
    process.exitCode = 2;
    return;
  }
  const reglages = reglagesAvec(arg("validity"), arg("as-of"));
  const chemins = brutReports.split(",").map((c) => c.trim()).filter((c) => c !== "");

  /* Le lecteur des rapports appartient au lot D1 ; absent de cet arbre, on refuse en le
     nommant plutôt que d'inventer une lecture. */
  let lireRapport: (chemin: string) => RapportLu;
  try {
    const chemin = "./rapport-lu-lecteur.ts";
    const module = await import(chemin) as { lireRapport: (chemin: string) => RapportLu };
    lireRapport = module.lireRapport;
  } catch {
    console.error(`\nThe report reader is not built yet (lot D1: src/rapport-lu-lecteur.ts).\n`
      + `  The dossier needs it to read the marks of your reports.\n`);
    process.exit(2);
  }
  const { registre } = await import("./controles/index.ts");
  const r = registre();
  if (r.size === 0) {
    console.error(`\nThe controls registry is empty (lot D1): there is nothing to judge with.\n`);
    process.exit(2);
  }

  const { dossier, cheminMd, cheminJson } = executer(chemins, lireRapport, r, reglages);
  console.log(`\n${dossier.questions.length} question(s): coverage ${dossier.couverture.n}/${dossier.couverture.sur}, `
    + `seals ${dossier.sceauxValides.n}/${dossier.sceauxValides.sur}, reference day ${dossier.asOf}.`);
  console.log(`  ${cheminMd}`);
  console.log(`  ${cheminJson}, seal ${dossier.empreinte}\n`);
}

/* Un refus destiné au client ne sort pas en trace de pile. */
if (isMain(import.meta)) {
  try {
    await principal();
  } catch (e) {
    console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  }
}
