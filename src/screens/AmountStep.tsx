import { Keypad } from '../components/Keypad';
import { StepProgress } from '../components/StepProgress';
import { applyKey } from '../ui/amountInput';
import '../styles/intro.css';

interface AmountStepProps {
  step: number;
  total: number;
  title: string;
  subtitle: string;
  /** Typed text, kept by the onboarding so a step back does not lose it. */
  input: string;
  onInput: (input: string) => void;
  /** Whether «Дальше» works with what is typed. */
  ready: boolean;
  onDone: () => void;
  onBack: () => void;
  testId: string;
}

/** A setup step with one amount on a big keypad (2b). The keypad gives up height first on a short screen. */
export function AmountStep({ step, total, title, subtitle, input, onInput, ready, onDone, onBack, testId }: AmountStepProps) {
  const submit = () => {
    if (ready) onDone();
  };

  return (
    <main className="screen onboarding amount-step">
      <StepProgress step={step} total={total} onBack={onBack} />
      <div className="step-title">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="start-amount">
        <span className="start-amount-number" data-testid={testId}>
          {input === '' ? '0' : input}
        </span>
        <span className="start-amount-currency">BYN</span>
      </div>
      <div className="spacer" />
      <Keypad onKey={(key) => onInput(applyKey(input, key))} onEnter={submit} />
      <button type="button" className="button-primary button-large" disabled={!ready} onClick={submit}>
        Дальше
      </button>
    </main>
  );
}
