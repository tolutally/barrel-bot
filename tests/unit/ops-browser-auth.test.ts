import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInWithPassword, signOut } = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signOut: vi.fn() }));
vi.mock("../../apps/ops/src/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({ auth: { signInWithPassword, signOut } }),
}));

import { signInOperator, signOutOperator } from "../../apps/ops/src/lib/browser-auth";

describe("Ops browser auth", () => {
  beforeEach(() => { signInWithPassword.mockReset(); signOut.mockReset(); });

  it("submits email/password to Supabase and reports a safe login error", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    await expect(signInOperator("operator@barrel.test", "password")).resolves.toBeNull();
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "operator@barrel.test", password: "password" });
    signInWithPassword.mockResolvedValue({ error: new Error("raw provider error") });
    await expect(signInOperator("operator@barrel.test", "bad")).resolves.toBe("Invalid email or password.");
  });

  it("signs out the Supabase session", async () => {
    signOut.mockResolvedValue({ error: null });
    await signOutOperator();
    expect(signOut).toHaveBeenCalledOnce();
  });
});
