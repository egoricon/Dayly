import { parseAmount } from '../domain/money';
import { AmountStep } from './AmountStep';

interface StartBalanceProps {
  /** Typed text, kept by the onboarding so a step back does not lose it. */
  input: string;
  onInput: (input: string) => void;
  onDone: (balanceKopecks: number) => void;
  onBack: () => void;
  /** Steps of the whole setup; this is the first. */
  total: number;
}

/** 2b: money on hand, the first step of the setup. */
export function StartBalance({ input, onInput, onDone, onBack, total }: StartBalanceProps) {
  return (
    <AmountStep
      step={1}
      total={total}
      title="Сколько у тебя сейчас денег?"
      subtitle="Сложи карту и наличные. Точность до рубля не нужна."
      input={input}
      onInput={onInput}
      ready={input !== ''}
      onDone={() => onDone(parseAmount(input) ?? 0)}
      onBack={onBack}
      testId="start-amount"
    />
  );
}
