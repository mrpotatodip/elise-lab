-- Runner archive source (#230): the job sources a Runner said it reads when it last claimed a job. Every Runner today
-- reads git only, which the constant default gives each row. Additive: one column, no row rewritten.
ALTER TABLE "tenant_runners" ADD COLUMN "job_sources" text[] DEFAULT '{git}'::text[] NOT NULL;