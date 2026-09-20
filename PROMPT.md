# PROMPT — Notifin (Jalur A: lanjutan dari Emergent → GitHub → Claude Code)

Tempel/paste seluruh isi file ini ke sesi Claude Code baru yang working directory-nya adalah folder ini
(`F:\Claude\SakuAman`), lalu minta Claude Code mengeksekusinya langkah demi langkah.

## Konteks

Notifin adalah aplikasi pelacak subscription (langganan digital) untuk pasar Indonesia — freemium:
Free = maksimal 3 subscription aktif + reminder push, Premium = unlimited + reminder WhatsApp + Family/Group Sharing.

Versi produksi aslinya **sudah pernah dibangun**: mulai dari platform no-code **Emergent.sh** (di-scaffold dari sebuah
design brief), lalu source code-nya disimpan/dilanjutkan sebagai repo GitHub biasa, dan sejak itu **seluruh
pengembangan lanjutan dilakukan lewat Claude Code** (fitur baru, integrasi payment, perbaikan bug — bukan lagi lewat
Emergent's builder). Jalur A ini mereplikasi proses itu apa adanya: kita **pakai ulang repo asli** sebagai titik
awal (checkpoint "hasil Emergent"), lalu melanjutkan semua pekerjaan berikutnya dengan Claude Code — persis seperti
riwayat aslinya. Ini jauh lebih hemat token/waktu daripada menulis ulang ~4.400 baris backend + puluhan layar
frontend dari nol via prompt teks.

Repo asli: `https://github.com/artosppal/Emergent-App` (privately owned oleh user — pastikan Anda login `gh`/git
dengan akun yang punya akses sebelum clone).

## Langkah kerja

### Fase 0 — Ambil checkpoint "hasil Emergent"

1. Di dalam folder ini, clone repo asli sebagai titik awal:
   ```bash
   git clone https://github.com/artosppal/Emergent-App.git .
   ```
   (Kalau ingin riwayat git yang bersih/repo baru terpisah dari yang lama: buat repo GitHub kosong baru dulu,
   `git clone` repo lama ke folder sementara, hapus folder `.git` lama, `git init` ulang, `git remote add origin
   <repo-baru>`, commit semuanya sebagai "Initial import from Emergent-scaffolded Notifin", lalu push.)
2. Baca `README.md`, `memory/PRD.md`, `design_guidelines.json`, dan `docs/email-otp.md` untuk konteks tambahan yang
   sudah ada di repo — jangan tulis ulang dokumen ini dari nol, itu sudah akurat.
3. Verifikasi struktur cocok dengan ringkasan teknis di bagian **Lampiran: Spesifikasi Teknis Lengkap** di bawah.
   Kalau ada perbedaan (karena repo asli terus berkembang), ikuti kode yang sebenarnya ada di repo, bukan lampiran
   ini — lampiran ini adalah snapshot per 2026-09-19.

### Fase 1 — Setup environment lokal

1. **Backend**: `cd backend`, buat virtualenv, `pip install -r requirements.txt`.
2. Buat `backend/.env` (tidak ikut ter-commit) berisi minimal:
   ```
   MONGO_URL=mongodb://localhost:27017
   DB_NAME=notifin_dev
   JWT_SECRET=<random string>
   ADMIN_PASSWORD=<password admin panel pilihan Anda>
   ```
   Variabel lain (lihat tabel env var di lampiran) boleh dikosongkan dulu — setiap integrasi punya "simulation
   mode" otomatis kalau env var-nya kosong (WA/email tercatat di log/DB tapi tidak benar-benar terkirim, endpoint
   Mayar mengembalikan 503).
3. Jalankan MongoDB lokal (Docker: `docker run -d -p 27017:27017 mongo`) atau pakai MongoDB Atlas gratis.
4. Jalankan backend: `uvicorn server:app --reload --port 8000` (dari dalam `backend/`).
5. **Frontend**: `cd frontend`, `npm install`, buat `.env` berisi `EXPO_PUBLIC_BACKEND_URL=http://localhost:8000`.
6. Jalankan `npm run web` (atau `npx expo start --web`) dan pastikan halaman landing/login termuat, register akun
   test, tambah subscription, cek dashboard — pastikan alur inti jalan sebelum melangkah lebih jauh.
7. Jalankan test suite backend: `cd backend && pytest` (lihat `pytest.ini` — sudah dikonfigurasi `-n 2
   --dist loadscope`, jangan diubah tanpa alasan kuat). Semua 3 file test (`test_notifin_backend.py`,
   `test_notifin_fase3.py`, `test_notifin_groups.py`) harus lulus terhadap MongoDB lokal Anda.

### Fase 2 — Putuskan nasib integrasi khusus-Emergent

Ada satu bagian kode yang secara harfiah bergantung pada infrastruktur platform Emergent: **push notification**
(`EMERGENT_PUSH_KEY`, endpoint `https://integrations.emergentagent.com`, fungsi `send_push()` /
`/api/register-push` di `backend/server.py`). Ini bukan API publik — kalau Anda tidak lagi punya akun/API key
Emergent yang aktif untuk proyek baru ini, push tidak akan berfungsi.

Pilih salah satu, lalu minta Claude Code mengerjakannya:
- **(a)** Anda masih punya akses Emergent → biarkan kode ini apa adanya, cukup isi `EMERGENT_PUSH_KEY` di `.env`.
- **(b)** Tidak punya akses Emergent lagi → minta Claude Code mengganti `send_push()`/`/api/register-push` untuk
  memakai **Expo Push Notification Service** (gratis, native untuk app Expo — `expo-server-sdk-python` atau
  panggilan HTTP langsung ke `https://exp.host/--/api/v2/push/send`), sambil mempertahankan semua titik pemanggilan
  yang sudah ada (reminder H-3/H-1/H-0, promo reminder, group nudge) agar perilakunya sama persis dari sudut
  pandang user.

### Fase 3 — Lanjutkan pengembangan dengan Claude Code (bukan Emergent lagi)

Dari titik ini, semua pekerjaan berikutnya dilakukan lewat Claude Code seperti riwayat aslinya. `memory/PRD.md` di
repo mencatat backlog resmi ("P1 FASE 4"): payment gateway (sudah beres — pakai Mayar.id, PRD-nya sedikit basi di
poin ini, abaikan sebutan Midtrans/Xendit), pricing page, onboarding survey (sudah ada), ringkasan
mingguan/bulanan via email, social share, dan program referral. Prioritaskan sesuai kebutuhan Anda, bukan harus
urut.

Kalau tujuan Anda memang sekadar *punya salinan kerja yang bisa terus dikembangkan lewat Claude Code* (tanpa
menambah fitur baru dulu), Fase 3 ini cukup berhenti di: pastikan semuanya jalan lokal, commit, push ke repo baru,
lalu deploy (lihat Fase 4).

### Fase 4 — Deploy (opsional, ulangi topologi asli)

- **Frontend** → Vercel: import repo, root directory `frontend/`, set env var `EXPO_PUBLIC_BACKEND_URL` ke URL
  backend Railway Anda. `frontend/vercel.json` sudah berisi rewrite rule SPA yang dibutuhkan.
- **Backend** → Railway: deploy dari `backend/` (Railway auto-detect `requirements.txt`, jalankan
  `uvicorn server:app --host 0.0.0.0 --port $PORT`), isi semua env var produksi (lihat tabel di lampiran) lewat
  dashboard Railway, dan sambungkan MongoDB (Atlas atau plugin Mongo Railway).
- Domain custom, verifikasi DNS Resend, registrasi webhook Mayar, dsb mengikuti catatan di `docs/email-otp.md` dan
  isi memori proyek — ini semua proses manual di dashboard masing-masing layanan, bukan sesuatu yang Claude Code
  bisa lakukan otomatis.

---

## Lampiran: Spesifikasi Teknis Lengkap (snapshot repo per 2026-09-19)

> Referensi ini untuk verifikasi/pemahaman konteks — sumber kebenaran tetap kode yang ada di repo hasil clone.

### Stack
- Frontend: Expo SDK 54, React Native 0.81.5, React 19.1.0, Expo Router 6 (file-based routing), web export via
  Metro (`output: "single"`), deploy Vercel.
- Backend: FastAPI single-file (`backend/server.py`, ~4.400 baris) + MongoDB via Motor (async), deploy Railway.
- Payment: Mayar.id (Indonesian gateway, Membership API v2).
- Email OTP: Resend HTTPS API (bukan SMTP — Railway memblokir port SMTP outbound).
- WhatsApp: Fonnte API (OTP + reminder + nudge).
- Push: Emergent push relay (lihat Fase 2 di atas untuk opsi ganti Expo Push).
- Google OAuth: PKCE langsung ke Google (tanpa proxy).

### Struktur Frontend (`frontend/`)
```
app/
  _layout.tsx            Root Stack + auth gate + notification handling
  index.tsx               "/" — landing page (web logged-out) / splash+redirect (native)
  onboarding.tsx           4 pertanyaan survei + tour 3-4 slide
  spending-history.tsx     Chart pengeluaran bulanan/tahunan
  (auth)/{login,privacy,terms}.tsx
  (tabs)/{index,subscriptions,groups,account}.tsx   Bottom tabs (native/mobile web) / Sidebar (web >=900px)
  group/{[id],add-sub,history}.tsx
  subscription/form.tsx
src/
  components/{SubscriptionCard,ui,landing/LandingPage,layout/Sidebar}.tsx
  constants/{categories,presets}.ts     11 kategori, 16 preset layanan populer ID (harga IDR asli)
  context/{AuthContext,LanguageContext,ToastContext,UpgradeContext}.tsx
  lib/api.ts               Typed API client, base URL dari EXPO_PUBLIC_BACKEND_URL, token Bearer
  theme/index.ts            Design tokens (lihat bawah)
  i18n/translations.ts      id/en, default id
  utils/{notifications.ts, storage/*}
```

### Design tokens
- Warna brand: `#059669` (emerald), surface `#F7FAF8`, teks `#182924`; kategori sengaja hindari merah/kuning/hijau
  (dipakai khusus status finansial).
- Font: Plus Jakarta Sans (Regular/Medium/SemiBold/Bold/ExtraBold), skala sm12/base14/lg16/xl20/2xl24(/3xl30/4xl38).
- Spacing 4/8/12/16/24/32/48, radius sm6/md12/lg20/pill999, shadow tier 2.
- Glassmorphism HANYA di bottom tab bar, sticky header, FAB — jangan di card/input/list row.
- Icon set: `@expo/vector-icons` MaterialCommunityIcons (catatan: `design_guidelines.json` menyebut Phosphor, tapi
  implementasi asli pakai MaterialCommunityIcons — pertahankan MaterialCommunityIcons demi konsistensi dengan kode
  yang sudah ada).
- Haptics: light di tap tombol/tab, medium di prompt freemium, success saat subscription berhasil ditambah.

### Layar & alur kunci
- **Login/Register** (`(auth)/login.tsx`): satu komponen, state machine mode
  (`login|register|wa-register|wa-login|verify-email|verify-wa-register|verify-wa-login`), OTP resend cooldown 45s,
  Google OAuth via `expo-auth-session` PKCE.
- **Onboarding**: 4 pertanyaan (use_case, sub_range, referral_source, primary_goal) → tour 3-4 slide → POST
  `/api/onboarding`.
- **Dashboard**: greeting time-aware, kartu total spend + progress bar limit bulanan, kartu Promo (Premium-only,
  ada "remind me later"), "Sorotan Boros" (sub termahal + trial berakhir ≤14 hari), "Mendekati Jatuh Tempo" (7
  hari ke depan), breakdown per kategori.
- **Subscription List**: filter kategori (11) + status (all/active/trial), badge jumlah aktif.
- **Add/Edit Subscription** (`subscription/form.tsx`): name, category, price, billing_cycle
  (weekly/monthly/yearly), status (paid/trial), next_due_date, reminders (multi-select offset hari, default
  `[3,1,0]`), notes, `registered_with` (bedakan 2 akun Netflix misalnya), quick-pick dari `presets.ts`.
- **Groups** (Premium-only create, join via kode 6 karakter untuk semua plan): list, detail (member, split
  equal/custom, toggle bayar, nudge, invite code), add-sub, history (12 periode terakhir).
- **Account/Settings**: status Premium (cancel/resume `cancel_at_period_end`), channel notifikasi (push selalu
  aktif, WA butuh verifikasi nomor + kuota bulanan Free), modal nomor HP + OTP WA, limit budget bulanan, toggle
  bahasa, **alur downgrade 3 langkah**: konfirmasi → alasan (too_expensive/rarely_used/missing_features/
  switching_app/just_trying/other) → penawaran retensi (diskon tier 3/6/12 bulan) sebelum benar-benar cancel.
- **Upgrade/Paywall** (`UpgradeContext.tsx`, bottom sheet global via `@gorhom/bottom-sheet`): plan (bulanan
  Rp19.000 / tahunan Rp149.000) → phone (wajib WA number) → otp → panggil `/auth/upgrade` → buka checkout URL
  Mayar (dibuka sinkron sebelum `await` untuk menghindari popup blocker).
- **Landing Page**: marketing site (nav Fitur/Cara Kerja/Harga, hero, features, how-it-works, pricing) — hanya web
  logged-out.

### Backend — endpoint (grup)

**Auth**: `POST /api/auth/register`, `/register/verify`, `/register/resend`, `/register/whatsapp`,
`/register/whatsapp/verify`, `/register/whatsapp/resend`, `/login`, `/login/whatsapp/request`,
`/login/whatsapp/verify`, `/session` (Google), `GET /me`, `POST /logout`, `POST /api/onboarding`.

**Billing/Mayar**: `POST /auth/upgrade`, `POST /webhooks/mayar?secret=...` (satu-satunya tempat plan benar-benar
berubah, dicek `secrets.compare_digest`), `POST /test/simulate-mayar-webhook`, `POST /auth/downgrade`,
`/auth/resume-subscription`, `/auth/downgrade/feedback`, `/auth/downgrade/retention-offer`.

**Account**: `PUT /auth/channels`, `PUT /auth/phone`, `POST /auth/phone/verify/request`,
`/auth/phone/verify/confirm`, `PUT /auth/limit`.

**Subscriptions**: `GET/POST /subscriptions` (limit Free = 3 aktif, 403 `limit_reached`), `GET/PUT/DELETE
/subscriptions/{id}` (soft delete).

**Promo/What's New**: `GET /promos` (Premium-only, URL tidak dikirim ke client), `GET /promos/{id}/go` (redirect
302 publik), `POST /promos/{id}/remind`, `GET /whats-new`.

**Dashboard/Analytics**: `GET /dashboard`, `GET /analytics/spending?range=monthly|yearly`.

**Groups**: `POST/GET /groups`, `POST /groups/join`, `GET /groups/{id}`, `POST /groups/{id}/leave`, `DELETE
/groups/{id}`, `POST/PUT/DELETE /groups/{id}/subscriptions[/{sid}]`, `PUT
/groups/{id}/subscriptions/{sid}/pay`, `POST .../nudge` (rate limit 1x/hari), `GET /groups/{id}/history`.

**WA test**: `POST /test/send-reminder`. **Push**: `POST /register-push`. **Health**: `GET /api/`.

**Admin** (JWT admin terpisah, password tunggal via `ADMIN_PASSWORD`): `POST /admin/login`, `GET
/admin/users?query=&trash=`, `GET /admin/stats`, `POST /admin/set-plan`, `/admin/create-user`,
`/admin/delete-user`, `/admin/restore-user`, `/admin/purge-user`, `/admin/edit-trashed-contact`, `GET/POST/DELETE
/admin/promos[/{id}]`, `GET/POST/DELETE /admin/whats-new[/{id}]`, `POST /admin/export` (xlsx via openpyxl), dan
`GET /admin` (di luar `/api`, HTML admin panel).

### Data model MongoDB (koleksi utama)
`users`, `user_sessions`, `otp_codes`, `subscriptions`, `groups`, `group_subscriptions`, `spending_snapshots`,
`mayar_webhook_log`, `downgrade_feedback`, `promo_recommendations`, `promo_reminders`, `whats_new`, `notif_log`,
`wa_outbox` — field lengkap tiap koleksi ada di kode `backend/server.py` (cari `db.<nama_koleksi>`), tidak
memakai ODM, validasi lewat Pydantic di boundary API saja.

### Auth mechanism
- Session user: JWT `HS256` tapi validasi aktual lewat lookup dokumen sesi di `user_sessions` (bukan verifikasi
  signature JWT tiap request) — 7 hari (`SESSION_DAYS`). Password di-hash `bcrypt` langsung (bukan passlib).
- Admin: JWT sungguhan (`{admin:true}`, exp 12 jam), diverifikasi via `jwt.decode`, satu password bersama
  (`ADMIN_PASSWORD`), tanpa tabel user admin.

### Admin panel (`ADMIN_PAGE_HTML`)
Satu string Python raksasa (`~1.550` baris, di sekitar baris 2772–4318 `backend/server.py`) berisi HTML+CSS+JS
inline lengkap, disajikan via `HTMLResponse` di `GET /admin` — bukan bagian dari app Expo, tanpa framework/bundler
JS. Fitur: login password, dark mode (`localStorage` `notifin_admin_theme`, sinkron sebelum paint), dashboard 4
stat card + bar chart 6 bulan + donut chart (hand-rolled, tanpa chart library), tabel akun (search, tab
Aktif/Sampah, filter plan, sort kolom, pagination, bulk select), column picker (`localStorage`
`notifin_admin_cols`), form tambah akun, export xlsx (`build_users_xlsx`, header hijau brand, autofilter, freeze
header), trash/soft-delete + purge dengan konfirmasi re-type email, plus 2 tab manajemen konten (Rekomendasi Promo,
Apa yang Baru).

### Environment variables

| Variable | Fungsi | Default jika kosong |
|---|---|---|
| `MONGO_URL`, `DB_NAME` | Koneksi MongoDB | wajib diisi |
| `JWT_SECRET` | Signing session/admin JWT | `notifin-dev-secret` |
| `EMERGENT_PUSH_KEY` | Push relay Emergent (lihat Fase 2) | `placeholder` |
| `GOOGLE_CLIENT_ID`/`SECRET` | Google OAuth | kosong → `/auth/session` 503 |
| `FONNTE_TOKEN` | WhatsApp API | kosong → mode simulasi |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email OTP | kosong → mode simulasi |
| `MAYAR_API_KEY`, `MAYAR_PRODUCT_ID`, `MAYAR_TIER_ID` | Payment | kosong → 503 |
| `MAYAR_RETENTION_3M_ID`/`6M_ID`/`12M_ID` | Tier diskon retensi | kosong → 503 |
| `MAYAR_WEBHOOK_SECRET` | Query-param secret webhook | kosong → webhook selalu 401 |
| `ADMIN_PASSWORD` | Login admin panel | kosong → 503 |

Frontend: `EXPO_PUBLIC_BACKEND_URL`, `EXPO_PUBLIC_GOOGLE_CLIENT_ID`.

### CORS & scheduler
CORS dikunci ke origin Vercel + `notifin.online`/`www.notifin.online`. Startup event bikin semua index Mongo +
backfill `onboarding_completed` + jalankan `scheduler_loop()` (loop tiap 30 menit: `reminder_sweep()`,
`expire_premiums_sweep()`, `promo_reminder_sweep()`, masing-masing try/except independen).

### Testing
`backend/tests/` (pytest, `pytest.ini` pakai `-n 2 --dist loadscope` — jangan diubah tanpa alasan kuat):
`test_notifin_backend.py` (health/auth/subscriptions/freemium/dashboard/channels/push), `test_notifin_fase3.py`
(phone normalize, nudge, group history, reminder sweep), `test_notifin_groups.py` (create/join/CRUD/pay/leave).
