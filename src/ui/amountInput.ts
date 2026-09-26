// Amount typed on the keypad, kept as a string like '12,4'.
// Rules from the design: up to 5 digits before the comma and 2 after,
// a second comma is ignored, a leading 0 is replaced.

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | ',' | 'backspace';

export const KEYPAD_KEYS: readonly KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'backspace'];

export function applyKey(input: string, key: KeypadKey): string {
  if (key === 'backspace') return input.slice(0, -1);
  const comma = input.indexOf(',');
  if (key === ',') {
    if (comma !== -1) return input;
    return input === '' ? '0,' : `${input},`;
  }
  if (comma !== -1) return input.length - comma - 1 >= 2 ? input : input + key;
  if (input === '0') return key;
  return input.length >= 5 ? input : input + key;
}

/** Maps a physical keyboard key to a keypad key. */
export function keyFromKeyboard(key: string): KeypadKey | null {
  if (/^[0-9]$/.test(key)) return key as KeypadKey;
  if (key === ',' || key === '.') return ',';
  if (key === 'Backspace') return 'backspace';
  return null;
}
