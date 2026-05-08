import type { AuthUser } from "./auth";
import type { AppEnv } from "./env";

export type AuthMode = "session" | "api_token";

export interface AppVariables {
  authUser?: AuthUser;
  sessionId?: string;
  apiTokenId?: string;
  authMode?: AuthMode;
  requestIp?: string;
}

export interface AppSchema {
  Bindings: AppEnv;
  Variables: AppVariables;
}
