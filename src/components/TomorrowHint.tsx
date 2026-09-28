import { formatKopecks } from '../domain/money';
import { tomorrowGain, type TomorrowIfStopped } from '../ui/homeHints';
import '../styles/home-extras.css';

/**
 * «Завтра будет…»: «Остановишься сейчас — завтра 31,20 (+3,70)» while there is money left today.
 * Without «будет», so it fits one line on a 360-pt phone.
 */
export function TomorrowHint({ tomorrow }: { tomorrow: TomorrowIfStopped }) {
  const gain = tomorrowGain(tomorrow);
  return (
    <p className="home-line" data-testid="tomorrow-hint">
      Остановишься сейчас — завтра <strong>{formatKopecks(tomorrow.limitKopecks)}</strong>
      {gain && <span className="home-line-gain"> {gain}</span>}
    </p>
  );
}
