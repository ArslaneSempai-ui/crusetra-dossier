# Crusetra · Dossier

**Is the whole compliance chain measured, sealed, fresh and yours: one dossier a reviewer
verifies without us.** Nothing of yours goes up: this tool downloads nothing, and it reads
your reports where they already sit.

Each tool of the suite measures one control and seals one record. Nobody can say at a glance
whether the chain still holds as a whole: whether each record is present, sealed, signed,
and inside its validity period. This tool reads the four records at their home paths, judges
them by five controls, and seals one dossier that states the highest control the chain holds
without a gap.

It is the fifth tool of the Crusetra suite. The first,
[Crusetra Routing](https://github.com/ArslaneSempai-ui/crusetra-routing), measures which
extraction tier suffices per field. Same method, same seal, same key.

The Dossier writes no measurement of its own. It reads the marks of the four records, their
seals, dates and signatures, never their content, and says which control holds and which
does not. A record absent on the day is a question said absent, and it is never guessed.

<!-- figures:commandes -->
| Command | What it does, in the order that makes sense |
|---|---|
| `npm ci --ignore-scripts` | install exactly the versions the lockfile pins, and run no install script from any dependency; the only command that needs the network: this tool downloads nothing else, ever |
| `npm run test` | types, the README blocks, the licence inventory, and the suite. Start here; it runs with the network cut |
| `npm run measure [-- --yes-overwrite]` | the public dossier: the four public records of the Crusetra suite, read at their home paths and judged by the five controls, sealed into `releve-public.json` and readable in `RELEVE-PUBLIC.md`: a suite record absent that day is a question said absent, never guessed, and a sealed record is not overwritten without the flag |
| `npm run dossier -- --reports=<a.json>,... [--validity=90] [--as-of=<day>]` | your own chain: one to four measure:yours reports of the suite, their marks read (seals, dates, signature, never their content), judged by the five controls; the state reached is the highest control held WITHOUT A GAP, and the dossier is sealed so a reviewer verifies it without us |
| `npm run sceller -- <record.json>` | seal a record: the content hash that makes a silently edited measurement fail loudly; the same content hash as Crusetra Routing |
| `npm run verify -- <report>` | check that a report was issued by the holder of the suite's public key, `cle-publique.pem`, without asking us |
| `npm run licences` | regenerate `LICENCES.md`, the licence of every shipped package; `--check` fails the suite when the table drifts |
<!-- /figures:commandes -->

## Requirements

Node 24 or newer, on **macOS or Linux**. Windows has not been tested and is not claimed.

## What leaves your machine

Nothing. This tool has no list to download and no model to fetch: every command runs with
the network cut, and a test reads every source so that no module ever grows a network call
(`src/frontiere.test.ts`).

## What is measured, assumed, synthetic

Every rate in a report carries its `n` and its 95 % Wilson interval. The scales that turn
an amount or a count into a score, the cash reporting threshold, analyst minutes per alert
and analyst cost are **assumed** and declared in `src/assumptions.ts`. The public record is
**written and generated**: cases we authored and seeded variants, measured apart, never
merged into anything measured on your data. Below five confirmed suspicious cases, no
recall is quoted, and the report states why.

## Seals and signatures

Records are sealed (`npm run sceller`) with the same content hash as Crusetra Routing, and
reports are verified against the same public key, [`cle-publique.pem`](cle-publique.pem),
with `npm run verify`.

<!-- figures:tests -->
**68 tests** across 14 files, counted by running the suite rather than typed here.
<!-- /figures:tests -->

## Licence

The same public licence as Crusetra Routing: non-commercial use without limit of time, a
thirty-day evaluation on your own records for organisations, a commercial licence for
production. See [LICENSE](LICENSE) and [LICENCES.md](LICENCES.md).
