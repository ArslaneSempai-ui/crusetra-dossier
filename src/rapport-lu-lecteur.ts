/**
 * LE LECTEUR DU LOT D1 — sous le nom que le dossier (D2) importe : `rapport-lu-lecteur.ts`.
 * L'interface RapportLu reste dans `rapport-lu.ts` (la couture du chef) ; ce fichier est
 * l'implémentation, importée par `dossier.ts` par chemin calculé avec refus nommé.
 */
import type { RapportLu } from "./rapport-lu.ts";

/* ────────────────────────────────────────────────────────────────────────────────────────
 * LE LECTEUR (lot D1) : les quatre formats tels qu'ils EXISTENT dans les dépôts, lus sans
 * rien leur demander de changer. Ce que chaque outil écrit vraiment (relevé du 8/09) :
 *
 *   routing      kind "crusetra-client-record"    version 1, measuredAt ISO, source.sha256,
 *                (avant le 5/10/2026 : "cascade-client-record", toujours lu)
 *                empreinte (racine), recommendation = des lignes par champ (pas une règle)
 *   screening    kind "screening-client-record"   idem ; paliers/absents ; pas de règle en JSON
 *   monitoring   kind "monitoring-client-record"  idem ; echelles photographiées
 *   scoring      L3 n'a pas livré : le lecteur suit la CONVENTION de la famille
 *                ("scoring-client-record") — un rapport factice conforme au contrat vit dans
 *                les tests, et ce mot se remplace par le format du message de livraison de L3.
 *
 * AUCUN des quatre ne cite aujourd'hui son relevé public (`publicRecord`) : le contrat le
 * prévoit, les dépôts ne l'écrivent pas encore. Un champ absent est un NULL nommé, jamais
 * deviné — et le contrôle `signed` dira « rien à vérifier » plutôt que « valide ».
 * Quand `publicRecord.signature` arrive, c'est la forme détachée de `signature.ts` : la
 * signature Ed25519 des octets du sceau cité, vérifiée contre `cle-publique.pem`.
 * ──────────────────────────────────────────────────────────────────────────────────────── */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { empreinteDuReleve } from "./empreinte.ts";
import { verifierDetachee, type SignatureDetachee } from "./signature.ts";
import { OUTILS, type OutilId } from "./controle.ts";

/** kind écrit par chaque outil → l'identifiant de la suite. Dérivé d'OUTILS : un outil
 *  ajouté au contrat ne compile pas tant que son kind n'est pas écrit ici. Le vert écrit
 *  « crusetra-client-record » depuis le changement de nom (5/10/2026). Une Map et pas un
 *  objet : un kind « constructor » ne doit pas trouver Object.prototype au lieu d'un refus. */
const KIND_VERS_OUTIL = new Map<string, OutilId>([
  ...OUTILS.map((o): [string, OutilId] => [`${o === "routing" ? "crusetra" : o}-client-record`, o]),
  /* L'ANCIEN NOM, LU À VIE : les rapports déjà remis aux clients sont scellés et signés
     sous « cascade-client-record ». On ne les réécrit jamais ; le lecteur les accepte. */
  ["cascade-client-record", "routing"],
]);

/** Une chaîne, ou null : jamais une coercition silencieuse d'un objet vers "[object Object]". */
const chaineOuNull = (x: unknown): string | null => (typeof x === "string" && x.length > 0 ? x : null);

export function lireRapport(chemin: string, clePubliquePem?: string): RapportLu {
  const nom = basename(chemin);
  let brut: string;
  try {
    brut = readFileSync(chemin, "utf8");
  } catch {
    throw new Error(`${nom}: unreadable file. Point --reports at the <file>-measured.json a suite tool wrote.`);
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(brut) as Record<string, unknown>;
  } catch {
    throw new Error(`${nom}: not readable JSON. A measured report is the untouched JSON file the tool wrote.`);
  }
  const kind = chaineOuNull(json.kind);
  if (kind === null) {
    throw new Error(`${nom}: no "kind" field; this JSON does not say which tool wrote it.\n`
      + `  Accepted: ${[...KIND_VERS_OUTIL.keys()].join(", ")}.`);
  }
  const outil = KIND_VERS_OUTIL.get(kind);
  if (outil === undefined) {
    throw new Error(`${nom}: kind "${kind}" is not a tool of this suite.\n`
      + `  Accepted: ${[...KIND_VERS_OUTIL.keys()].join(", ")}.`);
  }

  /* La date : le JOUR de measuredAt, seulement s'il se lit ; jamais deviné. */
  const mesureBrut = chaineOuNull(json.measuredAt);
  const mesureLe = mesureBrut !== null && !Number.isNaN(Date.parse(mesureBrut))
    ? new Date(Date.parse(mesureBrut)).toISOString().slice(0, 10)
    : null;

  /* Le relevé public cité, s'il l'est un jour (contrat §2 : publicRecord { seal, signature? }). */
  const pr = (typeof json.publicRecord === "object" && json.publicRecord !== null
    ? json.publicRecord : {}) as { seal?: unknown; signature?: unknown };
  const sceauCite = chaineOuNull(pr.seal);
  const signatureValide = pr.signature === undefined || sceauCite === null
    ? null
    : verifierDetachee(sceauCite, pr.signature as SignatureDetachee, clePubliquePem).valide;

  const source = (typeof json.source === "object" && json.source !== null
    ? json.source : {}) as { sha256?: unknown };

  return {
    chemin: nom,
    outil,
    version: json.version === undefined || json.version === null ? null : String(json.version),
    mesureLe,
    sceauPorte: chaineOuNull(json.empreinte),
    sceauCalcule: empreinteDuReleve(json),
    relevePublic: { sceau: sceauCite, signatureValide },
    sourceSceau: chaineOuNull(source.sha256),
    regle: chaineOuNull(json.regle),
  };
}
