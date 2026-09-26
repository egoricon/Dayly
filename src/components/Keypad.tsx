import { useEffect, useRef } from 'react';
import { KEYPAD_KEYS, keyFromKeyboard, type KeypadKey } from '../ui/amountInput';

interface KeypadProps {
  onKey: (key: KeypadKey) => void;
  onEnter?: () => void;
  onEscape?: () => void;
  keyHeight: number;
}

/** 3×4 amount keypad; a physical keyboard works too. */
export function Keypad({ onKey, onEnter, onEscape, keyHeight }: KeypadProps) {
  const handlers = useRef({ onKey, onEnter, onEscape });
  handlers.current = { onKey, onEnter, onEscape };

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = keyFromKeyboard(event.key);
      if (key) {
        event.preventDefault();
        handlers.current.onKey(key);
      } else if (event.key === 'Enter') {
        handlers.current.onEnter?.();
      } else if (event.key === 'Escape') {
        handlers.current.onEscape?.();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="keypad">
      {KEYPAD_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className="keypad-key"
          style={{ height: keyHeight }}
          aria-label={key === 'backspace' ? 'Стереть' : key}
          onClick={() => onKey(key)}
        >
          {key === 'backspace' ? '⌫' : key}
        </button>
      ))}
    </div>
  );
}
