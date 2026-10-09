# Openings trainer

A personal, offline Android app (Capacitor + React) for learning chess openings. One user: the owner,
a strong and experienced player. Everything below is what he has said he wants from it.

## What the app is for

- **A fast, interactive way to memorise lines.** It should play like a quick game, not read like a
  study. Training must not force one fixed line: the opponent varies, and any move of the repertoire
  is accepted where there is more than one.
- **Understanding, not just moves.** For every position: the ideas, the plans, and above all _why_ a
  move is good or bad. Theory often plays an unintuitive move, and knowing why matters most there.
- **Easy to figure out, no intrusive popups.** Information sits inline, under and on the board. The
  UX has to carry a lot of explanation without getting in the way.
- **Not for beginners.** Hardcoded move lists that teach the first six moves are not helpful. Skip
  what any club player knows.

## Scope: a chosen repertoire, not every opening

The app covers only the openings he picks; the old catalogue of every named opening is gone on purpose.

- **White:** the Vienna (1.e4 e5 2.Nc3) is his main opening, played almost every game. Against the
  Caro-Kann (1.e4 c6 2.d4 d5) he used to exchange and play Be3 or Nf3 for an equal game, and wants
  better weapons.
- **Black:** Modern and King's Indian style positions. He wants to learn Sicilian positions such as
  the Dragon and the Najdorf.
- Chapters planned but not written: Vienna with 3.Bc4, Caro-Kann Exchange with 4.Bd3, King's Indian
  Makogonov/Averbakh, Fianchetto and d-pawn systems, Modern without Nc3, Dragon Classical/Levenfish,
  Najdorf 6.Be2/6.Bc4/6.h3. Do not start them unless asked.

## Where the content comes from

- **Published guides, not an engine.** The learning material comes from books, guides and above all
  **popular Lichess studies**: pick ones with many likes, since likes are how trust is judged, and
  list each study with its like count under the chapter's Sources. `node scripts/study.ts` finds and
  reads them.
- **Stockfish is an in-app feature only**, for analysing positions on the board. It is never the
  source of what to learn and has no place in the content pipeline.
- **The book of elite games** (Lichess, 2400+) is kept only for the repertoire's positions. It shows
  what strong players play and is useful to learn with, but it is not the guide.
- `content/README.md` has the chapter format and research rules; `pnpm content:check` validates.

## Working on this project

- **Usage is limited (Claude Pro).** Research and other delegable tasks go to weaker models (Sonnet,
  Haiku), a few agents at a time, never a large parallel batch. Have agents write files early.
- He tests on his own phone: `pnpm android:install` (USB debugging). Verify in the preview first,
  then reinstall after every app change without being asked, if the phone is connected.
- Report sourcing gaps and untested parts plainly; he would rather know a chapter is a draft.
- Commit and push after every major step
