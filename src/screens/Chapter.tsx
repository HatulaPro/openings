import { INITIAL_FEN } from 'chessops/fen';
import { useMemo } from 'react';
import { trace } from '../chess/game';
import { type Chapter as ChapterType, type Line, linePgn, lineStart, type Repertoire } from '../chess/repertoire';
import type { SectionData } from '../chess/repertoireFormat';
import { shapesOf } from '../chess/shapes';
import { Board } from '../components/Board';
import { MasteryBar, MasteryLegend, MasteryNote } from '../components/Mastery';
import { RichText } from '../components/RichText';
import { Screen } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import { ago, levelOf, masteryOf } from '../progress';
import type { Navigate } from '../routes';
import { usePref } from '../storage';

interface ChapterProps {
  rep: Repertoire;
  chapter: ChapterType;
  navigate: Navigate;
  back: () => void;
}

type Tab = 'ideas' | 'lines';

function Idea({ section, chapter, navigate }: { section: SectionData; chapter: ChapterType; navigate: Navigate }) {
  const last = useMemo(() => (section.moves ? trace(section.moves).steps.at(-1) : undefined), [section]);
  return (
    <section className="idea">
      <h2>{section.title}</h2>
      {section.moves && (
        <button
          className="diagram"
          aria-label={`Open the position of "${section.title}" on the board`}
          onClick={() => navigate({ screen: 'study', side: chapter.side, chapter: chapter.id, path: section.moves! })}
        >
          <Board
            preview
            fen={last?.fenAfter ?? INITIAL_FEN}
            orientation={chapter.side}
            lastMove={last?.squares}
            shapes={shapesOf(section.shapes)}
          />
          <span className="diagram-hint muted">Tap the board to explore this position</span>
        </button>
      )}
      <RichText text={section.body} />
    </section>
  );
}

function openLine(chapter: ChapterType, line: Line, navigate: Navigate) {
  navigate({
    screen: 'study',
    side: chapter.side,
    chapter: chapter.id,
    line: line.index,
    path: line.main,
    cursor: lineStart(chapter, line),
  });
}

/** One chapter: its ideas as an illustrated overview, and its lines to study and train. */
export function Chapter({ rep, chapter, navigate, back }: ChapterProps) {
  const [tab, setTab] = usePref<Tab>('chapterTab', 'ideas');
  const mastery = useMemo(() => masteryOf(chapter.side, rep.puzzles(chapter).map(puzzle => puzzle.key)), [rep, chapter]);
  const drills = mastery.total;
  // Each line with the positions training it asks, the ones it shares with earlier lines included.
  const lineMastery = useMemo(
    () => chapter.lines.map(line => masteryOf(chapter.side, rep.puzzles(chapter, line.index).map(puzzle => puzzle.key))),
    [rep, chapter],
  );

  const groups = useMemo(() => {
    const bySection = new Map<string, Line[]>();
    for (const line of chapter.lines) {
      const group = bySection.get(line.section);
      if (group) group.push(line);
      else bySection.set(line.section, [line]);
    }
    return [...bySection];
  }, [chapter]);
  const level = levelOf(mastery);

  return (
    <Screen
      title={chapter.title}
      subtitle={chapter.subtitle}
      onBack={back}
      scrollKey={`chapter:${chapter.id}:${tab}`}
      fixed={
        <>
          <div className="tabs">
            <Segmented
              label="Part of the chapter"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'ideas', label: 'Ideas' },
                { value: 'lines', label: `Lines (${chapter.lines.length})` },
              ]}
            />
          </div>
          <div className="standing">
            <p className="muted">
              <span className={`level ${level.tone}`}>{level.label}</span>
              {` · ${mastery.total - mastery.untested} of ${mastery.total} positions tested`}
              {mastery.last !== undefined && ` · last trained ${ago(mastery.last)}`}
            </p>
            <MasteryBar mastery={mastery} />
            <MasteryLegend mastery={mastery} />
          </div>
        </>
      }
      footer={
        <>
          <button className="btn" onClick={() => navigate({ screen: 'play', chapter: chapter.id })}>
            Play vs book
          </button>
          <button className="btn primary" onClick={() => navigate({ screen: 'train', chapter: chapter.id })}>
            Train {drills} positions
          </button>
        </>
      }
    >
      {tab === 'ideas' ? (
        <>
          <RichText text={chapter.intro} className="intro" />
          {chapter.sections.map(section => (
            <Idea key={section.title} section={section} chapter={chapter} navigate={navigate} />
          ))}
        </>
      ) : (
        groups.map(([section, lines]) => (
          <section key={section}>
            {section && <h2 className="plain">{section}</h2>}
            <ul className="list">
              {lines.map(line => (
                <li key={line.index} className="line-item">
                  <button className="row" onClick={() => openLine(chapter, line, navigate)}>
                    <span className="row-main">
                      <span className="row-title">{line.name}</span>
                      <span className="row-sub moves">{linePgn(line, Math.min(lineStart(chapter, line), line.main.length - 1), 7)}</span>
                      <span className="row-note">{line.summary}</span>
                      <MasteryBar mastery={lineMastery[line.index]!} />
                      <MasteryNote mastery={lineMastery[line.index]!} />
                    </span>
                  </button>
                  <button
                    className="btn small"
                    onClick={() => navigate({ screen: 'train', chapter: chapter.id, line: line.index })}
                    aria-label={`Train ${line.name}`}
                  >
                    Train
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </Screen>
  );
}
