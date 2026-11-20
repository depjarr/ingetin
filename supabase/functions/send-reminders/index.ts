// Edge Function: kirim pengingat yang jatuh hari ini (web push, cadangan email).
// Dipanggil oleh pg_cron setiap pagi (lihat supabase/setup_cron.sql).
//
// Deploy:  npx supabase functions deploy send-reminders --no-verify-jwt
// Secrets wajib:    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
// Secrets opsional: RESEND_API_KEY, EMAIL_FROM (mis. "Ingetin <pengingat@domainkamu.com>"),
//                   APP_URL (alamat PWA, untuk link di email)
//          (SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY otomatis tersedia)

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

function env(key: string): string {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Environment variable ${key} belum diisi`);
  return value;
}

const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

webpush.setVapidDetails(env("VAPID_SUBJECT"), env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
const CRON_SECRET = env("CRON_SECRET");

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "";
const EMAIL_ENABLED = Boolean(RESEND_API_KEY && EMAIL_FROM);

type Due = {
  item_id: string;
  user_id: string;
  name: string;
  kind: "dokumen" | "tagihan";
  due_date: string; // YYYY-MM-DD
  amount: number | null;
  days_before: number;
  days_left: number;
};

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
type LogRow = { item_id: string; days_before: number; due_date: string };

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function todayInJakarta(): string {
  // en-CA menghasilkan format YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function formatTanggal(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

function formatRupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

/** Pesan dihitung dari sisa hari yang SEBENARNYA (penting kalau pengingat dikirim susulan). */
function buildMessage(r: Due) {
  const tagihan = r.kind === "tagihan";
  let body: string;
  if (r.days_left > 0) {
    body = `${tagihan ? "Jatuh tempo" : "Masa berlaku habis"} ${r.days_left} hari lagi`;
  } else if (r.days_left === 0) {
    body = `${tagihan ? "Jatuh tempo" : "Masa berlaku habis"} hari ini`;
  } else {
    body = `${tagihan ? "Sudah lewat jatuh tempo" : "Sudah habis masa berlaku"} ${-r.days_left} hari`;
  }
  body += ` (${formatTanggal(r.due_date)})`;
  if (tagihan && r.amount != null) body += ` · ${formatRupiah(r.amount)}`;

  return {
    title: r.name,
    body,
    tag: `${r.item_id}-${r.due_date}`,
    url: `./?item=${r.item_id}`,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}

async function sendEmail(to: string, messages: { title: string; body: string }[]): Promise<boolean> {
  const rows = messages
    .map((m) => `<li style="margin-bottom:8px"><strong>${escapeHtml(m.title)}</strong><br>${escapeHtml(m.body)}</li>`)
    .join("");
  const link = APP_URL ? `<p><a href="${escapeHtml(APP_URL)}">Buka Ingetin</a></p>` : "";
  const html = `<p>Halo, ini pengingat dari Ingetin:</p><ul style="padding-left:18px">${rows}</ul>${link}
<p style="color:#5B6170;font-size:13px">Email ini dikirim karena notifikasi push belum aktif di perangkatmu.
Kamu bisa mematikan email pengingat di menu Pengaturan aplikasi.</p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to,
      subject: messages.length === 1 ? `Pengingat: ${messages[0].title}` : `${messages.length} pengingat dari Ingetin`,
      html,
    }),
  });
  if (!res.ok) console.error("Gagal kirim email:", res.status, await res.text());
  return res.ok;
}

/** Bandingkan secret tanpa bocor lewat perbedaan waktu (timing attack). */
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!safeEqual(req.headers.get("Authorization") ?? "", `Bearer ${CRON_SECRET}`)) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Untuk uji coba, tanggal bisa dipaksa: {"today":"2026-12-07"}
  const body = await req.json().catch(() => ({}));
  const today = typeof body?.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today)
    ? body.today
    : todayInJakarta();

  const { data: due, error } = await supabase.rpc("due_reminders", { p_today: today, p_lookback: 2 });
  if (error) return json({ error: error.message }, 500);

  const rows = (due ?? []) as Due[];
  if (rows.length === 0) return json({ today, due: 0, sent: 0, emailed: 0 });

  // Satu item bisa punya beberapa pengingat yang jatuh bersamaan (mis. susulan H-7 + H-1).
  // Kirim SATU notifikasi per item, tapi catat semuanya di log.
  const byItem = new Map<string, { latest: Due; logs: LogRow[] }>();
  for (const r of rows) {
    const entry = byItem.get(r.item_id) ?? { latest: r, logs: [] };
    if (r.days_before < entry.latest.days_before) entry.latest = r;
    entry.logs.push({ item_id: r.item_id, days_before: r.days_before, due_date: r.due_date });
    byItem.set(r.item_id, entry);
  }

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: subsData, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (subsError) return json({ error: subsError.message }, 500);

  const subsByUser = new Map<string, Sub[]>();
  for (const s of (subsData ?? []) as Sub[]) {
    const list = subsByUser.get(s.user_id) ?? [];
    list.push(s);
    subsByUser.set(s.user_id, list);
  }

  let sent = 0;
  let failed = 0;
  const deadSubs = new Set<string>();
  const delivered: LogRow[] = [];
  const emailQueue = new Map<string, { msg: ReturnType<typeof buildMessage>; logs: LogRow[] }[]>();

  for (const { latest: r, logs } of byItem.values()) {
    const msg = buildMessage(r);
    const payload = JSON.stringify(msg);
    const targets = (subsByUser.get(r.user_id) ?? []).filter((s) => !deadSubs.has(s.id));
    let deliveredOnce = false;

    await Promise.all(targets.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 * 12 }, // simpan maks 12 jam kalau HP sedang offline
        );
        deliveredOnce = true;
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          deadSubs.add(s.id); // izin dicabut / aplikasi dihapus
        } else {
          failed++;
          console.error(`Gagal kirim ke ${s.id}:`, code, (err as Error).message);
        }
      }
    }));

    if (deliveredOnce) {
      delivered.push(...logs);
    } else if (EMAIL_ENABLED) {
      const list = emailQueue.get(r.user_id) ?? [];
      list.push({ msg, logs });
      emailQueue.set(r.user_id, list);
    }
  }

  // Cadangan email: satu email per user berisi semua pengingatnya hari ini
  let emailed = 0;
  for (const [userId, entries] of emailQueue) {
    const { data, error: userErr } = await supabase.auth.admin.getUserById(userId);
    const user = data?.user;
    if (userErr || !user?.email || !user.email_confirmed_at) continue;
    if (user.user_metadata?.email_reminders === false) continue; // user mematikan email

    if (await sendEmail(user.email, entries.map((e) => e.msg))) {
      emailed++;
      for (const e of entries) delivered.push(...e.logs);
    }
  }

  if (deadSubs.size > 0) {
    const { error: delErr } = await supabase.from("push_subscriptions").delete().in("id", [...deadSubs]);
    if (delErr) console.error("Gagal hapus subscription mati:", delErr.message);
  }

  if (delivered.length > 0) {
    const { error: logErr } = await supabase.from("notification_log").upsert(delivered, {
      onConflict: "item_id,days_before,due_date",
      ignoreDuplicates: true,
    });
    if (logErr) {
      // Notifikasi sudah terkirim tapi tidak tercatat → bisa terkirim ulang besok. Laporkan sebagai error.
      console.error("Gagal mencatat notification_log:", logErr.message);
      return json({ today, due: byItem.size, sent, failed, emailed, removed: deadSubs.size, error: logErr.message }, 500);
    }
  }

  return json({ today, due: byItem.size, sent, failed, emailed, removed: deadSubs.size });
});
