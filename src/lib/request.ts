import type { Context } from "hono";

import { AppRouteError } from "./errors";

export async function readJsonBody<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new AppRouteError(400, "VALIDATION_ERROR", "Request body must be valid JSON.");
  }
}

export function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AppRouteError(400, "VALIDATION_ERROR", `${fieldName} is required.`);
  }

  return value.trim();
}

export function optionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function optionalPositiveInt(value: unknown, fieldName: string): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericValue =
    typeof value === "number" ? value : Number.parseInt(String(value).trim(), 10);

  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    throw new AppRouteError(400, "VALIDATION_ERROR", `${fieldName} must be a positive integer.`);
  }

  return numericValue;
}

export function validateEmailAddress(value: string, fieldName: string): string {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new AppRouteError(400, "VALIDATION_ERROR", `${fieldName} is not a valid email address.`);
  }

  return value.toLowerCase();
}

export function validatePassword(value: string): string {
  if (value.length < 8) {
    throw new AppRouteError(400, "VALIDATION_ERROR", "Password must be at least 8 characters.");
  }

  return value;
}

