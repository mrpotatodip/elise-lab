import {
  isSealed,
  openBytes,
  openText,
  parseMasterKey,
  SEALED_OBJECT_KEY,
  SEALED_OBJECT_VERSION,
  unwrapDataKey,
  type DataKey,
} from "./seal-text";

export const CANNOT_READ = "cannot be read";

type StoredObject = {
  body: ReadableStream;
  customMetadata?: Record<string, string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export type Unsealer = {
  text: (value: string) => Promise<string>;
  textOrNull: (value: string | null) => Promise<string | null>;
  object: (stored: StoredObject) => Promise<ReadableStream | ArrayBuffer | null>;
};

export const makeUnsealer = (key: DataKey | null, accountId: string): Unsealer => {
  const text = async (value: string): Promise<string> => {
    if (!isSealed(value)) return value;
    const opened = key === null ? null : await openText(key, accountId, value);
    if (opened !== null) return opened;
    console.error("Sealed text cannot be read", { accountId });
    return CANNOT_READ;
  };
  const object = async (stored: StoredObject): Promise<ReadableStream | ArrayBuffer | null> => {
    if (stored.customMetadata?.[SEALED_OBJECT_KEY] !== SEALED_OBJECT_VERSION) return stored.body;
    const opened = key === null ? null : await openBytes(key, accountId, await stored.arrayBuffer());
    if (opened === null) console.error("Sealed file cannot be read", { accountId });
    return opened;
  };
  return { text, textOrNull: async (value) => (value === null ? null : text(value)), object };
};

type FindingText = {
  findingId: string;
  title: string;
  class: string;
  file: string | null;
  impact: string | null;
  evidence: string | null;
  fix: string | null;
  needs: string | null;
};

export const openFindingText = async <Row extends FindingText>(unsealer: Unsealer, row: Row): Promise<Row> => ({
  ...row,
  findingId: await unsealer.text(row.findingId),
  title: await unsealer.text(row.title),
  class: await unsealer.text(row.class),
  file: await unsealer.textOrNull(row.file),
  impact: await unsealer.textOrNull(row.impact),
  evidence: await unsealer.textOrNull(row.evidence),
  fix: await unsealer.textOrNull(row.fix),
  needs: await unsealer.textOrNull(row.needs),
});

type JobText = {
  prompt: string;
  optionsJson: string;
  priorsJson: string;
  error: string | null;
  filesJson: string | null;
};

export const openJobText = async <Row extends JobText>(unsealer: Unsealer, row: Row): Promise<Row> => ({
  ...row,
  prompt: await unsealer.text(row.prompt),
  optionsJson: await unsealer.text(row.optionsJson),
  priorsJson: await unsealer.text(row.priorsJson),
  error: await unsealer.textOrNull(row.error),
  filesJson: await unsealer.textOrNull(row.filesJson),
});

export const PLAIN_ONLY: Unsealer = makeUnsealer(null, "none");

export const unwrapWithSecret = async (
  masterSecret: string | undefined,
  accountId: string,
  wrapped: string,
): Promise<DataKey | null> => {
  const master = masterSecret === undefined ? null : await parseMasterKey(masterSecret);
  return master === null ? null : unwrapDataKey(master, accountId, wrapped);
};
