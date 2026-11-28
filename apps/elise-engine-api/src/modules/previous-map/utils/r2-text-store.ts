import { PLAIN_ONLY, type Unsealer } from "#/modules/sealed-data";

export type PreviousMapStore = { read: (key: string, unsealer?: Unsealer) => Promise<string | null> };

export const r2TextStore = (reports: R2Bucket): PreviousMapStore => ({
  read: async (key, unsealer = PLAIN_ONLY) => {
    const object = await reports.get(key);
    if (object === null) return null;
    const body = await unsealer.object(object);
    if (body === null) return null;
    return new Response(body).text();
  },
});
