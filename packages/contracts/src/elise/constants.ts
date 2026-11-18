export const PUBLIC_CHAT_MESSAGE_MAX_LENGTH = 500;

// -----
// Sign-up: limits the form and the server share
// -----
export const SIGN_UP_INVITE_CODE_MAX = 128;
export const SIGN_UP_PERSON_NAME_MAX = 60;
export const SIGN_UP_ACCOUNT_NAME_MAX = 80;
export const SIGN_UP_EMAIL_MAX = 254;
export const SIGN_UP_PASSWORD_MIN = 8;
export const SIGN_UP_PASSWORD_MAX = 128;

// -----
// Invite codes: limits the admin form and the server share
// -----
export const INVITE_CODE_NOTE_MAX = 200;
export const INVITE_CODE_MAX_USES_DEFAULT = 1;
export const INVITE_CODE_MAX_USES_LIMIT = 1000;

export const TEAM_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const TEAM_INVITE_TOKEN_BYTES = 32;

// -----
// Runners: a pairing code works once, for 10 minutes. The
// token a paired Runner keeps is 32 random bytes.
// -----
export const RUNNER_NAME_MAX = 60;
export const RUNNER_PAIRING_CODE_MAX = 32;
export const RUNNER_PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
export const RUNNER_TOKEN_BYTES = 32;

// -----
// A Runner login from the terminal: both codes work once, for
// 10 minutes. The device code is 32 random bytes only the Runner
// sees. The suggested fields are capped so one start cannot fill
// the table.
// -----
export const RUNNER_LOGIN_TTL_MS = 10 * 60 * 1000;
export const RUNNER_LOGIN_DEVICE_CODE_BYTES = 32;
export const RUNNER_LOGIN_USER_CODE_MAX = 32;
export const RUNNER_LOGIN_DEVICE_CODE_MAX = 128;
export const RUNNER_LOGIN_FIELD_MAX = 120;

// -----
// How often the Runner may check a login, in seconds. A check
// sooner than that is answered "slow_down", and each one adds the
// step to the interval the Runner must keep (RFC 8628).
// -----
export const RUNNER_LOGIN_CHECK_INTERVAL_S = 5;
export const RUNNER_LOGIN_SLOW_DOWN_STEP_S = 5;

// -----
// A Scan on a Runner: how long it may wait for the app to claim it,
// and the most a report may carry (characters), so one Runner cannot
// fill the database.
// -----
export const RUNNER_JOB_QUEUE_TIMEOUT_MS = 10 * 60 * 1000;
export const RUNNER_JOB_ERROR_MAX = 4000;
export const RUNNER_JOB_LOG_MAX = 200_000;
export const RUNNER_JOB_FILE_MAX = 2_000_000;

// -----
// Groups and team invites: caps the form and the
// server share, so one Tenant cannot grow without
// bound
// -----
export const GROUP_NAME_MAX = 60;
export const GROUP_LIMIT_PER_TENANT = 100;
export const GROUP_MEMBER_LIMIT = 500;
export const TEAM_PENDING_INVITE_LIMIT = 200;
export const TEAM_INVITE_GROUP_LIMIT = 20;

// -----
// Verdict: an accepted risk lasts at most this many days;
// a pass needs succeeded scans of the commit whose weights
// add up to VERDICT_MIN_SCANS. A scan weighs what its Skill
// and profile say: every profile and an old lite scan count
// one, so one scan gives a Verdict. Provisional until real
// scans are measured.
// -----
export const ACCEPTED_RISK_MAX_DAYS = 90;
export const VERDICT_MIN_SCANS = 1;
export const VERDICT_SCAN_WEIGHTS = { quick: 1, standard: 1, deep: 1, lite: 1 } as const;

// -----
// Finding comments: the longest body, and how many events
// of a thread one answer holds
// -----
export const FINDING_COMMENT_BODY_MAX = 4000;
export const FINDING_THREAD_EVENT_LIMIT = 200;

// -----
// Repos and branches: caps per Account and per Repo
// -----
export const REPO_LIMIT_PER_TENANT = 200;
export const REPO_BRANCH_LIMIT = 25;

// -----
// GitLab addresses (docs/adr/0007-git-providers.md). A path is
// groups inside groups and a name: 2 to 20 parts, each letters,
// digits, '.', '_' or '-' and starting with a letter, digit or
// '_', as GitLab requires (so no '..'). It is read up to a
// branch-view marker ('/-/', as in '/-/tree/main') or a
// trailing '.git'. https only, and a plain host: no user,
// password or port. A gitlab-sh host is never github.com or
// gitlab.com, which have providers of their own. Group 1 is
// the host, group 2 the path. Twin of the Runner's
// core/src/providers/address.rs.
// -----
export const GITLAB_ADDRESS_MESSAGE = "A GitLab address looks like https://gitlab.com/group/name (groups inside groups are fine)";
export const GITLAB_SH_ADDRESS_MESSAGE = "A GitLab server address looks like https://git.example.com/group/name, on a host other than github.com or gitlab.com";
export const GITLAB_ADDRESS_PATTERN = /^https:\/\/(gitlab\.com)\/((?:[a-z0-9_][\w.-]*\/){1,19}[a-z0-9_][\w.-]*?)(?:\.git)?\/?(?:\/-\/.*)?$/i;
export const GITLAB_SH_ADDRESS_PATTERN =
  /^https:\/\/(?!(?:github|gitlab)\.com\/)((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\/((?:[a-z0-9_][\w.-]*\/){1,19}[a-z0-9_][\w.-]*?)(?:\.git)?\/?(?:\/-\/.*)?$/i;
