import { useEffect, type ReactNode } from 'react';
import { FormScreen } from '../components/Form';
import type { BudgetResult } from '../domain/budget';
import { categoryName } from '../domain/categories';
import { addDays } from '../domain/dates';
import { formatMoney } from '../domain/money';
import type { AppData, LocalDate } from '../domain/types';
import type { GuideSection } from '../intro';
import { formatDayMonth } from '../ui/labels';
import '../styles/intro.css';

interface GuideProps {
  data: AppData;
  budget: BudgetResult;
  lastBackupAt: LocalDate | null;
  /** The page «Подробнее» of a hint asked for: it scrolls into view. */
  section: GuideSection | null;
  onBack: () => void;
}

function Page({ id, title, children }: { id: GuideSection; title: string; children: ReactNode }) {
  return (
    <section className="note-card guide-card" id={`guide-${id}`} data-testid="guide-card" aria-labelledby={`guide-${id}-title`}>
      <strong id={`guide-${id}-title`}>{title}</strong>
      {children}
    </section>
  );
}

/** «Как устроен Dayly» (update 2, 3.3): the whole app in six short pages, with the person's own numbers. */
export function Guide({ data, budget, lastBackupAt, section, onBack }: GuideProps) {
  // The first page is right under the title; a later one scrolls up to the top.
  useEffect(() => {
    if (section && section !== 'limit') document.getElementById(`guide-${section}`)?.scrollIntoView({ block: 'start' });
  }, [section]);

  const until = formatDayMonth(addDays(budget.period.end, 1));
  const reserves = budget.reserves.filter((r) => r.budgetKopecks > 0);
  const main = data.incomeSources.find((s) => s.id === data.settings.mainIncomeSourceId);

  return (
    <FormScreen title="Как устроен Dayly" onBack={onBack}>
      <Page id="limit" title="Лимит на день">
        <span>
          {budget.status === 'deficit' && budget.shortfall
            ? `Сейчас до ${formatDayMonth(budget.shortfall.until)} не хватает ${formatMoney(budget.shortfall.amountKopecks)}, поэтому лимит 0.`
            : `Сегодня можно ${formatMoney(budget.dailyLimitKopecks)}: столько, чтобы денег хватило до ${until}.`}
        </span>
        <span>
          Dayly берёт деньги, которые у тебя есть, прибавляет то, что точно придёт, вычитает платежи, резервы и копилку и делит на оставшиеся
          дни. Каждое утро лимит считается заново. Нажми на круг на главной — покажу расчёт по шагам.
        </span>
      </Page>

      <Page id="reserves" title="Резервы на продукты и проезд">
        <span>
          На то, без чего не обойтись, можно отложить сумму на весь период. Такие траты идут из резерва, а лимит их не замечает. Кончился
          резерв — остальное идёт из лимита.
        </span>
        <span>
          {reserves.length > 0
            ? `Сейчас: ${reserves.map((r) => `${categoryName(data, r.category)} ${formatMoney(r.budgetKopecks)}`).join(', ')} до ${until}.`
            : 'Сейчас резервов нет. Настроить — «Финансы → Категории трат».'}
        </span>
      </Page>

      <Page id="carry" title="Перенос и перерасход">
        <span>
          Не потратил всё — остаток разойдётся по оставшимся дням, и лимит чуть вырастет. Потратил больше — перерасход тоже разойдётся по
          дням, и лимит станет меньше. Вчерашний остаток можно и отложить в копилку.
        </span>
      </Page>

      <Page id="savings" title="Копилка и банки">
        <span>
          Отложенное остаётся на твоей карте, просто лимит считается без него. Банка — это цель: к дате, процентом с каждого поступления, по
          расписанию или вручную. Подушка — запас на непредвиденное. Положить и забрать можно в любой момент.
        </span>
      </Page>

      <Page id="calendar" title="Календарь и платежи">
        <span>
          В «Финансах» нажми на день, чтобы запланировать доход или расход, один раз или с повтором. На платежи деньги откладываются заранее.
          Когда день придёт, я спрошу, оплачено ли и пришли ли деньги — отметь, и лимит станет точным.
        </span>
        {main && (
          <span>
            Следующее поступление: {main.name}, {until}.
          </span>
        )}
      </Page>

      <Page id="data" title="Где хранятся данные и зачем копия">
        <span>
          Всё хранится только на этом телефоне, без сервера и входа. Браузер может стереть данные сайта, который долго не открывали, поэтому
          раз в пару недель сохраняй копию: «Настройки → Сохранить копию». С экрана «Домой» данные надёжнее.
        </span>
        <span>{lastBackupAt ? `Последняя копия — ${formatDayMonth(lastBackupAt)}.` : 'Копию ещё не сохраняли.'}</span>
      </Page>
    </FormScreen>
  );
}
