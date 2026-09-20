# SakuAman — Product Requirements (PRD)

## Original Problem Statement
SakuAman — aplikasi pengelolaan keuangan rumah tangga (Web App, berbahasa Indonesia): langganan, tagihan, iuran, arisan, tabungan, dan bayaran anak — supaya pengguna tidak telat bayar, uang tidak keburu habis di akhir bulan, bisa menabung, bisa memprediksi kondisi keuangan ke depan, dan bisa membuat goal keuangan. Model bisnis: freemium.

Beda dengan Notifin (aplikasi asal basis kode repo ini — lihat "Asal-usul basis kode" di bawah): Notifin cuma fokus pengingat langganan/trial. SakuAman mencakup seluruh keuangan rumah tangga, dengan reminder WhatsApp sebagai salah satu saluran utama.

## Core v1 — arah pengembangan (belum semua diimplementasi per 2026-09-20)
1. **Tagihan dan langganan** — semua kewajiban rutin (langganan, listrik/air/internet, cicilan, iuran, SPP/bayaran anak) dengan pengulangan, status lunas per periode, reminder bertingkat (H-3, H-1, hari-H) lewat WhatsApp.
2. **Anggaran dan catat transaksi** — pemasukan/pengeluaran dicatat cepat, anggaran bulanan model amplop per kategori.
3. **"Saku Aman"** (nama app diambil dari fitur ini) — sisa uang yang aman dipakai hari ini dan sampai gajian, setelah dikurangi tagihan yang jatuh tempo, plus peringatan "uang diperkirakan habis tanggal X" (proyeksi sederhana, tanpa AI).
4. **Siklus gajian** — bulan keuangan mengikuti tanggal gajian pengguna, bukan tanggal 1-31 kalender.
5. **Tabungan dan goal** — target, tenggat, progress, saran setoran per bulan; dana tagihan tahunan (THR, SPP tahunan, PBB, asuransi) dipecah jadi tabungan bulanan.
6. **Arisan** — modul opsional di belakang feature flag, nonaktif secara default.

Freemium: reminder WhatsApp gratis dengan kuota bulanan, sisanya premium. Referral program dan pembatasan toggle WhatsApp dari basis kode (Notifin) tetap dipakai apa adanya.

## Asal-usul basis kode
Kode SakuAman berawal dari **Notifin** (subscription tracker — di-scaffold di Emergent.sh, dilanjutkan via Claude Code; lihat `PROMPT.md` untuk proses replikasinya). Repo ini (`github.com/artosppal/SakuAman`) punya riwayat git **bersih** (initial import 2026-09-20) — sengaja dipisah total dari `github.com/artosppal/Emergent-App`, yang masih deploy ke `notifin.online` dan tidak terpengaruh apa pun yang terjadi di sini.

**Diwariskan dari Notifin dan tetap relevan:**
- Auth lengkap: email/password + Google OAuth (PKCE) + WhatsApp OTP, termasuk change/forgot/reset password.
- Model freemium + integrasi pembayaran Mayar.id.
- Infra reminder WhatsApp (Fonnte) — akan jadi saluran utama SakuAman.
- Sistem grup (create/join/split tagihan) — akan diarahkan ulang jadi "berbagi rumah tangga" (suami-istri/keluarga), bukan cuma family-plan langganan.
- Program referral, admin panel, scheduler (reminder sweep tiap 30 menit), email OTP (Resend), monthly summary email.

**Masih branding/konten Notifin, belum dikerjakan (next phase):**
- Nama app, warna brand, logo, landing page copy, 4 artikel blog — semua masih bahas subscription tracker, bukan keuangan rumah tangga.
- Model data `subscriptions` perlu diperluas jadi konsep tagihan/kewajiban yang lebih umum (bukan cuma langganan digital).
- Dashboard perlu redesain total ke arah "Saku Aman" (sisa uang aman + proyeksi), bukan cuma total pengeluaran langganan.

## Architecture (warisan, masih akurat)
- Frontend: Expo (SDK 54) + expo-router, React Native. Plus Jakarta Sans (static instances via fonttools). MaterialCommunityIcons.
- Backend: FastAPI single-file (`backend/server.py`) + MongoDB (motor, async). JWT (bcrypt) session auth + Google OAuth (direct PKCE).
- Design saat ini: masih "Tactile / Playful LIGHT" brand green #059669 warisan Notifin — akan di-rebrand di fase berikutnya.

## Deployment (Fase 4 — selesai 2026-09-20)
- **Backend**: Railway project `sakuaman-backend` → `https://sakuaman-backend-production.up.railway.app`. Deploy manual/CLI-only (`railway up` dari folder `backend/`) — **sengaja TIDAK** auto-deploy dari GitHub push (beda dari Vercel di bawah).
- **Frontend**: Vercel project `notifin/sakuaman` → `https://sakuaman.vercel.app`. Auto-connected ke GitHub `artosppal/SakuAman` saat `vercel link` — **push ke `main` = otomatis deploy production**. Kalau mau matikan: Vercel dashboard → Project Settings → Git → Disconnect.
- **Database**: MongoDB Atlas cluster yang sama dengan dev lokal (Cluster0/Project 0), database `sakuaman_prod` — terisolasi dari `notifin_dev` dan `sakuaman_dev` lokal lewat nama database (bukan cluster terpisah).
- Env var production (Railway) baru semua, beda dari lokal: `MONGO_URL` (DB_NAME=sakuaman_prod), `JWT_SECRET`, `ADMIN_PASSWORD`. Integrasi lain (Fonnte WA, Resend email, Mayar) masih kosong → mode simulasi; isi kalau mau live.
- `backend/Procfile` **wajib ada** — Railway's Nixpacks default ke `main:app`, bukan `server:app`, tanpa file ini deploy crash-loop.
- `frontend/package.json` butuh script `"build": "expo export -p web"` + `frontend/vercel.json` butuh `"outputDirectory": "dist"` — keduanya tidak ada bawaan dari template Expo, wajib ditambah manual sebelum deploy pertama.
- Verifikasi end-to-end (register → OTP → onboarding redirect) sudah dijalankan langsung di URL production di atas, bukan cuma lokal.

## Fitur yang sudah ada di basis kode (siap dipakai/diarahkan ulang untuk SakuAman)
### Auth & akun
- JWT email/password (register 2-langkah via OTP email) + Google OAuth PKCE + WhatsApp OTP register/login.
- Change/set password, forgot/reset password (OTP email), semua reuse infra OTP yang sama.
- Onboarding survey 4 pertanyaan + tour.

### Langganan/tagihan (akan diperluas)
- CRUD dengan kategori, siklus (mingguan/bulanan/tahunan), status trial/paid, reminder multi-offset per item, soft delete.
- Freemium gating: max 3 aktif di Free (403 `limit_reached`).
- Dashboard: total bulan ini (normalized), proyeksi, jatuh tempo 7 hari, breakdown kategori, "sorotan boros".

### Grup (akan jadi "berbagi rumah tangga")
- Create (premium-only)/join (semua plan, kode 6 karakter)/leave/delete.
- Split equal/custom per anggota, status lunas per periode, nudge (1x/hari), riwayat 12 periode.

### Notifikasi
- WhatsApp via Fonnte (mode simulasi kalau `FONNTE_TOKEN` kosong) — reminder H-3/H-1/H-0, nudge grup, OTP.
- Push via Expo Push Notification Service (bukan lagi Emergent relay).
- Scheduler `asyncio` loop 30 menit: reminder_sweep, expire_premiums_sweep, promo_reminder_sweep, monthly_summary_sweep.

### Monetisasi
- Mayar.id (Membership API v2) — `/auth/upgrade` checkout, `/webhooks/mayar` satu-satunya tempat plan berubah.
- Downgrade 3-langkah (konfirmasi → alasan → penawaran retensi).
- Program referral: kode unik per user, referrer dapat 30 hari Premium gratis saat referee jadi Premium (constant `REFERRAL_REWARD_DAYS` di `server.py`).

### Marketing/SEO (masih berkonten Notifin, siap di-rebrand)
- Landing page, `/pricing` (perbandingan + FAQ), `/faq` standalone, `/blog` (4 artikel bilingual di `src/content/blog.ts`, belum ada CMS), sitemap.xml + robots.txt yang benar (app routes di-Disallow).
- Trust badges + payment transparency (tanpa testimoni palsu).

### Admin
- Panel HTML inline di `GET /admin` (password tunggal `ADMIN_PASSWORD`): dashboard, tabel akun, export xlsx, kelola promo/whats-new, dark mode.

### Testing
- `backend/tests/` — 66 test, semua lulus (`pytest` dari `backend/`, `pytest.ini` sudah benar pakai `--dist loadgroup`).

## Backlog (SakuAman — belum dikerjakan)
- Rebranding: nama app, warna/logo, landing copy, ganti/isi ulang konten blog.
- Perluas model data dari "subscriptions" jadi konsep tagihan/kewajiban yang lebih umum (listrik/air/internet, cicilan, iuran, SPP).
- Fitur inti v1 (lihat bagian atas): Anggaran & catat transaksi, proyeksi "Saku Aman", Siklus Gajian custom, Tabungan & Goals, modul Arisan (feature-flagged, default off).
- Redesain sistem grup existing jadi "berbagi rumah tangga".
- Redesain dashboard ke arah Saku Aman (sisa uang aman + proyeksi habis), bukan cuma total pengeluaran.

## Pending user inputs / build notes
- `FONNTE_TOKEN`, `RESEND_API_KEY`/`EMAIL_FROM`, `MAYAR_*` masih kosong di production Railway → semua integrasi eksternal jalan mode simulasi. Isi kalau mau live.
- Push ke Expo Push Notification Service butuh EAS project id di `app.json` (`extra.eas.projectId`) buat dapat token asli — belum ada EAS project.
- Blog 4 artikel launch, belum ada CMS — nambah artikel = edit `src/content/blog.ts` langsung (entri bilingual id/en).
- `REFERRAL_REWARD_DAYS` (30 hari) itu constant di `server.py` — ubah di situ kalau reward mau beda.

## Next Tasks
Fase 0–4 selesai (checkpoint kerja lokal + production deploy terverifikasi). Prioritas berikutnya terserah user — kemungkinan mulai dari salah satu fitur inti v1 (Anggaran & catat transaksi paling dekat dengan kode Subscriptions yang sudah ada) atau rebranding dulu.
