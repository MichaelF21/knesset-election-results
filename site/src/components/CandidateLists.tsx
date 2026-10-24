import { he } from '../i18n/he';
import { fmtPct } from '../lib/format';
import type { Model } from '../lib/model';
import type { PartyInfo } from '../lib/types';
import { BallotChip } from './BallotChip';

/** 2022 share of a 2026 list's predecessors (continuing lists and mergers), else null. */
function previousShare(m: Model, p: PartyInfo): number | null {
  const l = p.lineage;
  if (!l || !['continuing', 'merger_existing_existing', 'merger_existing_new'].includes(l.kind)) return null;
  const nat = m.r25.national;
  const votes = (l.predecessors ?? []).reduce((t, x) => t + (nat.votes[x] ?? 0), 0);
  return nat.valid ? (votes / nat.valid) * 100 : null;
}

/** National 2022 share of a 2022 list (e.g. the joint list a 2026 list split from). */
function jointShare(m: Model, letters22: string): number {
  const nat = m.r25.national;
  return nat.valid ? ((nat.votes[letters22] ?? 0) / nat.valid) * 100 : 0;
}

/**
 * The lists running in the 26th Knesset election, as an empty national results table: shown in the
 * side panel of the 2026 tab until the first results arrive.
 */
export function CandidateLists({ model }: { model: Model }) {
  const running = model.parties.k26.filter((p) => p.lineage?.kind !== 'withdrawn' && p.status !== 'withdrawn');
  const withdrawn = model.parties.k26.filter((p) => p.lineage?.kind === 'withdrawn' || p.status === 'withdrawn');
  // within a bloc: strongest predecessors first, split lists by their 2022 joint list, new lists last
  const weight = (p: PartyInfo) => {
    const prev = previousShare(model, p);
    if (prev !== null) return prev;
    if (p.lineage?.kind === 'split' && p.lineage.split_from) return jointShare(model, p.lineage.split_from) / 3;
    return -1;
  };
  const byBloc = model.blocs.order
    .map((id) => ({ id, lists: running.filter((p) => p.bloc === id).sort((a, b) => weight(b) - weight(a)) }))
    .filter((g) => g.lists.length);
  const surplus = model.parties.surplus.k26 ?? [];
  const short = (letters: string) => model.p26[letters]?.short_name ?? letters;

  return (
    <section className="candidate-lists" aria-labelledby="lists-h">
      <h3 id="lists-h">{he.lists.title}</h3>
      <p className="muted small">{he.lists.subtitle(running.length)}</p>
      <div className="party-table-wrap">
        <table className="party-table">
          <thead>
            <tr>
              <th scope="col">{he.unit.list}</th>
              <th scope="col" className="num">{he.unit.seats}</th>
              <th scope="col" className="num">{he.unit.share}</th>
            </tr>
          </thead>
          {byBloc.map((g) => (
            <tbody key={g.id}>
              <tr className="group-row">
                <th scope="colgroup" colSpan={3}>
                  <span className="dot" style={{ background: model.blocs.items[g.id]?.color }} aria-hidden="true" />
                  {model.blocs.items[g.id]?.name} <span className="muted small">({g.lists.length})</span>
                </th>
              </tr>
              {g.lists.map((p) => {
                const prev = previousShare(model, p);
                const split = p.lineage?.kind === 'split' && p.lineage.split_from;
                return (
                  <tr key={p.letters}>
                    <th scope="row">
                      <BallotChip model={model} election="26" letters={p.letters} size="sm" />
                      {/* the badge already names the 2022 list(s); this line only adds their strength */}
                      {prev !== null && (
                        <span className="lineage-note">{prev < 0.05 ? he.lists.prevTiny : he.lists.prev(fmtPct(prev))}</span>
                      )}
                      {split && <span className="lineage-note">{he.lists.prevJoint(fmtPct(jointShare(model, split)))}</span>}
                    </th>
                    <td className="num muted" title={he.status.notPublished}>—</td>
                    <td className="num muted" title={he.status.notPublished}>—</td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
      <p className="muted small">{he.lists.orderNote}</p>
      {surplus.length > 0 && (
        <section aria-labelledby="surplus-h">
          <h3 id="surplus-h">{he.lists.surplus}</h3>
          <ul className="surplus-list">
            {surplus.map(([a, b]) => (
              <li key={`${a}-${b}`}>
                {short(a)} <span className="muted">({a})</span> + {short(b)} <span className="muted">({b})</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {withdrawn.length > 0 && (
        <section className="withdrawn" aria-labelledby="withdrawn-lists-h">
          <h3 id="withdrawn-lists-h">{he.summary.withdrawn}</h3>
          <ul>
            {withdrawn.map((p) => (
              <li key={p.letters}>
                <BallotChip model={model} election="26" letters={p.letters} size="sm" />
              </li>
            ))}
          </ul>
          <p className="muted small">{he.summary.withdrawnNote}</p>
        </section>
      )}
    </section>
  );
}
