import { describe, it, expect, vi, afterEach } from "vitest";
import { monthGrid, occurrences, eventsByDay, monthTitle, longDate } from "../src/lib/dates.js";
import { categorize, shade } from "../src/lib/categories.js";

afterEach(() => vi.useRealTimers());

describe("monthGrid", () => {
  it("6 minggu, mulai Senin", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-20T09:00:00"));
    const g = monthGrid(2026, 10); // November 2026, tgl 1 = Minggu
    expect(g).toHaveLength(42);
    expect(g[0].iso).toBe("2026-10-26"); // Senin sebelum 1 Nov
    expect(g[6]).toMatchObject({ iso: "2026-11-01", inMonth: true });
    expect(g.find((c) => c.isToday).iso).toBe("2026-11-20");
    expect(monthTitle(2026, 10)).toBe("November 2026");
  });
});

describe("occurrences", () => {
  it("tagihan bulanan diproyeksikan tiap bulan", () => {
    const item = { due_date: "2026-11-25", repeat: "monthly" };
    expect(occurrences(item, "2026-11-01", "2027-01-31")).toEqual([
      { iso: "2026-11-25", projected: false },
      { iso: "2026-12-25", projected: true },
      { iso: "2027-01-25", projected: true },
    ]);
  });
  it("akhir bulan tidak bergeser (31 Jan → 28 Feb → 31 Mar)", () => {
    const item = { due_date: "2027-01-31", repeat: "monthly" };
    expect(occurrences(item, "2027-02-01", "2027-03-31").map((o) => o.iso)).toEqual(["2027-02-28", "2027-03-31"]);
  });
  it("sekali saja tidak diproyeksikan", () => {
    expect(occurrences({ due_date: "2026-12-02", repeat: "none" }, "2026-12-01", "2027-12-31")).toHaveLength(1);
  });
  it("eventsByDay mengelompokkan per tanggal", () => {
    const map = eventsByDay([
      { id: 1, due_date: "2026-11-25", repeat: "monthly" },
      { id: 2, due_date: "2026-11-25", repeat: "none" },
    ], "2026-11-01", "2026-12-31");
    expect(map["2026-11-25"]).toHaveLength(2);
    expect(map["2026-12-25"][0].projected).toBe(true);
  });
  it("tanggal panjang", () => {
    expect(longDate("2026-11-25")).toBe("Rabu, 25 November 2026");
  });
});

describe("kategori", () => {
  it("menebak dari nama", () => {
    expect(categorize({ name: "STNK Honda Beat", kind: "dokumen" }).id).toBe("kendaraan");
    expect(categorize({ name: "SIM A", kind: "dokumen" }).id).toBe("identitas");
    expect(categorize({ name: "BPJS Kesehatan", kind: "tagihan" }).id).toBe("kesehatan");
    expect(categorize({ name: "Listrik PLN", kind: "tagihan" }).id).toBe("listrik");
    expect(categorize({ name: "Internet IndiHome", kind: "tagihan" }).id).toBe("internet");
    expect(categorize({ name: "Sesuatu", kind: "tagihan" }).id).toBe("tagihan");
    expect(categorize({ name: "Sesuatu", kind: "dokumen" }).id).toBe("dokumen");
  });
  it("shade menggelapkan warna", () => {
    expect(shade("#FFFFFF", -0.5)).toBe("#808080");
  });
});
