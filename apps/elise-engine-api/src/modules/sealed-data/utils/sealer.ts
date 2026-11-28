import {
  fingerprintHmac,
  sealBytes,
  sealText,
  SEALED_OBJECT_KEY,
  SEALED_OBJECT_VERSION,
  type DataKey,
} from "./seal-text";
import { makeUnsealer, type Unsealer } from "./unsealer";

export const SEALED_OBJECT_METADATA = { [SEALED_OBJECT_KEY]: SEALED_OBJECT_VERSION };

export type Sealer = {
  text: (value: string) => Promise<string>;
  textOrNull: (value: string | null) => Promise<string | null>;
  bytes: (bytes: BufferSource) => Promise<ArrayBuffer>;
  fingerprint: (text: string) => Promise<string>;
  open: Unsealer;
};

export const makeSealer = (key: DataKey, accountId: string): Sealer => ({
  text: (value) => sealText(key, accountId, value),
  textOrNull: async (value) => (value === null ? null : sealText(key, accountId, value)),
  bytes: (bytes) => sealBytes(key, accountId, bytes),
  fingerprint: (text) => fingerprintHmac(key, text),
  open: makeUnsealer(key, accountId),
});

type FindingText = {
  findingId: string;
  title: string;
  class: string;
  file?: string | null;
  impact?: string | null;
  evidence?: string | null;
  fix?: string | null;
  needs?: string | null;
};

const sealField = async (sealer: Sealer, value: string | null | undefined) =>
  value === undefined ? undefined : sealer.textOrNull(value);

export const sealFindingText = async <Row extends FindingText>(sealer: Sealer, row: Row): Promise<Row> => ({
  ...row,
  findingId: await sealer.text(row.findingId),
  title: await sealer.text(row.title),
  class: await sealer.text(row.class),
  file: await sealField(sealer, row.file),
  impact: await sealField(sealer, row.impact),
  evidence: await sealField(sealer, row.evidence),
  fix: await sealField(sealer, row.fix),
  needs: await sealField(sealer, row.needs),
});
