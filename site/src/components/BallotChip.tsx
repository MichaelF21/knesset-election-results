import { badgeTexts, party, type Model } from '../lib/model';
import type { ElectionKey } from '../lib/types';

/** A party as its paper ballot (פתק): white card, large letters, official name below. */
export function BallotChip({
  model,
  election,
  letters,
  size = 'md',
  showBadges = true,
}: {
  model: Model;
  election: ElectionKey;
  letters: string;
  size?: 'sm' | 'md';
  showBadges?: boolean;
}) {
  const p = party(model, election, letters);
  const badges = election === '26' && showBadges ? badgeTexts(model, letters) : [];
  return (
    <span className={`ballot ballot-${size}`} title={p?.official_name ?? letters}>
      <span className="ballot-stripe" style={{ background: p?.color ?? model.parties.default_color }} aria-hidden="true" />
      <span className="ballot-letters">{letters}</span>
      <span className="ballot-name">{size === 'sm' ? (p?.short_name ?? letters) : (p?.official_name ?? letters)}</span>
      {badges.length > 0 && (
        <span className="badges">
          {badges.map((b) => (
            <span key={b} className={`badge${b === 'חדשה' ? ' badge-new' : ''}`}>
              {b}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
