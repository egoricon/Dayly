/** Onboarding progress: 3 segments, the first `step` of them active. */
export function StepProgress({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="step-progress" aria-label={`Шаг ${step} из 3`}>
      {[1, 2, 3].map((i) => (
        <div key={i} className={i <= step ? 'is-active' : ''} />
      ))}
    </div>
  );
}
