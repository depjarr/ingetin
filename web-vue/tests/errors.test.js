import { describe, it, expect } from "vitest";
import { authErrorText, dbErrorText } from "../src/lib/errors.js";

describe("pesan error", () => {
  it("menerjemahkan error login umum", () => {
    expect(authErrorText({ message: "Invalid login credentials" })).toBe("Email atau password salah.");
    expect(authErrorText({ message: "Email not confirmed" })).toMatch(/belum dikonfirmasi/);
  });
  it("meneruskan pesan yang tidak dikenal", () => {
    expect(authErrorText({ message: "Sesuatu" })).toBe("Sesuatu");
  });
  it("menerjemahkan pelanggaran constraint", () => {
    expect(dbErrorText({ message: 'violates check constraint "items_remind_days_valid"' })).toMatch(/tidak valid/);
  });
});
