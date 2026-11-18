import { queryOptions } from "@tanstack/react-query";
import { fetchDeviceLogin } from "../api";

export const deviceKeys = {
  all: ["device"] as const,
  login: (code: string) => [...deviceKeys.all, "login", code] as const,
};

export const deviceLoginQuery = (code: string) => queryOptions({ queryKey: deviceKeys.login(code), queryFn: () => fetchDeviceLogin({ data: { code } }), retry: false });
