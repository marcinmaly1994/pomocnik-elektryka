import { describe, it, expect } from "vitest";
import { isSupabaseConfigured } from "./supabase";

describe("isSupabaseConfigured", () => {
  it("puste wartości -> nieskonfigurowane", () => {
    expect(isSupabaseConfigured("", "")).toBe(false);
  });

  it("placeholdery z .env.example -> nieskonfigurowane", () => {
    expect(isSupabaseConfigured("https://YOUR-PROJECT.supabase.co", "YOUR-ANON-PUBLIC-KEY")).toBe(false);
  });

  it("adres bez https:// -> nieskonfigurowane", () => {
    expect(isSupabaseConfigured("http://example.supabase.co", "realkey123")).toBe(false);
  });

  it("prawdziwe dane -> skonfigurowane", () => {
    expect(isSupabaseConfigured("https://abcdefgh.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")).toBe(true);
  });
});
