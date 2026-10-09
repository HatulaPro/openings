import { useMemo } from 'react';
import type { Chapter, Line, Repertoire } from '../chess/repertoire';
import { MasteryBar, MasteryNote } from '../components/Mastery';
import { Screen } from '../components/Screen';
import type { Navigate } from '../routes';
import { type Mastery, masteryOf, needOf } from '../progress';
import { loadBookmark } from '../storage';

interface HomeProps {
  rep: Repertoire;
  navigate: Navigate;
}

const SIDES = [
  { side: 'white', label: 'With White' },
  { side: 'black', label: 'With Black' },
] as const;

/** How many lines "Work on next" lists. */
const WORK_ROWS = 3;

/** The repertoire: every chapter, grouped by colour and opening. */
export function Home({ rep, navigate }: HomeProps) {
  const lineCount = rep.chapters.reduce((sum, chapter) => sum + chapter.lines.length, 0);
  const resume = useMemo(() => {
    const bookmark = loadBookmark();
    const chapter = bookmark && rep.chapter(bookmark.chapter);
    const line = chapter?.lines[bookmark!.line];
    return chapter && line ? { bookmark: bookmark!, chapter, line } : undefined;
  }, [rep]);

  // How each chapter stands, and the lines that most need another look. A position
  // several lines share counts for the first of them, so it is not listed twice.
  const { standing, work } = useMemo(() => {
    const now = Date.now();
    const standing = new Map<string, Mastery>();
    const work: { chapter: Chapter; line: Line; mastery: Mastery }[] = [];
    for (const chapter of rep.chapters) {
      const puzzles = rep.puzzles(chapter);
      standing.set(chapter.id, masteryOf(chapter.side, puzzles.map(puzzle => puzzle.key), now));
      for (const line of chapter.lines) {
        const own = puzzles.filter(puzzle => puzzle.line === line.index).map(puzzle => puzzle.key);
        const mastery = masteryOf(chapter.side, own, now);
        if (needOf(mastery) > 0) work.push({ chapter, line, mastery });
      }
    }
    work.sort((a, b) => needOf(b.mastery) - needOf(a.mastery));
    return { standing, work: work.slice(0, WORK_ROWS) };
  }, [rep]);

  const groupsOf = (side: Chapter['side']) => {
    const groups = new Map<string, Chapter[]>();
    for (const chapter of rep.chapters) {
      if (chapter.side !== side) continue;
      const group = groups.get(chapter.group);
      if (group) group.push(chapter);
      else groups.set(chapter.group, [chapter]);
    }
    return [...groups];
  };

  return (
    <Screen title="Openings" subtitle={`My repertoire: ${rep.chapters.length} chapters, ${lineCount} lines`} scrollKey="home">
      {resume && (
        <section>
          <h2>Continue</h2>
          <ul className="list">
            <li>
              <button
                className="row"
                onClick={() =>
                  navigate({
                    screen: 'study',
                    side: resume.chapter.side,
                    chapter: resume.chapter.id,
                    line: resume.line.index,
                    path: resume.bookmark.path,
                    cursor: resume.bookmark.cursor,
                  })
                }
              >
                <span className="row-main">
                  <span className="row-title">{resume.line.name}</span>
                  <span className="row-sub">{resume.chapter.title}</span>
                </span>
                <span className="row-side">›</span>
              </button>
            </li>
          </ul>
        </section>
      )}

      {work.length > 0 && (
        <section>
          <h2>Work on next</h2>
          <ul className="list">
            {work.map(({ chapter, line, mastery }) => (
              <li key={`${chapter.id}:${line.index}`}>
                <button className="row" onClick={() => navigate({ screen: 'train', chapter: chapter.id, line: line.index })}>
                  <span className="row-main">
                    <span className="row-title">{line.name}</span>
                    <span className="row-sub">{chapter.title}</span>
                  </span>
                  <span className="row-side">
                    {[mastery.missed && `${mastery.missed} missed`, mastery.fading && `${mastery.fading} to refresh`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {SIDES.filter(({ side }) => rep.chapters.some(chapter => chapter.side === side)).map(({ side, label }) => (
        <section key={side}>
          <h2>{label}</h2>
          {groupsOf(side).map(([group, chapters]) => (
            <div key={group} className="group">
              <h3>{group}</h3>
              <ul className="list">
                {chapters.map(chapter => (
                  <li key={chapter.id} className="line-item">
                    <button className="row" onClick={() => navigate({ screen: 'chapter', id: chapter.id })}>
                      <span className="row-main">
                        <span className="row-title">{chapter.title}</span>
                        <span className="row-sub">{chapter.subtitle}</span>
                        <MasteryBar mastery={standing.get(chapter.id)!} />
                        <MasteryNote mastery={standing.get(chapter.id)!} />
                      </span>
                    </button>
                    <button
                      className="btn small"
                      onClick={() => navigate({ screen: 'train', chapter: chapter.id })}
                      aria-label={`Train ${chapter.title}`}
                    >
                      Train
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      <section>
        <h2>Tools</h2>
        <ul className="list">
          <li>
            <button className="row" onClick={() => navigate({ screen: 'study', side: 'white', path: [] })}>
              <span className="row-main">
                <span className="row-title">Analysis board</span>
                <span className="row-sub">Any position, with your notes, elite games and Stockfish</span>
              </span>
              <span className="row-side">›</span>
            </button>
          </li>
        </ul>
      </section>
    </Screen>
  );
}
