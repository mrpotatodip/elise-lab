import { z } from "zod";
import { GITLAB_ADDRESS_MESSAGE, GITLAB_ADDRESS_PATTERN } from "../constants";

// -----
// A gitlab.com repository as a person pastes it, read to its
// lowercase host and its path as typed. A pasted branch view
// or a trailing .git still names the repository.
// -----
export const GitlabAddressSchema = z
  .string()
  .regex(GITLAB_ADDRESS_PATTERN, GITLAB_ADDRESS_MESSAGE)
  .transform((address) => {
    const [, host = "", path = ""] = GITLAB_ADDRESS_PATTERN.exec(address) ?? [];
    return { host: host.toLowerCase(), path };
  });

export type GitlabAddress = z.infer<typeof GitlabAddressSchema>;
