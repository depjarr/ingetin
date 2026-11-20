import { describe, it, expect, vi } from "vitest";

vi.mock("../src/lib/supabase", () => ({ supabase: {} }));
const { historyForApi, proposalToRow } = await import("../src/lib/chat.js");

describe("historyForApi", () => {
  it("hanya teks, lampiran & usulan jadi catatan singkat", () => {
    const out = historyForApi([
      { role: "user", text: "", attachmentName: "stnk.jpg" },
      {
        role: "assistant",
        text: "Ini usulanku",
        proposals: [{ type: "create", item: { name: "STNK Motor" }, status: "tersimpan" }],
      },
      { role: "assistant", text: "" },
    ]);
    expect(out).toEqual([
      { role: "user", text: "[lampiran: stnk.jpg]" },
      { role: "assistant", text: "Ini usulanku\n[usulan: STNK Motor (tersimpan)]" },
    ]);
  });

  it("maksimal 20 pesan terakhir", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ role: "user", text: `m${i}` }));
    const out = historyForApi(many);
    expect(out).toHaveLength(20);
    expect(out[0].text).toBe("m10");
  });
});

describe("proposalToRow", () => {
  it("usulan baru → baris items, nominal dibuang untuk dokumen", () => {
    const row = proposalToRow({
      type: "create",
      item: { kind: "dokumen", name: "SIM A", due_date: "2029-05-01", repeat: "5yearly", remind_days: [30, 7], amount: 100, note: null },
    });
    expect(row).toEqual({ kind: "dokumen", name: "SIM A", due_date: "2029-05-01", repeat: "5yearly", remind_days: [30, 7], amount: null, note: null });
  });

  it("usulan ubah → hanya field yang berubah", () => {
    expect(proposalToRow({ type: "update", item_id: "x", changes: { due_date: "2027-01-01" } })).toEqual({ due_date: "2027-01-01" });
  });
});
