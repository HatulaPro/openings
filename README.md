# Openings

A personal, offline opening trainer for Android: a chosen repertoire with annotated lines, a
game-style training mode, the moves of elite players for each position, and Stockfish on the device.

    pnpm dev                 run in the browser
    pnpm data:repertoire     compile content/ and trim the book to its positions
    pnpm android:install     build and install on a connected phone

The chapter format and the research rules are in [content/README.md](content/README.md).

## Credits

**Opening content.** The chapters in `content/` are written from published opening theory, mainly
public [Lichess](https://lichess.org) studies, with books, courses and articles alongside. Each
chapter names what it used in its own `## Sources` section, which the app shows at the end of the
chapter's Ideas tab. The explanations are rewritten, not copied.

**Games.** The statistics for each position come from the
[Lichess Elite Database](https://database.nikonoel.fr) by nikonoel: games from
[Lichess](https://database.lichess.org) between players rated 2400 and above. Lichess publishes its
games under CC0.

**Engine.** [Stockfish](https://stockfishchess.org) 19, in the WebAssembly build of
[stockfish.js](https://github.com/nmrugg/stockfish.js) by Nathan Rugg and Chess.com. GPLv3; its
licence is in `public/engine/Copying.txt`.

**Board and rules.** [chessground](https://github.com/lichess-org/chessground) and
[chessops](https://github.com/niklasf/chessops), both GPL-3.0-or-later. The piece set is cburnett by
Colin M.L. Burnett.

**Opening names** used while building the book come from
[lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0).

## Licence

Because it is built on chessground, chessops and Stockfish, the app as a whole is covered by the
GNU General Public License, version 3 or later.
