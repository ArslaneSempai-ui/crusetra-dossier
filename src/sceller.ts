/* PARTAGÉ DANS LA FAMILLE CASCADE — source : cascade-screening
   Les dépôts de la famille (cascade, -screening, -monitoring, -scoring, -dossier) en portent
   une copie identique AU BYTE. Corrigez-le dans la source, puis recopiez : la famille est
   EXCLUE de la diffusion d'identite (depots.json), aucune diffusion ne viendra le faire à
   votre place. `couche-famille.test.ts` compare les octets, nomme la direction du retard, et
   refuse aussi un fichier identique dans deux dépôts qui ne porte PAS cet en-tête — c'est
   ainsi qu'une copie neuve se déclare au lieu de dériver en silence. Si une divergence
   devient VOULUE dans un dépôt, retirez-y cet en-tête : la copie quitte le groupe. */
/**
 * Poser le scellé sur un relevé de mesures.
 *
 *   npm run sceller -- <fichier.json>
 *   npm run sceller -- <fichier.json> --check     vérifie, n'écrit jamais (0 tient, 1 manque ou ne tient plus)
 *
 * CE QUE POSER UN SCELLÉ VEUT DIRE, ET IL FAUT QUE CE SOIT DÉSAGRÉABLE À LIRE : vous
 * déclarez que le contenu actuel du fichier est celui qui doit faire foi. L'empreinte
 * prouvera qu'il n'a pas bougé APRÈS. Elle ne dit rien de ce qui s'est passé avant, et elle
 * ne transforme pas un chiffre tapé à la main en mesure. Le seul geste qui produit une
 * mesure est `npm run measure` (ou `measure:yours` sur vos propres alertes).
 *
 * Même mécanique que cascade-routing : les relevés des deux outils se vérifient de la même
 * façon, et un lecteur qui a appris l'un a appris l'autre.
 */
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { isMain, refuserDrapeauxInconnus } from "./cli.ts";
import { empreinteDuReleve } from "./empreinte.ts";

if (isMain(import.meta)) {
  /*
   * `--check` : VÉRIFIER SANS ÉCRIRE (parcours client du 5 octobre 2026).
   *
   * Sans lui, « vérifier un scellé » et « déclarer un nouveau scellé » étaient le même geste : passer un relevé
   * édité RÉÉCRIVAIT son scellé et sortait en 0, pendant que la page Screening et nos réponses promettent « a seal
   * anyone can check ». Avec `--check` : 0 quand le scellé tient, 1 quand il manque ou ne correspond plus, et rien
   * n'est écrit. Même drapeau, mêmes mots que le sceller de cascade-routing.
   */
  refuserDrapeauxInconnus(["--check"]);
  const check = process.argv.includes("--check");
  const cible = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (cible === undefined) {
    console.error("  usage: npm run sceller -- <record.json>\n  There is no default record here: name the file you are sealing.");
    process.exit(2);
  }
  if (!existsSync(cible)) {
    console.error(`  ${cible} does not exist. There is nothing to seal.`);
    process.exit(2);
  }
  /* Exister n'est pas être lisible : un dossier passe la garde d'existence, puis
     readFileSync lève EISDIR et le lecteur reçoit une pile. */
  if (!statSync(cible).isFile()) {
    console.error(`  ${cible} is a directory, not a file. Point this at the record itself.`);
    process.exit(2);
  }

  const brut = JSON.parse(readFileSync(cible, "utf8")) as Record<string, unknown>;
  const avant = typeof brut.empreinte === "string" ? brut.empreinte : null;
  const apres = empreinteDuReleve(brut);

  if (avant === apres) {
    console.log(`  ${cible}\n  already sealed, and the seal matches: ${apres}. Nothing to do.`);
    process.exit(0);
  }
  if (check) {
    console.error(`  ${cible}`);
    console.error(avant
      ? `  SEAL DOES NOT MATCH: the file carries ${avant}, its content hashes to ${apres}.\n  It was edited after it was sealed. Nothing was written (--check).`
      : `  NOT SEALED: the file carries no seal. Nothing was written (--check).\n  \`npm run sceller -- ${cible}\` would declare the current content as the one that stands.`);
    process.exit(1);
  }

  brut.empreinte = apres;
  writeFileSync(cible, JSON.stringify(brut, null, 2));
  console.log(`  ${cible}`);
  console.log(avant
    ? `  seal REPLACED: ${avant} → ${apres}\n  The content had changed since the last seal. You have just declared that the\n  current content is the one that stands.`
    : `  seal placed: ${apres}\n  This file carried none. The content hash now proves it does not move any more;\n  it says nothing about what it held before today.`);
}
