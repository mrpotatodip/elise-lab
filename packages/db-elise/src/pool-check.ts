import { randomUUID } from "node:crypto";
import { Client, Pool } from "pg";

// -----
// pnpm db:pool-check [--requests 2000] [--connections 10]
// Proves on a Neon BRANCH that app.tenant_id never leaks
// through a pooled connection (#63). Needs two URLs of the
// branch: BRANCH_OWNER_URL (owner role, seeds and cleans up)
// and BRANCH_APP_URL (elise_app on the -pooler host). Refuses
// to run against the endpoint in DATABASE_URL (live).
//
// Two existing Accounts of the branch each get seeded
// tenant_groups rows. Then many requests run at once on one
// pool: half as Account A, half as Account B (each in a
// transaction with set_config(..., true), as withTenant does),
// and some with no tenant set, outside a transaction. Every
// request must see only its own Account's rows, all of its
// seeded rows, and the no-tenant ones must see nothing.
// -----
const arg = (name: string, fallback: number) => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : Number(process.argv[at + 1]);
};

const endpoint = (url: string) => new URL(url).hostname.split(".")[0]!.replace(/-pooler$/, "");

type Kind = "A" | "B" | "none";

async function main() {
  const ownerUrl = process.env.BRANCH_OWNER_URL;
  const appUrl = process.env.BRANCH_APP_URL;
  if (!ownerUrl || !appUrl)
    throw new Error(
      "Set BRANCH_OWNER_URL and BRANCH_APP_URL to the Neon branch (owner role, and elise_app on the -pooler host).",
    );
  const live = process.env.DATABASE_URL ? endpoint(process.env.DATABASE_URL) : undefined;
  if (live && (endpoint(ownerUrl) === live || endpoint(appUrl) === live))
    throw new Error(`Refusing: ${live} is the live endpoint in DATABASE_URL. Point both URLs at a branch.`);
  if (!new URL(appUrl).hostname.includes("-pooler"))
    throw new Error("BRANCH_APP_URL must use the -pooler host: the pooled connection is what this checks.");

  const requests = arg("requests", 2000);
  const connections = arg("connections", 10);
  const perTenant = 5;
  const run = randomUUID().slice(0, 8);

  const owner = new Client({ connectionString: ownerUrl });
  await owner.connect();
  const pool = new Pool({ connectionString: appUrl, max: connections });
  try {
    const { rows: tenants } = await owner.query<{ id: string }>("select id from tenants order by created_at limit 2");
    if (tenants.length < 2) throw new Error("The branch needs at least two Accounts in tenants.");
    const [a, b] = [tenants[0]!.id, tenants[1]!.id];
    const seeded: Record<string, string[]> = { [a]: [], [b]: [] };
    for (const tenant of [a, b]) {
      for (let i = 0; i < perTenant; i += 1) {
        const { rows } = await owner.query<{ id: string }>(
          "insert into tenant_groups (tenant_id, name) values ($1, $2) returning id",
          [tenant, `pool-check-${run}-${i}`],
        );
        seeded[tenant]!.push(rows[0]!.id);
      }
    }

    const { rows: role } = await pool.query<{ current_user: string }>("select current_user");
    if (role[0]!.current_user !== "elise_app")
      throw new Error(`BRANCH_APP_URL signs in as ${role[0]!.current_user}, not elise_app.`);

    const seen = { A: 0, B: 0, none: 0 };
    const counts = { A: 0, B: 0, none: 0 };
    const failures: string[] = [];

    const one = async (kind: Kind) => {
      const client = await pool.connect();
      try {
        if (kind === "none") {
          const { rows } = await client.query<{ tenant_id: string }>("select tenant_id from tenant_groups");
          seen.none += rows.length;
          if (rows.length > 0) failures.push(`no tenant set, saw ${rows.length} row(s)`);
          return;
        }
        const tenant = kind === "A" ? a : b;
        await client.query("begin");
        await client.query("select set_config('app.tenant_id', $1, true)", [tenant]);
        const { rows } = await client.query<{ id: string; tenant_id: string }>(
          "select id, tenant_id from tenant_groups",
        );
        await client.query("commit");
        seen[kind] += rows.length;
        const foreign = rows.filter((row) => row.tenant_id !== tenant);
        if (foreign.length > 0) failures.push(`${kind} saw ${foreign.length} row(s) of another Account`);
        const ids = new Set(rows.map((row) => row.id));
        if (!seeded[tenant]!.every((id) => ids.has(id))) failures.push(`${kind} missed one of its own seeded rows`);
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        failures.push(`${kind}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        client.release();
      }
    };

    const kinds: Kind[] = Array.from({ length: requests }, (_, i) => (i % 5 === 4 ? "none" : i % 2 === 0 ? "A" : "B"));
    for (const kind of kinds) counts[kind] += 1;
    const started = Date.now();
    await Promise.all(kinds.map(one));
    const ms = Date.now() - started;

    console.log(`${requests} requests at once on ${connections} pooled elise_app connections, ${ms} ms`);
    console.log(`Account A: ${counts.A} requests, ${seen.A} rows seen in total (${seen.A / counts.A} per request)`);
    console.log(`Account B: ${counts.B} requests, ${seen.B} rows seen in total (${seen.B / counts.B} per request)`);
    console.log(`No tenant: ${counts.none} requests, ${seen.none} rows seen`);
    console.log(
      failures.length === 0
        ? "PASS: no row crossed Accounts, no-tenant requests saw nothing"
        : `FAIL: ${failures.length} problem(s)\n${[...new Set(failures)].join("\n")}`,
    );
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    await owner.query("delete from tenant_groups where name like $1", [`pool-check-${run}-%`]);
    await pool.end();
    await owner.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
