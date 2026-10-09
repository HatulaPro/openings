# Repertoire content

Each folder here is one chapter of the repertoire: an opening, or one system inside an opening. The app
shows a chapter as an overview (ideas, plans, structures, each with a diagram) and a set of annotated
lines that can be studied move by move and drilled.

    content/<chapter-id>/chapter.md   the overview
    content/<chapter-id>/*.pgn        the annotated lines

`content/_example/` is a small working chapter. Folders that start with `_` are not built.

    pnpm content:check <chapter-id>   check one chapter (no id: all of them)
    pnpm data:repertoire              build everything the app loads

## Who it is written for

One strong, experienced player. Skip what any club player knows ("develops a piece", "controls the
centre"). Every note should say something concrete: what the move prevents or prepares, what the plan
is, which trade helps whom, what the trap is, why the obvious move fails.

The content comes from published theory: opening books, courses, annotated games and guides, restated
in our own words. It does not come from an engine. If sources disagree, say so in the note.

## chapter.md

    ---
    title: Vienna Gambit
    subtitle: 1.e4 e5 2.Nc3 Nf6 3.f4
    side: white
    group: Vienna Game
    order: 10
    ---

    Introduction: two or three short paragraphs.

    ## Title of an idea, plan or structure
    moves: 1. e4 e5 2. Nc3 Nf6 3. f4 d5 4. fxe5 Nxe4
    arrows: Gd2d3 Gf1d3 Rd8h4
    squares: Ye4 Rf2

    The explanation.

    ## Sources
    - Author, *Title* (publisher, year)

- `side` is the side the repertoire is for. `group` is the heading chapters are listed under, and
  `order` sorts chapters within their side.
- `## ` starts a section. `moves:`, `arrows:` and `squares:` are optional and go directly under the
  heading; `moves:` is the position of the section's diagram, from move 1.
- Text can use `**bold**`, `*italic*` and `- ` lists. A blank line starts a paragraph.
- The last section must be `## Sources`.

Good sections: the pawn structures and what each side does with them, the standard plans and piece
placements, the pawn breaks, typical tactics and traps, which endings are good, move-order points.
Aim for five to ten sections, each with a diagram.

## The .pgn files

PGN games. Each game is one line of the repertoire, written out from move 1. A chapter can keep all its
games in one `lines.pgn` or spread them over several files (`1-main-line.pgn`, `2-sidelines.pgn`, ...),
which are read in name order; that order is the order of the lines in the app.

    [Line "Main line with 5.Qf3"]
    [Section "3...d5"]
    [Summary "One or two sentences: what the line is and how it tends to go."]

    1. e4 e5 2. Nc3 Nf6 3. f4 { Comment. } 3... d5! { Comment. } ( 3... exf4? { Why it is bad. } 4. e5 Qe7
    5. Qe2 ) 4. fxe5 Nxe4 5. Qf3 *

- `Line` is the name shown in the list, `Section` groups lines under a heading, `Summary` is shown
  under the name. No other headers. Do not put a `"` inside a header value.
- Every game starts from the initial position and ends with `*`.
- Every White move carries its number (`5.`). A Black move takes `5...` after a comment or at the
  start of a variation. The checker uses the numbers to catch dropped moves.
- No blank lines are needed inside the moves; inside a comment a blank line starts a new paragraph.

### What the moves mean

The **main line** of a game is the repertoire: the moves to play, against the opponent's most
important defence.

A **variation** `( ... )` replaces the move just before it.

- A variation that starts with an **opponent's** move is another defence. Its own main line is the
  repertoire's answer, and it is drilled like the rest. Cover the serious alternatives, and the
  mistakes people really make (mark those `?` and show how to punish them).
- A variation that starts with **our** move is not the repertoire. Mark it `?` or `?!` when it is the
  tempting move that fails, and show the refutation; leave it unmarked or `!?` when it is a playable
  second choice, and say when one might prefer it. Nothing inside such a variation is drilled.
- A second repertoire choice that deserves full coverage (say 5.Nf3 next to 5.Qf3) gets its own game.

Keep variations at most two levels deep. A long sub-variation is better as its own game.

The same position reached by another move order is recognised automatically. Annotate a move that
several games share once, in the first game it appears in.

### Annotations

- `!` a strong move that is hard to find or the only good one, `!!` brilliant, `!?` interesting,
  `?!` dubious, `?` a mistake, `??` a blunder. A marked move needs a comment saying why.
- `{ ... }` after a move is the note on that move and on the position after it. Use `**Plan:**`,
  `**Idea:**`, `**Trap:**` and similar bold lead-ins when a note covers more than one thing.
- `[%cal Ge2e4,Rd8h4]` inside a comment draws arrows, `[%csl Gd5,Rf7]` marks squares. Colours:
  **G** our moves and plans, **R** threats, targets and the opponent's ideas, **Y** key squares,
  **B** an alternative. Arrows are for plans and threats, not for the move just played.

### What to annotate

1. **Every non-obvious repertoire move.** Above all the ones that look wrong or slow: say what the
   natural move is and why it is worse, as a variation with its refutation.
2. **Key positions.** Where a line reaches a standard position, give the plans of both sides, the
   pawn breaks, the good and bad trades, where the pieces belong, and the typical tactics.
3. **The opponent's choices.** What each defence is trying to do, and how the answer meets it.
4. **Move orders.** When a move has to be played now and not a move later, say what goes wrong.
5. **The end of the line.** Finish with a verdict: who stands better, why, and how play continues.

Main lines should run as deep as the published theory does. Stop where the sources stop and the plans
take over.

## What the checker reports

Errors stop the build: an illegal move (with the position it failed in), a wrong move number, text
that is not a move, a missing header or section.

Warnings ask for a second look: a marked move with no comment, a mistake with no refutation, a move
annotated differently in two games, and a repertoire move that no game in the book of elite games
(Lichess, 2400+) plays in a position those games reach often. The last one usually means a move was
copied wrongly. Check it against the source and keep it only if the source really gives it.

## Researching a chapter

**Start from popular Lichess studies.** A study with many likes has been read and vetted by many players,
and it gives exact moves with explanations, which book excerpts and articles rarely do.

    node scripts/study.ts search vienna game repertoire   studies matching the words, most liked first
    node scripts/study.ts topic King's Indian Defense     the most liked studies of a Lichess topic
    node scripts/study.ts show <id>                       a study's likes and its chapters
    node scripts/study.ts chapter <id> 3 4                chapters as PGN, without engine evaluations

Try several wordings: a study called "Vienna Repertoire" does not turn up under "vienna gambit". Build
a chapter from two to four studies with hundreds of likes or more, cross-checked against one another,
and never from a study with only a handful. List each study under `## Sources` with its title, author,
link and number of likes. The steps below add to this.

1. **Read first, write second.** Find what the opening's literature says: repertoire books and
   courses (publishers post excerpts and tables of contents: Quality Chess, Everyman, New in Chess,
   Thinkers Publishing, Chess Stars, Gambit; Chessable shows course outlines and free lessons),
   opening surveys and articles (ChessBase, Chess.com, Lichess blogs, chesspublishing.com), Lichess
   studies (`https://lichess.org/api/study/<id>.pgn` returns one as PGN), Wikibooks "Chess Opening
   Theory" and Wikipedia for the map of a line, and annotated master games.
2. **Use several sources**, at least two of them books or full courses, and list every one that was
   really used under `## Sources`.
3. **Moves are copied or confirmed, never reconstructed from memory.** The checker compares every
   repertoire move with the book of elite games and warns when nobody plays it. (The Lichess opening
   explorer API now needs a login and answers 401.)
4. **Explanations are written fresh**, not copied. Where the sources are thin, own understanding is
   fine, but an uncertain claim is left out rather than guessed.
5. **No engine.** Evaluations and "best moves" from an engine are not a source for this content.
6. **Run the checker early and often**, not only at the end: `node scripts/check-content.ts <id>`.
