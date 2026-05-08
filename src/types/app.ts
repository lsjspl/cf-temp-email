import type { AuthUser } from "./auth";
import type { AppEnv } from "./env";
import type { Locale } from "../lib/i18n";

export type AuthMode = "session" | "api_token";

export interface AppVariables {
  authUser?: AuthUser;
  sessionId?: string;
  apiTokenId?: string;
  authMode?: AuthMode;
  requestIp?: string;
  locale?: Locale;
}

export interface AppSchema {
  Bindings: AppEnv;
  Variables: AppVariables;
}
