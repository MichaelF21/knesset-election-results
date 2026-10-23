import { he } from '../i18n/he';
import { fmtPct } from '../lib/format';
import { blocName, blocShare, type Model } from '../lib/model';
import type { UnitSwing } from '../lib/swing';
import type { ElectionKey, Unit } from '../lib/types';
import { SwingValue } from './SwingValue';

export function BlocTotals({ model, election, unit, swing }: { model: Model; election: ElectionKey; unit: Unit; swing: UnitSwing | null }) {
  return (
    <section className="blocs" aria-labelledby="blocs-h">
      <h3 id="blocs-h">{he.summary.blocs}</h3>
      <ul>
        {model.blocs.order.map((id) => {
          const s = swing ? swing.blocs[id]?.share26 : blocShare(model, election, unit, id);
          return (
            <li key={id}>
              <span className="dot" style={{ background: model.blocs.items[id]?.color }} aria-hidden="true" />
              <span className="bloc-name">{blocName(model, id)}</span>
              <span className="bar" aria-hidden="true">
                <span style={{ inlineSize: `${Math.min(100, s ?? 0)}%`, background: model.blocs.items[id]?.color }} />
              </span>
              <span className="num">{fmtPct(s)}</span>
              {swing && <SwingValue value={swing.blocs[id]?.swing} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
