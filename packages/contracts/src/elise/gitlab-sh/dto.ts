import { z } from "zod";
import { GITLAB_SH_ADDRESS_MESSAGE, GITLAB_SH_ADDRESS_PATTERN } from "../constants";

// -----
// A repository on a GitLab server a company runs, read to its
// lowercase host and its path as typed. The server accepts any
// plain host; the Runner clones only from a host the person
// listed in its own settings.
// -----
export const GitlabShAddressSchema = z
  .string()
  .regex(GITLAB_SH_ADDRESS_PATTERN, GITLAB_SH_ADDRESS_MESSAGE)
  .transform((address) => {
    const [, host = "", path = ""] = GITLAB_SH_ADDRESS_PATTERN.exec(address) ?? [];
    return { host: host.toLowerCase(), path };
  });

export type GitlabShAddress = z.infer<typeof GitlabShAddressSchema>;
