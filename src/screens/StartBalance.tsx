import { Keypad } from '../components/Keypad';
import { StepProgress } from '../components/StepProgress';
import { parseAmount } from '../domain/money';
import { applyKey } from '../ui/amountInput';

interface StartBalanceProps {
  /** Typed text, kept by the onboarding so a step back does not lose it. */
  input: string;
  onInput: (input: string) => void;
  onDone: (balanceKopecks: number) => void;
  onBack: () => void;
}

/** 2b: step 1 of 3, money on hand. */
export function StartBalance({ input, onInput, onDone, onBack }: StartBalanceProps) {
  const submit = () => {
    if (input !== '') onDone(parseAmount(input) ?? 0);
  };

  return (
    <main className="screen onboarding">
      <StepProgress step={1} onBack={onBack} />
      <div className="step-title">
        <h1>Сколько у тебя сейчас денег?</h1>
        <p>Сложи карту и наличные. Точность до рубля не нужна.</p>
      </div>
      <div className="start-amount">
        <span className="start-amount-number" data-testid="start-amount">{input === '' ? '0' : input}</span>
        <span className="start-amount-currency">BYN</span>
      </div>
      <div className="spacer" />
      <Keypad keyHeight={54} onKey={(key) => onInput(applyKey(input, key))} onEnter={submit} />
      <button type="button" className="button-primary button-large" disabled={input === ''} onClick={submit}>
        Дальше
      </button>
    </main>
  );
}
