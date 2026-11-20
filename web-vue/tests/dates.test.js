import { describe, it, expect, vi, afterEach } from "vitest";
import { addMonths, nextDueDate, daysUntil, badgeFor, filterItems, remindLabel, formatDate } from "../src/lib/dates.js";

afterEach(() => vi.useRealTimers());
const setToday = (iso) => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${iso}T09:00:00`)); };

describe("addMonths", () => {
  it("tidak loncat di akhir bulan", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29"); // kabisat
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-03-10", 60)).toBe("2031-03-10");
  });
});

describe("nextDueDate", () => {
  it("maju satu periode kalau belum lewat", () => {
    setToday("2026-11-20");
    expect(nextDueDate({ due_date: "2026-11-25", repeat: "monthly" })).toBe("2026-12-25");
    expect(nextDueDate({ due_date: "2026-12-14", repeat: "yearly" })).toBe("2027-12-14");
  });
  it("melompati periode yang sudah lewat", () => {
    setToday("2026-11-20");
    expect(nextDueDate({ due_date: "2026-08-05", repeat: "monthly" })).toBe("2026-12-05");
  });
});

describe("daysUntil & badgeFor", () => {
  it("menghitung sisa hari", () => {
    setToday("2026-11-20");
    expect(daysUntil("2026-11-20")).toBe(0);
    expect(daysUntil("2026-11-27")).toBe(7);
    expect(daysUntil("2026-11-18")).toBe(-2);
  });
  it("warna badge sesuai urgensi", () => {
    expect(badgeFor(-2)).toEqual({ text: "Terlewat 2 hari", cls: "red" });
    expect(badgeFor(0).cls).toBe("red");
    expect(badgeFor(7).cls).toBe("red");
    expect(badgeFor(20).cls).toBe("orange");
    expect(badgeFor(31).cls).toBe("green");
  });
});

describe("remindLabel & formatDate", () => {
  it("label pengingat", () => {
    expect(remindLabel(7)).toBe("H-7");
    expect(remindLabel(0)).toBe("Hari H");
    expect(remindLabel(-3)).toBe("H+3");
  });
  it("format tanggal Indonesia", () => {
    expect(formatDate("2026-12-14")).toBe("14 Des 2026");
  });
});

describe("filterItems", () => {
  const items = [
    { id: 1, kind: "dokumen", name: "STNK Motor", note: null, due_date: "2026-12-10" },
    { id: 2, kind: "tagihan", name: "Listrik PLN", note: "token", due_date: "2026-11-15" },
    { id: 3, kind: "dokumen", name: "Paspor", note: "perpanjang di Imigrasi", due_date: "2027-06-01" },
  ];
  it("cari nama dan catatan, tidak peka huruf besar", () => {
    setToday("2026-11-20");
    expect(filterItems(items, { query: "stnk" }).map((i) => i.id)).toEqual([1]);
    expect(filterItems(items, { query: "imigrasi" }).map((i) => i.id)).toEqual([3]);
  });
  it("filter jenis dan status", () => {
    setToday("2026-11-20");
    expect(filterItems(items, { kind: "tagihan" }).map((i) => i.id)).toEqual([2]);
    expect(filterItems(items, { status: "overdue" }).map((i) => i.id)).toEqual([2]);
    expect(filterItems(items, { status: "soon" }).map((i) => i.id)).toEqual([1]);
  });
});

import { groupByMonth, summarize, countdown, urgency, longToday, greeting } from "../src/lib/dates.js";

describe("beranda", () => {
  const items = [
    { id: 1, kind: "tagihan", name: "PLN", due_date: "2026-11-15", amount: 300000 },
    { id: 2, kind: "tagihan", name: "Internet", due_date: "2026-11-25", amount: 350000 },
    { id: 3, kind: "dokumen", name: "SIM", due_date: "2026-12-02", amount: null },
    { id: 4, kind: "dokumen", name: "Paspor", due_date: "2027-06-01", amount: null },
  ];

  it("groupByMonth: yang lewat di atas, lalu per bulan", () => {
    setToday("2026-11-20");
    const g = groupByMonth(items);
    expect(g.map((x) => x.label)).toEqual(["Sudah lewat", "November 2026", "Desember 2026", "Juni 2027"]);
    expect(g[0].items.map((i) => i.id)).toEqual([1]);
  });

  it("summarize: titik 30 hari, tagihan bulan ini, terlewat", () => {
    setToday("2026-11-20");
    const s = summarize(items);
    expect(s.next.map((i) => i.id)).toEqual([2, 3, 4]);
    expect(s.dots[5]).toBe(1);
    expect(s.dots[12]).toBe(1);
    expect(s.soonCount).toBe(2);
    expect(s.weekCount).toBe(1);
    expect(s.billsCount).toBe(2);
    expect(s.billsTotal).toBe(650000);
    expect(s.overdueCount).toBe(1);
  });

  it("countdown & urgency", () => {
    expect(countdown(0).value).toBe("Hari ini");
    expect(countdown(1).value).toBe("Besok");
    expect(countdown(12)).toEqual({ value: "12", unit: "hari lagi" });
    expect(countdown(-3)).toEqual({ value: "3", unit: "hari terlewat" });
    expect(urgency(-1)).toBe("hot");
    expect(urgency(20)).toBe("warm");
    expect(urgency(60)).toBe("calm");
  });

  it("tanggal panjang & sapaan", () => {
    expect(longToday(new Date(2026, 10, 20, 8))).toBe("Jumat, 20 November");
    expect(greeting(new Date(2026, 10, 20, 8))).toBe("Selamat pagi");
    expect(greeting(new Date(2026, 10, 20, 20))).toBe("Selamat malam");
  });
});

import { formatRupiahShort } from "../src/lib/dates.js";
describe("formatRupiahShort", () => {
  it("ringkas", () => {
    expect(formatRupiahShort(697000)).toBe("Rp 697 rb");
    expect(formatRupiahShort(1250000)).toBe("Rp 1,3 jt");
    expect(formatRupiahShort(15000000)).toBe("Rp 15 jt");
    expect(formatRupiahShort(500)).toBe("Rp 500");
  });
});
