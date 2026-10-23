export type Votes = Record<string, number>;

export interface Unit {
  id: string;
  name: string;
  eligible: number;
  voters: number;
  invalid: number;
  valid: number;
  turnout: number | null;
  votes: Votes;
  winner: string | null;
  winner_share: number | null;
  margin: number | null;
  parent?: string;
  counted?: boolean;
  kind?: string;
  localities?: string[];
  partial?: boolean;
}

export interface Results {
  national: Unit;
  external: Unit | null;
  seats: Record<string, number>;
  municipalities: Record<string, Unit>;
  localities: Record<string, Unit>;
  areas: Record<string, Unit> | null;
}

export type LineageKind =
  | 'continuing'
  | 'merger_existing_existing'
  | 'merger_existing_new'
  | 'split'
  | 'new'
  | 'withdrawn';

export interface LineageEntry {
  k26: string;
  kind: LineageKind;
  predecessors?: string[];
  split_from?: string;
  /** withdrawn lists: the 2022 list it came from (informational, no swing) */
  from_k25?: string;
  /** merger_existing_new: who joined the existing list (Hebrew, shown on the site) */
  joined?: string;
  id?: string;
  note?: string;
}

export interface PartyInfo {
  letters: string;
  official_name: string;
  short_name: string;
  leader: string | null;
  status: 'approved' | 'disqualified' | 'pending' | 'withdrawn';
  color: string;
  bloc: string;
  lineage?: Omit<LineageEntry, 'k26'>;
}

export interface BlocDefs {
  order: string[];
  items: Record<string, { name?: string; color?: string; k25?: string[]; k26?: string[]; rest?: boolean }>;
}

export interface PartiesFile {
  default_color: string;
  k25: PartyInfo[];
  k26: PartyInfo[];
  families: Record<string, string[]>;
  gone: string[];
  blocs: BlocDefs;
  surplus: Record<string, [string, string][]>;
}

export type ElectionKey = '25' | '26';
export type Status = 'final' | 'partial' | 'not_published';

export interface ElectionMeta {
  title: string;
  date: string;
  status: Status;
  counted_pct?: number;
  updated?: string;
  has_areas?: boolean;
  mock?: boolean;
}

export interface Meta {
  generated: string;
  elections: Record<ElectionKey, ElectionMeta>;
  areas_index: Record<string, { neighborhoods: number; placed_share: number }>;
}

export type Level = 'national' | 'municipality' | 'locality' | 'area';
export type View = '25' | '26' | 'compare';
export type ColorMode = 'winner' | 'partySwing' | 'blocSwing' | 'turnout';

export interface Selection {
  level: Level;
  id: string;
  /** zoom the map to the unit (selected from search, table, breadcrumbs or the URL) */
  fly?: boolean;
}
