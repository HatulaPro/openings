import { type ReactNode, useLayoutEffect, useRef } from 'react';

const scrollMemory = new Map<string, number>();

interface ScreenProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Remember the scroll position under this name, so coming back lands in the same place. */
  scrollKey?: string;
  /** Scroll back to the top whenever this value changes, such as the position being shown. */
  resetKey?: string | number;
  /** Extra class for the screen, such as "study" for the layout with a board and a toolbar. */
  variant?: string;
  /** Content pinned above the scrolling area, such as the board. */
  fixed?: ReactNode;
  /** Content pinned below the scrolling area, such as a toolbar. */
  footer?: ReactNode;
  children?: ReactNode;
}

export function Screen({ title, subtitle, onBack, scrollKey, resetKey, variant, fixed, footer, children }: ScreenProps) {
  const scroller = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !scrollKey) return;
    el.scrollTop = scrollMemory.get(scrollKey) ?? 0;
    const onScroll = () => scrollMemory.set(scrollKey, el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollKey]);

  useLayoutEffect(() => {
    if (resetKey !== undefined && scroller.current) scroller.current.scrollTop = 0;
  }, [resetKey]);

  return (
    <div className={variant ? `screen ${variant}` : 'screen'}>
      <header className="topbar">
        {onBack && (
          <button className="back" onClick={onBack} aria-label="Back">
            ‹
          </button>
        )}
        <div className="titles">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </header>
      {fixed}
      <div className={footer ? 'scroll with-footer' : 'scroll'} ref={scroller}>
        {children}
      </div>
      {footer && <footer className="toolbar">{footer}</footer>}
    </div>
  );
}
