/**
 * LA MESURE PUBLIQUE DE LA CINQUIÈME PIERRE : les quatre relevés publics de la suite,
 * lus à leurs chemins de maison, passés aux cinq contrôles au jour de la mesure, scellés
 * dans releve-public.json. C'est le dossier DE LA MAISON sur elle-même : la même question
 * qu'un client pose à sa chaîne, posée à la nôtre, en public.
 *
 * Un relevé de la suite absent le jour de la mesure (l'améthyste pas encore scellée) est
 * une question à l'état `present: false`, DITE : le relevé se re-mesure quand elle arrive
 * (`--yes-overwrite`). Un registre vide (lot D1 pas livré) est un REFUS nommé : cinq
 * contrôles absents ne jugent rien, et un dossier sans jugement serait un vert vide.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, basename, dirname } from "node:path";
import { isMain, refuserDrapeauxInconnus } from "./cli.ts";
import { verifierDetachee, type SignatureDetachee } from "./signature.ts";
import { OUTILS, CONTROLES, type OutilId, type Verdict, type Reglages } from "./controle.ts";
import type { RapportLu } from "./rapport-lu.ts";
import { registre as chargerRegistre, absents } from "./controles/index.ts";
import { empreinteDuReleve, scelleIntact } from "./empreinte.ts";
import { ASSUMPTIONS } from "./assumptions.ts";
import { etatAtteint, commitCourant } from "./dossier.ts";

const MAISON = join(homedir(), "Documents");

/** Où vit le relevé public de chaque outil de la suite : les chemins de la maison. Le vert
 *  n'a pas (encore) de relevé scellé au format des trois autres : landing.json en tient
 *  lieu, sans sceau, et le contrôle `sealed` le dira au lieu de le maquiller. */
export const RELEVES_DE_LA_SUITE: Record<OutilId, string> = {
  // le vert : son relevé de RÉFÉRENCE scellé (measure.ts du vert, RELEVE_DE_REFERENCE), pas
  // landing.json qui est le fichier de chiffres du site (ni date, ni sceau : lot du 8/09)
  routing: join(MAISON, "cascade", "profiles-2026-08-20-coeur-rendu.json"),
  screening: join(MAISON, "cascade-screening", "releve-public.json"),
  monitoring: join(MAISON, "cascade-monitoring", "releve-public.json"),
  scoring: join(MAISON, "cascade-scoring", "releve-public.json"),
};

/**
 * Un relevé public lu comme un RapportLu : les MARQUES seulement. Le sceau recalculé par
 * la même empreinte que les quatre outils ; la date depuis le champ `date` (ou `measuredAt`) ;
 * pas de signature à vérifier ici (le relevé public n'en porte pas) : null, dit tel quel.
 */
export function lireRelevePublic(outil: OutilId, chemin: string): RapportLu {
  const brut = JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown>;
  const porte = typeof brut.empreinte === "string" ? brut.empreinte : null;
  const date = typeof brut.date === "string" ? brut.date.slice(0, 10)
    : typeof brut.measuredAt === "string" ? (brut.measuredAt as string).slice(0, 10) : null;
  return {
    chemin: basename(chemin),
    outil,
    version: typeof brut.version === "number" || typeof brut.version === "string" ? String(brut.version) : null,
    mesureLe: date,
    sceauPorte: porte,
    sceauCalcule: empreinteDuReleve(brut),
    relevePublic: { sceau: porte, signatureValide: signatureDuRelevePublic(chemin, porte) },
    sourceSceau: null,
    regle: null,
  };
}

/**
 * La signature DÉTACHÉE d'un relevé public, si le dépôt en publie une : le fichier
 * `<releve>.signature.json` à côté (écrit par `npm run signer`, lot du 8/09), vérifiée contre
 * la clé publique DU DÉPÔT du relevé (`cle-publique.pem` à côté), jamais contre la nôtre :
 * chaque dépôt répond de sa propre clé. Sans fichier : null, rien à vérifier, dit tel quel ;
 * avec un fichier qui ne se vérifie pas : false, et le contrôle `signed` ne tient pas.
 */
export function signatureDuRelevePublic(chemin: string, sceau: string | null): boolean | null {
  const fichier = join(dirname(chemin), basename(chemin).replace(/\.json$/, "") + ".signature.json");
  if (!existsSync(fichier)) return null;
  if (sceau === null) return false;
  const clePublique = join(dirname(chemin), "cle-publique.pem");
  if (!existsSync(clePublique)) return false;
  let sig: unknown;
  try {
    sig = JSON.parse(readFileSync(fichier, "utf8"));
  } catch {
    return false;
  }
  return verifierDetachee(sceau, sig as SignatureDetachee, readFileSync(clePublique, "utf8")).valide;
}

export type QuestionPublique = {
  present: boolean;
  fichier: string;
  etat?: string;
  joursDepuis?: number | null;
  sceau?: string | null;
  signee?: boolean | null;
  verdicts?: Verdict[];
};

export function mesurePublique(reglages: Reglages): {
  version: 1; date: string; commit: string | null;
  controles: { presents: string[]; absents: string[] };
  questions: Record<OutilId, QuestionPublique>;
  couverture: { n: number; sur: number };
  reglages: Reglages;
  empreinte?: string;
} {
  const r = chargerRegistre();
  if (r.size === 0) {
    throw new Error("The controls registry is empty (lot D1): five absent controls judge\n"
      + "  nothing, and a dossier without judgement would be an empty green.");
  }
  const lus: RapportLu[] = [];
  const questions = {} as Record<OutilId, QuestionPublique>;
  for (const outil of OUTILS) {
    const chemin = RELEVES_DE_LA_SUITE[outil];
    if (!existsSync(chemin)) {
      questions[outil] = { present: false, fichier: basename(chemin) };
      continue;
    }
    lus.push(lireRelevePublic(outil, chemin));
  }
  const parRang = [...r.values()].sort((a, b) => a.rang - b.rang);
  for (const lu of lus) {
    const verdicts = parRang.map((c) => c.juger(lu, lus, reglages));
    const etat = etatAtteint(verdicts, r);
    questions[lu.outil] = {
      present: true, fichier: lu.chemin, etat,
      joursDepuis: lu.mesureLe !== null
        ? Math.round((Date.parse(reglages.auJour) - Date.parse(lu.mesureLe)) / 86_400_000) : null,
      sceau: lu.sceauPorte, signee: lu.relevePublic.signatureValide, verdicts,
    };
  }
  return {
    version: 1, date: reglages.auJour, commit: commitCourant()?.commit ?? null,
    controles: { presents: [...r.keys()], absents: absents(r) },
    questions,
    couverture: { n: lus.length, sur: OUTILS.length },
    reglages,
  };
}

export function rendrePublic(m: ReturnType<typeof mesurePublique>): string {
  const l: string[] = [`# The public dossier: the suite examined by its own fifth tool`, ``];
  l.push(`The four public records of the Crusetra suite, read at their home paths and judged by`);
  l.push(`the five controls on ${m.date}, under the declared default validity period of `
    + `${m.reglages.rythmeJours} day(s). This is the house asking itself the question it sells.`);
  l.push(``);
  l.push(`- coverage: ${m.couverture.n} of ${m.couverture.sur} suite records present`);
  for (const outil of OUTILS) {
    const q = m.questions[outil];
    if (!q.present) {
      l.push(`- ${outil}: ABSENT. ${q.fichier} does not exist yet; said, not guessed. Re-measure`);
      l.push(`  with --yes-overwrite when it arrives.`);
    } else {
      l.push(`- ${outil}: state reached ${q.etat}, measured ${q.joursDepuis} day(s) before the`
        + ` reference day${q.sceau ? `, seal ${q.sceau}` : ", no seal carried"}.`);
    }
  }
  if (m.controles.absents.length) {
    l.push(``, `Controls absent from the registry: ${m.controles.absents.join(", ")}; derived, not recited.`);
  }
  l.push(``, `Seal of this record: ${m.empreinte ?? "(sealed on write)"}${m.commit ? ` · commit ${m.commit}` : ""}.`);
  l.push(``);
  return l.join("\n");
}

async function principal(): Promise<void> {
  refuserDrapeauxInconnus(["--yes-overwrite", "--as-of"]);
  const arg = (nom: string) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.split("=").slice(1).join("=");
  const ici = new URL("..", import.meta.url).pathname;
  const cible = join(ici, "releve-public.json");
  if (existsSync(cible) && !process.argv.includes("--yes-overwrite")) {
    const deja = JSON.parse(readFileSync(cible, "utf8")) as Record<string, unknown>;
    if (scelleIntact(deja)) {
      console.error(`\nreleve-public.json is sealed (${deja.empreinte}). Overwriting a sealed public\n`
        + `  record is a decision, not a side effect: pass --yes-overwrite to re-measure.\n`);
      process.exit(2);
    }
  }
  const auJour = arg("as-of");
  const reglages: Reglages = { rythmeJours: ASSUMPTIONS.rythmeJours,
    staleApres: ASSUMPTIONS.staleApres,
    auJour: auJour ?? new Date().toISOString().slice(0, 10) };
  const m = mesurePublique(reglages);
  m.empreinte = empreinteDuReleve(m);
  writeFileSync(cible, JSON.stringify(m, null, 2) + "\n");
  writeFileSync(join(ici, "RELEVE-PUBLIC.md"), rendrePublic(m));
  console.log(`releve-public.json sealed ${m.empreinte}; coverage ${m.couverture.n}/${m.couverture.sur}, `
    + `controls ${m.controles.presents.length}/${CONTROLES.length}.`);
}

if (isMain(import.meta)) {
  try {
    await principal();
  } catch (e) {
    console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  }
}
