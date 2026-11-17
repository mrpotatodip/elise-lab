import { z } from "zod";

export type FieldDocs = Partial<Record<string, z.core.GlobalMeta>>;

// -----
// Adds OpenAPI docs to the fields of a contract schema and returns that same
// schema. The fields, their types and their checks stay the contract's, so the
// engine's copy cannot drift from it. A name that is not a field throws when
// the module loads.
// -----
export function documentFields<Schema extends z.ZodObject>(schema: Schema, docs: FieldDocs): Schema {
  for (const [name, meta] of Object.entries(docs)) {
    const field = schema.shape[name];
    if (!field || !meta) throw new Error(`documentFields: ${name} is not a field of the schema`);
    z.globalRegistry.add(field, meta);
  }
  return schema;
}
