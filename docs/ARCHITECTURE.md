# SakuAman — Peta Arsitektur Basis Kode (Langkah 3)

Per `sakuaman-prompt-pack.md` Langkah 3. Kode ini diwarisi dari Notifin (subscription tracker) —
lihat `PROMPT.md` (proses replikasi awal) dan `memory/PRD.md` (ringkasan + status deploy SakuAman)
untuk konteks tambahan. Dokumen ini fokus ke **detail teknis** yang belum tercakup di situ: model
data lengkap, daftar endpoint penuh, mesin reminder, dan — paling penting — kategorisasi apa yang
bisa dipakai apa adanya / perlu dirombak / dibuang untuk SakuAman.

Tidak ada kode yang diubah untuk menulis dokumen ini.

---

## 1. Stack, struktur folder, deploy saat ini

**Stack:**
- Frontend: Expo SDK 54 + Expo Router 6 (file-based routing, folder `app/`), React Native 0.81 + React 19, web export via Metro (`output: "single"`, jadi SPA sungguhan — satu `index.html`, routing di client).
- Backend: FastAPI single-file (`backend/server.py`, ~4700 baris), MongoDB via Motor (async driver), tanpa ODM — validasi cuma di boundary API pakai Pydantic.
- Auth: JWT (HS256) tapi validasi request sungguhan lewat lookup dokumen sesi di `user_sessions` (bukan verifikasi signature tiap request). Password di-hash bcrypt langsung.

**Struktur folder:**
```
backend/
  server.py          — seluruh backend (routes, models, scheduler, admin panel HTML inline)
  Procfile           — start command eksplisit buat Railway
  requirements.txt
  tests/             — 3 file, 66 test, pytest + pytest-xdist
frontend/
  app/               — routing (expo-router)
  src/
    components/      — UI + landing page pieces
    context/          — Auth, Language, Toast, Upgrade (React context)
    lib/api.ts        — typed API client, satu tempat semua panggilan backend
    i18n/translations.ts — semua string UI, id+en, flat key-value per section
    constants/        — kategori, preset layanan (16 layanan populer ID)
    theme/            — design tokens (warna, font, spacing)
    content/blog.ts    — 4 artikel blog, bundled at build time
  public/             — sitemap.xml, robots.txt (static, di luar app router)
docs/                 — dokumen ini + email-otp.md (setup Resend)
memory/PRD.md         — project memory utama, dibaca tiap sesi Claude Code baru
```

**Deploy saat ini** (lihat `memory/PRD.md` bagian "Deployment" untuk detail lengkap):
- Backend → Railway (`sakuaman-backend`), start command dari `Procfile`, deploy manual via `railway up` (tidak auto-deploy dari GitHub).
- Frontend → Vercel (`notifin/sakuaman`), build `expo export -p web`, **auto-deploy dari push ke `main`** (connected saat `vercel link`).
- Database → MongoDB Atlas, cluster sama dengan dev lokal, database `sakuaman_prod` (produksi) / `sakuaman_dev` atau `notifin_dev` (lokal, tergantung `.env`).

---

## 2. Model data (16 koleksi MongoDB)

Tidak ada skema tegas di level database (Mongo schemaless) — field di bawah ini yang benar-benar
ditulis/dibaca kode saat ini.

| Koleksi | Isi | Field kunci |
|---|---|---|
| `users` | Akun pengguna | `user_id`, `email`, `phone`, `password_hash`, `plan` (free/premium), `premium_expires_at`, `notify_channels` {push, whatsapp}, `monthly_limit`, `referral_code`, `referred_by`, `onboarding_completed`, `deleted_at` (soft delete) |
| `user_sessions` | Sesi login aktif | `session_token` (unique), `user_id`, `expires_at` — **ini yang divalidasi tiap request**, bukan JWT signature |
| `otp_codes` | Kode OTP sementara (register email/WA, login WA, reset password, verifikasi HP) | `purpose`, `key` (email/phone/user_id tergantung purpose), `code_hash`, `payload` (data pending), `expires_at`, `attempts` |
| `subscriptions` | **Item yang dilacak per user** — ini yang di SakuAman akan diperluas jadi "tagihan/kewajiban" umum | `id`, `user_id`, `name`, `category`, `price`, `billing_cycle` (weekly/monthly/yearly), `next_due_date`, `status` (trial/paid), `reminders` (array offset hari), `deleted_at` |
| `groups` | Grup berbagi (di SakuAman: arah jadi "rumah tangga") | `id`, `name`, `owner_id`, `members` (array {user_id, name}), `invite_code` (6 char unik) |
| `group_subscriptions` | Item yang di-split dalam grup | `id`, `group_id`, `name`, `price`, `billing_cycle`, `split_type` (equal/custom), `custom_split`, `next_due_date`, per-periode paid-status (key by period) |
| `spending_snapshots` | Snapshot total pengeluaran bulanan per user, ditulis tiap kali `/dashboard` diakses | `user_id`, `period` (YYYY-MM), `total` |
| `mayar_webhook_log` | Log semua event webhook Mayar yang masuk | `event`, `customer_email`, `matched_user_id`, `action`, `received_at` |
| `downgrade_feedback` | Alasan user downgrade dari Premium | `user_id`, `reason`, `reason_other` |
| `promo_recommendations` | Konten promo (admin-managed, Premium-only) | `id`, `title`, `description`, `url` (tidak pernah dikirim ke client langsung, redirect lewat `/promos/{id}/go`) |
| `promo_reminders` | Reminder promo yang dijadwalkan user | `user_id`, `promo_id`, `remind_at`, `sent` |
| `whats_new` | Konten "apa yang baru" (admin-managed) | `id`, `title`, `description` |
| `notif_log` | Idempotency key buat semua reminder yang sudah terkirim | `key` (unique, format `<jenis>:<id>:<periode>:<offset>`) — dicek sebelum kirim apa pun |
| `wa_outbox` | Log semua pesan WhatsApp (simulasi atau live) | `phone`, `message`, `status` (simulated/sent), `created_at` |
| `push_tokens` | Token push notif per user (Expo Push) | `user_id`, `platform`, `device_token` |
| `referrals` | Relasi referrer↔referee | `id`, `referrer_user_id`, `referee_user_id` (unique — 1 referee cuma bisa direferensikan sekali), `status` (pending/completed/referrer_unavailable), `created_at`, `completed_at` |

**Relasi implisit (tidak ada foreign key sungguhan, semua dicek manual di kode):**
`subscriptions.user_id` → `users.user_id`; `groups.owner_id`/`members[].user_id` → `users.user_id`;
`group_subscriptions.group_id` → `groups.id`; `referrals.referrer_user_id`/`referee_user_id` →
`users.user_id`.

---

## 3. Daftar endpoint API (68 total)

**Auth & akun** (23): `/auth/register[+/verify][+/resend]`, `/auth/register/whatsapp[+/verify][+/resend]`,
`/auth/login`, `/auth/login/whatsapp/request[+/verify]`, `/auth/session` (Google), `/auth/me`,
`/auth/logout`, `/onboarding`, `/auth/password` (PUT), `/auth/forgot-password`, `/auth/reset-password`,
`/auth/phone` (PUT), `/auth/phone/verify/request[+/confirm]`, `/auth/limit` (PUT), `/auth/channels` (PUT).

**Billing/Mayar** (7): `/auth/upgrade`, `/webhooks/mayar`, `/test/simulate-mayar-webhook`,
`/auth/downgrade`, `/auth/resume-subscription`, `/auth/downgrade/feedback`,
`/auth/downgrade/retention-offer`.

**Referral** (1): `/referral/me`.

**Subscriptions/tagihan** (5): CRUD standar + soft delete.

**Promo/what's-new** (4): `/promos`, `/promos/{id}/go`, `/promos/{id}/remind`, `/whats-new`.

**Dashboard/analytics** (2): `/dashboard`, `/analytics/spending`.

**Groups** (11): CRUD grup + join + leave + subscriptions CRUD + pay + nudge + history.

**Push/test/health** (4): `/register-push`, `/test/send-reminder`, `/test/simulate-monthly-summary`, `/`.

**Admin** (14 endpoint + `GET /admin` HTML terpisah): login, users list, stats, set-plan,
create/delete/restore/purge user, edit-trashed-contact, promos CRUD, whats-new CRUD, export xlsx.

---

## 4. Mesin reminder

**Scheduler**: `asyncio` loop tunggal (`scheduler_loop`, dimulai saat startup), jalan tiap **30 menit**,
4 sweep independen (satu gagal tidak menghentikan yang lain):
1. `reminder_sweep()` — cek semua `subscriptions` (WA ke user premium+channel WA+HP) dan semua
   `group_subscriptions` (push ke member yang belum bayar + WA ke yang eligible), offset H-3/H-1/H-0
   (personal) atau selalu H-3/H-1/H-0 (grup, hardcoded).
2. `expire_premiums_sweep()` — flip user premium yang `premium_expires_at` sudah lewat, balik ke free.
3. `promo_reminder_sweep()` — kirim reminder promo yang dijadwalkan user.
4. `monthly_summary_sweep()` — email ringkasan bulanan ke Premium user, idempoten per bulan via
   `users.last_summary_month`.

**Idempotency**: semua reminder cek `claim_notif(key)` dulu (insert ke `notif_log`, gagal kalau key
sudah ada — insert unique-index sebagai lock) sebelum benar-benar kirim. Key selalu mengandung jenis +
id item + periode + offset, jadi aman dari kirim dobel walau sweep jalan berkali-kali.

**WhatsApp**: via Fonnte (`send_whatsapp()`), mode simulasi otomatis kalau `FONNTE_TOKEN` kosong
(pesan dicatat ke `wa_outbox` status `simulated`, tidak benar-benar terkirim). Template pesan
terpusat di `reminder_wa_message()` — headline makin "urgent" (huruf besar) makin dekat H-0.

**Push**: Expo Push Notification Service (`send_push()`), token di `push_tokens`. Tidak butuh API key
eksternal.

**Nudge**: manual trigger dari owner grup ke member yang belum bayar, rate limit 1x/hari per target
(pakai `claim_notif` dengan key yang include tanggal hari ini).

**Zona waktu**: semua tanggal `next_due_date` disimpan sebagai string `YYYY-MM-DD` (naive, tanpa
timezone) — perbandingan pakai `date.today()` server (Railway defaultnya UTC). **Risiko**: kalau
server jalan di UTC dan user di WIB (UTC+7), ada window ~7 jam di mana "hari ini" versi server dan
versi user beda — reminder H-0 bisa kekirim "kepagian" menurut waktu Jakarta. Belum ada mitigasi
eksplisit soal ini di kode.

---

## 5. Mekanisme freemium

- **Batas fitur**: Free maks 3 `subscriptions` aktif (403 `limit_reached` di endpoint create),
  Free maks 5 WA reminder/bulan (`FREE_WA_NOTIF_LIMIT`, di-reset tiap bulan kalender), Free tidak
  bisa `POST /groups` (403 `premium_required`) tapi **bisa** join grup orang lain.
- **Toggle WhatsApp**: butuh `phone_verified: true` dulu (lewat OTP) sebelum `notify_channels.whatsapp`
  bisa diaktifkan — dicek di `PUT /auth/channels` dan `POST /auth/upgrade`.
- **Satu-satunya tempat `plan` berubah jadi premium**: webhook Mayar (`process_mayar_event`,
  dipanggil dari `/webhooks/mayar` asli dan `/test/simulate-mayar-webhook`). Tidak ada jalur lain.
- **Referral**: kode unik per user (`referral_code`, dibuat saat akun dibuat, di-backfill utk akun
  lama). Reward (30 hari Premium gratis, constant `REFERRAL_REWARD_DAYS`) baru diberikan saat
  REFEREE jadi Premium (bukan saat daftar) — dicek di `complete_referral_if_any()`, dipanggil dari
  jalur webhook Mayar yang sama.
- **Downgrade**: 3 langkah (konfirmasi → alasan → penawaran retensi diskon), tapi `plan` tidak
  langsung berubah — cuma set `cancel_at_period_end: true`, baru benar-benar turun ke free lewat
  `expire_premiums_sweep()` pas `premium_expires_at` lewat.

---

## 6. Testing

`backend/tests/` — 3 file, **66 test, semua lulus** (`pytest` dari folder `backend/`, config di
`pytest.ini` sudah benar pakai `--dist loadgroup` + `xdist_group` di ketiga file test — lihat
riwayat commit "Add trust badges..." dan "Add referral program..." di `git log` untuk cerita bug
`loadscope` vs `loadgroup` yang sempat bikin flaky).

- `test_notifin_backend.py` — auth, password, monthly summary, referral, subscriptions, freemium,
  dashboard, channels, push, cleanup.
- `test_notifin_fase3.py` — phone normalize, nudge, group history, reminder sweep (langsung panggil
  fungsi Python, bukan cuma lewat HTTP).
- `test_notifin_groups.py` — grup CRUD, join, split, pay flow, leave/delete.

**Cakupan yang TIDAK ada test-nya** (perlu diperhatikan kalau dirombak): admin panel (endpoint admin
sama sekali tidak ditest), blog/FAQ/pricing page (frontend, tidak ada test otomatis sama sekali —
diverifikasi manual lewat browser tiap kali ada perubahan), email OTP delivery sungguhan (Resend),
WhatsApp delivery sungguhan (Fonnte) — keduanya cuma ditest jalur simulasi.

---

## 7. Tiga daftar — apa yang terjadi ke tiap bagian di SakuAman

### ✅ Bisa dipakai apa adanya (tidak perlu diubah struktur/logikanya)
- Seluruh sistem auth (email/WA/Google OAuth, change/forgot/reset password, session mechanism).
- Freemium engine (limit, gating, downgrade flow, referral) — SakuAman tetap freemium dengan pola
  yang sama, cuma batasnya (jumlah tagihan aktif, jumlah goal, dll) yang beda nilai, bukan beda
  mekanisme.
- Integrasi Mayar.id (payment) — tidak ada alasan ganti gateway.
- Infra WhatsApp (Fonnte) + email OTP (Resend) — persis yang diminta SakuAman jadi "saluran reminder
  utama".
- Scheduler pattern (sweep independen tiap 30 menit + idempotency via `notif_log`) — arsitekturnya
  cocok, cuma perlu sweep baru buat kebutuhan SakuAman (reminder tagihan umum sudah cocok dengan
  `reminder_sweep()` yang ada, tinggal generalisasi dari "subscription" ke "kewajiban").
- Admin panel (password-gated, HTML inline) — bisa dipakai ulang strukturnya, kontennya perlu
  disesuaikan.
- Push notification (Expo Push Service).

### 🔧 Perlu dirombak
- **Model `subscriptions`** — field `billing_cycle`/`category`/`price` sudah dekat dengan konsep
  "tagihan", tapi perlu tambahan: `jenis` (langganan/tagihan rutin/cicilan/iuran/SPP/lainnya, bukan
  cuma kategori bebas), kemungkinan `total_cicilan`/`cicilan_ke` buat cicilan, dan status lunas
  **per periode** (bukan cuma satu `status` trial/paid global) — ini beda mendasar dari cara
  `group_subscriptions` sudah menyimpan status bayar per periode, yang **bisa dicontoh polanya**.
- **Dashboard** (`/dashboard`, `total_this_month`/`by_category`/`upcoming`) — perlu diperluas jadi
  basis "Saku Aman": butuh field baru (gaji, tanggal gajian, anggaran per kategori) yang saat ini
  sama sekali tidak ada di model manapun.
- **Sistem grup** — mekanisme split/invite-code sudah pas buat "berbagi rumah tangga", tapi bahasa
  di kode & UI (nama fungsi, label) masih bertema "grup langganan patungan teman", perlu disesuaikan
  konsepnya jadi pasangan/keluarga serumah (kemungkinan cukup 1 grup per rumah tangga, bukan banyak
  grup per user).
- **Kategori** (`src/constants/categories.ts`, 11 kategori langganan digital) — perlu diganti total
  jadi kategori pengeluaran rumah tangga (listrik, air, internet, cicilan, SPP, dll).
- **Landing/pricing/blog/FAQ** — kontennya 100% masih Notifin, perlu ditulis ulang total (bukan
  cuma ganti nama, karena value proposition-nya beda).

### 🗑️ Kemungkinan dibuang (belum pasti, perlu didiskusikan di Langkah 4)
- **Preset layanan** (`src/constants/presets.ts`, 16 layanan streaming/musik populer ID) — relevan
  buat Notifin (subscription tracker), kurang relevan buat SakuAman kecuali dipertahankan sebagai
  bagian dari kategori "langganan digital" yang jadi salah satu jenis tagihan.
- **"Sorotan boros"** (most_expensive + ending_trials di dashboard) — konsep "trial berakhir" spesifik
  ke langganan digital, tidak berlaku buat tagihan listrik/cicilan. Mungkin diganti konsep lain atau
  dibuang.
- **Promo recommendations** (`promo_recommendations`, fitur "promo gratis langganan" Premium-only) —
  spesifik ke use-case subscription tracker, kemungkinan tidak relevan buat SakuAman kecuali di-reframe
  jadi sesuatu yang lain (mis. tips hemat).

---

## 8. Risiko teknis yang terlihat

1. **Zona waktu** — lihat bagian 4 di atas (tanggal disimpan naive, server default UTC, user WIB).
   Kalau SakuAman makin serius soal "reminder H-3/H-1/H-0" dan "siklus gajian", ini perlu dibereskan
   lebih awal (simpan tanggal + timezone eksplisit, atau paksa semua perhitungan pakai `Asia/Jakarta`
   di server) — makin lama ditunda, makin banyak kode yang perlu disentuh ulang.
2. **Scheduler single-process** — `asyncio` loop biasa di dalam proses FastAPI yang sama, bukan job
   queue terpisah (Celery/RQ/dll). Cukup buat skala sekarang, tapi kalau Railway scale ke >1 instance
   nanti, sweep yang sama akan jalan dobel di tiap instance (belum ada distributed lock) — cuma
   idempotency `notif_log` yang mencegah pesan dobel benar-benar terkirim, bukan mencegah kerja
   dobel/beban database dobel.
3. **`subscriptions` sebagai satu koleksi buat semua jenis kewajiban** — kalau field-nya makin
   banyak beda per jenis (cicilan butuh field beda dari langganan), koleksi ini bisa jadi "tabel
   Tuhan" (banyak field null tergantung jenis). Perlu diputuskan di Langkah 4: tetap satu koleksi
   fleksibel, atau pisah per jenis dengan field umum di parent.
4. **Tidak ada rate limiting** di endpoint publik (register, login, forgot-password) — `prompt-pack`
   Langkah 7 sudah menandai ini sebagai "pengamanan dasar" yang perlu ditambah sebelum rilis publik.
5. **Admin panel tanpa audit log** — siapa pun yang tahu `ADMIN_PASSWORD` bisa ubah plan/hapus akun
   tanpa jejak siapa yang melakukan apa kapan (cuma `notif_log`/`mayar_webhook_log` yang punya log,
   aksi admin tidak).

---

*(Ini dokumen Langkah 3. Langkah 4 — rancang `docs/DATA_MODEL.md` — akan berhenti dulu untuk
persetujuan sebelum kode apa pun ditulis, sesuai `sakuaman-prompt-pack.md`.)*
