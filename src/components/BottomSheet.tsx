import { useRef, useState, type ReactNode, type PointerEvent } from 'react';

const CLOSE_MS = 250;
const SWIPE_CLOSE_PX = 100;

interface BottomSheetProps {
  onClose: () => void;
  className?: string;
  children: (close: () => void) => ReactNode;
}

/** Bottom sheet over a dimmed screen. Closes on a dim tap or a swipe down on the grabber area. */
export function BottomSheet({ onClose, className = '', children }: BottomSheetProps) {
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);

  function close() {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, CLOSE_MS);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    dragStart.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragStart.current !== null) setDragY(Math.max(0, event.clientY - dragStart.current));
  }

  function onPointerUp() {
    dragStart.current = null;
    if (dragY > SWIPE_CLOSE_PX) close();
    else setDragY(0);
  }

  return (
    <div className={`sheet-layer${closing ? ' is-closing' : ''}`}>
      <div className="sheet-dim" onClick={close} />
      <div
        className={`sheet ${className}`}
        role="dialog"
        aria-modal="true"
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        <div
          className="sheet-grab-area"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="sheet-grabber" />
        </div>
        {children(close)}
      </div>
    </div>
  );
}
