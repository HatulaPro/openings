import { useEffect, useState } from 'react';
import { Book } from './chess/book';
import { Repertoire } from './chess/repertoire';
import type { RepertoireData } from './chess/repertoireFormat';
import { useRoute } from './routes';
import { Chapter } from './screens/Chapter';
import { Coords } from './screens/Coords';
import { Home } from './screens/Home';
import { Play } from './screens/Play';
import { Study } from './screens/Study';
import { Train } from './screens/Train';

async function load(name: string): Promise<Response> {
  const response = await fetch(`${import.meta.env.BASE_URL}${name}`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response;
}

export function App() {
  const [data, setData] = useState<{ book: Book; rep: Repertoire } | null>(null);
  const [error, setError] = useState('');
  const { route, visit, navigate, back } = useRoute();

  useEffect(() => {
    // The notes are fetched, not bundled: their move trees nest deeper than the bundler's JSON reader allows.
    Promise.all([
      load('book.bin').then(response => response.arrayBuffer()),
      load('repertoire.json').then(response => response.json() as Promise<RepertoireData>),
    ])
      .then(([buf, notes]) => setData({ book: new Book(buf), rep: new Repertoire(notes) }))
      .catch((reason: unknown) => setError(String(reason)));
  }, []);

  if (error) {
    return (
      <div className="splash">
        <p>The repertoire could not be loaded ({error}).</p>
        <p className="muted">Build it with “pnpm data:repertoire”.</p>
      </div>
    );
  }
  if (!data) return <div className="splash">Loading the repertoire…</div>;
  const { book, rep } = data;

  const home = <Home rep={rep} navigate={navigate} />;
  if (route.screen === 'home') return home;
  if (route.screen === 'coords') return <Coords key={visit} back={back} />;

  const chapterId = route.screen === 'chapter' ? route.id : route.chapter;
  const chapter = chapterId ? rep.chapter(chapterId) : undefined;
  const line = route.screen !== 'chapter' && route.line !== undefined ? chapter?.lines[route.line] : undefined;

  if (route.screen === 'study') {
    return (
      <Study
        key={visit}
        rep={rep}
        book={book}
        side={route.side}
        chapter={chapter}
        line={line}
        path={route.path}
        cursor={route.cursor}
        review={route.review}
        navigate={navigate}
        back={back}
      />
    );
  }
  if (!chapter) return home;
  switch (route.screen) {
    case 'chapter':
      return <Chapter key={visit} rep={rep} chapter={chapter} navigate={navigate} back={back} />;
    case 'train':
      return <Train key={visit} rep={rep} chapter={chapter} line={line} navigate={navigate} back={back} />;
    case 'play':
      return <Play key={visit} rep={rep} book={book} chapter={chapter} line={line} navigate={navigate} back={back} />;
  }
}
