/** Onboarding progress: `total` segments, the first `step` of them active, with a way back to the previous step. */
export function StepProgress({ step, total, onBack }: { step: number; total: number; onBack: () => void }) {
  return (
    <div className="step-head">
      <button type="button" className="step-back" aria-label="Назад" onClick={onBack}>
        <svg width="10" height="18" viewBox="0 0 10 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8.5 1.5 1.5 9l7 7.5" />
        </svg>
      </button>
      <div className="step-progress" style={{ gridTemplateColumns: `repeat(${total}, 1fr)` }} aria-label={`Шаг ${step} из ${total}`}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className={i < step ? 'is-active' : ''} />
        ))}
      </div>
    </div>
  );
}
