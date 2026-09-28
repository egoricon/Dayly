import type { TargetLineInfo } from '../ui/homeHints';
import '../styles/home-extras.css';

/**
 * «Хочу тратить N в день» on the home screen: how much the limit is short of it, which opens
 * «Как дотянуть», or a quiet line that it is reached.
 */
export function TargetLine({ line, onOpen }: { line: TargetLineInfo; onOpen: () => void }) {
  return line.reached ? (
    <p className="home-line is-reached" data-testid="target-line">
      {line.text}
    </p>
  ) : (
    <button type="button" className="home-line target-line" data-testid="target-line" onClick={onOpen}>
      {line.text} →
    </button>
  );
}
