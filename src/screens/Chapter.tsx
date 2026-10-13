import { INITIAL_FEN } from 'chessops/fen';
import { useMemo } from 'react';
import { moveNumber, trace } from '../chess/game';
import { type Chapter as ChapterType, type Line, linePgn, lineStart, type Repertoire } from '../chess/repertoire';
import type { SectionData } from '../chess/repertoireFormat';
import { shapesOf } from '../chess/shapes';
import { Board } from '../components/Board';
import { MasteryBar, MasteryLegend, MasteryNote } from '../components/Mastery';
import { RichText } from '../components/RichText';
import { Screen } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import { choiceAt, drillsOf, isOff, type Role, ROLE_LABEL, setRole, useChoices } from '../choices';
import { ago, levelOf, masteryOf } from '../progress';
import type { Navigate } from '../routes';
import { usePref } from '../storage';

interface ChapterProps {
  rep: Repertoire;
  chapter: ChapterType;
  navigate: Navigate;
  back: () => void;
}

type Tab = 'ideas' | 'lines' | 'choices';

const ROLES: Role[] = ['main', 'also', 'off'];

/** "4.fxe5 Nxe4" for the last moves before a position, from where the chapter starts. */
function leadIn(path: readonly string[], from: number, plies = 3): string {
  const { steps } = trace(path);
  const start = Math.max(from, path.length - plies);
  return steps
    .slice(start)
    .map((step, i) => {
      const ply = start + i;
      return ply % 2 === 0 || i === 0 ? `${moveNumber(ply)}${step.san}` : step.san;
    })
    .join(' ');
}

/**
 * The places in a chapter where its side has more than one repertoire move,
 * each move with its setting (tap to change it) and how often it was played.
 */
function Choices({ rep, chapter, navigate }: { rep: Repertoire; chapter: ChapterType; navigate: Navigate }) {
  const version = useChoices();
  const { choices, live } = useMemo(() => {
    const choices = rep.puzzles(chapter).filter(puzzle => puzzle.answers.length > 1);
    const live = new Set(drillsOf(rep, chapter).map(drill => drill.key));
    return { choices, live };
  }, [rep, chapter, version]);

  if (!choices.length) return <p className="intro muted">This chapter gives one move in every position, so there is nothing to choose.</p>;
  return (
    <>
      <p className="intro muted">
        Where the repertoire gives you more than one move. Training a chapter asks for each move in turn, the main one
        most often; a move that is off is not asked, and neither is anything behind it.
      </p>
      <ul className="list">
        {choices.map(puzzle => {
          const moves = choiceAt(rep, chapter.side, puzzle.key).filter(entry => puzzle.answers.includes(entry.move));
          const total = moves.reduce((sum, entry) => sum + entry.played, 0);
          return (
            <li key={puzzle.key} className={live.has(puzzle.key) ? 'choice' : 'choice off'}>
              <button
                className="choice-where"
                onClick={() => navigate({ screen: 'study', side: chapter.side, chapter: chapter.id, path: puzzle.path })}
              >
                <span className="moves">after {leadIn(puzzle.path, chapter.root)}</span>
                <span className="muted">
                  {live.has(puzzle.key) ? (total ? `played ${total}×` : 'not played yet') : 'behind a move that is off'} ›
                </span>
              </button>
              <div className="choice-moves">
                {moves.map(({ move, role, played }) => (
                  <div key={move.uci} className={`choice-move ${role}`}>
                    <span className="moves">
                      {moveNumber(puzzle.path.length)}
                      {move.san}
                    </span>
                    <span className="muted">{total ? `${Math.round((played / total) * 100)}%` : ''}</span>
                    <Segmented
                      label={`How ${move.san} is trained`}
                      value={role}
                      onChange={next => setRole(rep, chapter.side, puzzle.key, move.uci, next)}
                      options={ROLES.map(value => ({ value, label: ROLE_LABEL[value] }))}
                    />
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** The first move of a line's main line that is turned off, if any: the line is then left out of chapter training. */
function offMove(rep: Repertoire, chapter: ChapterType, line: Line): string | undefined {
  const { steps, keys } = trace(line.main);
  for (let ply = chapter.root; ply < line.main.length; ply++) {
    if ((ply % 2 === 0) !== (chapter.side === 'white')) continue;
    if (isOff(rep, chapter.side, keys[ply]!, line.main[ply]!)) return `${moveNumber(ply)}${steps[ply]!.san}`;
  }
  return undefined;
}

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
  const version = useChoices();
  const mastery = useMemo(() => masteryOf(chapter.side, drillsOf(rep, chapter)), [rep, chapter, version]);
  const drills = mastery.total;
  const choiceCount = useMemo(() => rep.puzzles(chapter).filter(puzzle => puzzle.answers.length > 1).length, [rep, chapter]);
  // Each line with the positions training it asks, the ones it shares with earlier lines included.
  const lineMastery = useMemo(
    () => chapter.lines.map(line => masteryOf(chapter.side, drillsOf(rep, chapter, line.index))),
    [rep, chapter, version],
  );
  const lineOff = useMemo(() => chapter.lines.map(line => offMove(rep, chapter, line)), [rep, chapter, version]);

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
                ...(choiceCount ? [{ value: 'choices' as const, label: `Choices (${choiceCount})` }] : []),
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
      {tab === 'choices' && choiceCount ? (
        <Choices rep={rep} chapter={chapter} navigate={navigate} />
      ) : tab === 'ideas' || tab === 'choices' ? (
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
                <li key={line.index} className={lineOff[line.index] ? 'line-item off' : 'line-item'}>
                  <button className="row" onClick={() => openLine(chapter, line, navigate)}>
                    <span className="row-main">
                      <span className="row-title">{line.name}</span>
                      <span className="row-sub moves">{linePgn(line, Math.min(lineStart(chapter, line), line.main.length - 1), 7)}</span>
                      <span className="row-note">{line.summary}</span>
                      {lineOff[line.index] && (
                        <span className="row-note off-note">
                          {lineOff[line.index]} is off: chapter training skips this line. Train it here, or turn the move
                          on under Choices.
                        </span>
                      )}
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
