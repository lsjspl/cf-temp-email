export type UserRole = "admin" | "user";
export type UserStatus = "active" | "disabled";

export interface AuthUser {
  id: string;
  email: string;
  username: string | null;
  role: UserRole;
  status: UserStatus;
}

