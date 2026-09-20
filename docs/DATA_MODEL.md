# SakuAman — Rancangan Model Data & API (Langkah 4)

Per `sakuaman-prompt-pack.md` Langkah 4, berdasarkan `docs/ARCHITECTURE.md`. **Belum ada kode yang
ditulis.** Dokumen ini menunggu persetujuan sebelum implementasi (Langkah 5) dimulai.

Cakupan v1 sesuai brief: kewajiban/tagihan umum, transaksi & anggaran amplop, siklus gajian, "Saku
Aman", tabungan & goal (termasuk dana tagihan tahunan), arisan (feature-flagged, off by default).
**Sengaja tidak dirancang di sini** (fase berikutnya): rumah tangga bersama pasangan, balas "SUDAH"
via WhatsApp buat tandai lunas/catat transaksi.

---

## 1. Entitas baru

### `obligations` (menggantikan `subscriptions` — generalisasi dari langganan ke semua kewajiban)

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | uuid |
| `user_id` | string | → `users.user_id` |
| `name` | string | nama tagihan (bebas) |
| `type` | enum | `subscription` \| `recurring_bill` (listrik/air/internet) \| `installment` (cicilan) \| `dues` (iuran) \| `tuition` (SPP/bayaran anak) \| `other` |
| `category` | string | buat grouping/tampilan (kategori baru khusus rumah tangga — lihat §5) |
| `amount` | float | nominal per periode |
| `recurrence` | enum | `weekly` \| `monthly` \| `yearly` \| `custom` (dipakai buat cicilan dengan tenor tetap) |
| `next_due_date` | string (YYYY-MM-DD) | sama pola dengan `subscriptions` lama |
| `end_date` | string \| null | tenggat kalau `type=installment`/`dues` dengan tenor tetap; null = berjalan terus |
| `reminders` | array\<int\> | offset hari, default `[3,1,0]` — sama seperti sekarang |
| `period_status` | object | map `{"<YYYY-MM>": {"paid": bool, "paid_at": iso, "amount_paid": float}}` — **pola sama persis dengan `group_subscriptions`** yang sudah ada, bukan konsep baru |
| `notes` | string \| null | |
| `deleted_at` | string \| null | soft delete, pola existing |
| `created_at` | iso | |

**Cicilan-ke-berapa**, **berapa kali sudah lunas** dihitung dari `period_status` (jumlah entri
`paid: true`), **tidak disimpan sebagai field terpisah** — hindari data yang bisa jadi tidak sinkron.

**Index**: `user_id`, `id` (unique).

### `transactions` (baru — catat transaksi cepat)

| Field | Tipe | Keterangan |
|---|---|---|
| `id`, `user_id` | string | |
| `kind` | enum | `income` \| `expense` |
| `amount` | float | |
| `category` | string | kosong/`"income"` kalau `kind=income` |
| `note` | string \| null | |
| `date` | string (YYYY-MM-DD) | |
| `created_at` | iso | |

**Index**: `(user_id, date)`.

### `budgets` (baru — anggaran amplop per kategori, standing/tidak per-periode)

| Field | Tipe | Keterangan |
|---|---|---|
| `id`, `user_id` | string | |
| `category` | string | |
| `monthly_amount` | float | batas amplop bulanan buat kategori ini |
| `updated_at` | iso | |

**Index**: `(user_id, category)` unique — satu amplop per kategori per user, berlaku terus sampai
diubah (bukan diset ulang tiap bulan).

### `savings_goals` (baru — goal bebas ATAU dana tagihan tahunan)

| Field | Tipe | Keterangan |
|---|---|---|
| `id`, `user_id` | string | |
| `name` | string | |
| `target_amount` | float | |
| `current_amount` | float | running total, di-update tiap setoran |
| `deadline` | string \| null | YYYY-MM-DD |
| `kind` | enum | `goal` (bebas) \| `annual_fund` (dana tagihan tahunan) |
| `linked_obligation_id` | string \| null | isi kalau `kind=annual_fund`, nunjuk ke `obligations.id` yang tahunan |
| `deleted_at` | string \| null | |
| `created_at` | iso | |

### `savings_deposits` (baru — log setoran, buat progress & riwayat)

| Field | Tipe |
|---|---|
| `id`, `goal_id`, `user_id` | string |
| `amount` | float |
| `date` | string (YYYY-MM-DD) |
| `created_at` | iso |

**Saran setoran/bulan** = `(target_amount - current_amount) / bulan_tersisa_sampai_deadline` —
dihitung on-the-fly, tidak disimpan.

### Field baru di `users` (bukan koleksi baru)

| Field | Tipe | Keterangan |
|---|---|---|
| `payday` | int (1-31) \| null | tanggal gajian; null = pakai tanggal 1 kalender biasa (lihat pertanyaan §7) |

### `arisan_groups` + `arisan_contributions` (baru — **feature-flagged, off by default**)

Sengaja dirancang sekarang, dibangun di Langkah 5 tapi **tidak aktif** sampai flag dinyalakan (lihat
§6). Skema meniru `groups`/`group_subscriptions` yang sudah ada:

- `arisan_groups`: `id`, `owner_id`, `name`, `contribution_amount`, `cycle` (weekly/monthly),
  `participants` (array `{name, user_id?, order, has_won}`), `current_turn`, `created_at`.
- `arisan_contributions`: pola sama seperti `period_status` di `obligations` — per periode, per
  peserta, status setor.

---

## 2. Endpoint API baru

| Endpoint | Keterangan |
|---|---|
| `GET/POST /obligations`, `GET/PUT/DELETE /obligations/{id}` | CRUD, gantikan `/subscriptions` |
| `PUT /obligations/{id}/pay` | tandai lunas periode berjalan (body: `{period, amount_paid?}`) — pola sama `group_subscriptions/pay` |
| `GET/POST /transactions`, `PUT/DELETE /transactions/{id}` | catat transaksi |
| `GET /budgets`, `PUT /budgets/{category}` | lihat/set amplop per kategori |
| `GET /saku-aman` | endpoint baru — lihat §4 |
| `PUT /auth/payday` | set tanggal gajian |
| `GET/POST /goals`, `GET/PUT/DELETE /goals/{id}`, `POST /goals/{id}/deposit` | tabungan & goal |
| `POST/GET /arisan`, `POST /arisan/{id}/contribute`, `POST /arisan/{id}/draw` | **hanya aktif kalau flag nyala** (§6), selain itu 404 |

`/dashboard` yang ada **tetap dipertahankan** dulu (tidak dihapus) selama transisi, tapi `total_this_month`/`by_category`-nya nanti sumbernya dari `transactions` bukan `obligations`, biar konsisten sama makna "pengeluaran" yang sesungguhnya (bukan cuma total kewajiban).

---

## 3. Kenapa satu koleksi `obligations`, bukan dua paralel (subscriptions + tagihan baru)

Pertimbangan: kalau `subscriptions` (lama) dan tagihan-baru jadi dua koleksi terpisah, logic
reminder/freemium/dashboard harus digandakan di dua tempat — rawan divergen, dan yang diminta
justru "semua kewajiban rutin dalam satu tempat" (bukan dua sistem berdampingan). Jadi rancangan ini
**mengganti** `subscriptions` sepenuhnya jadi `obligations` (field baru: `type`, `period_status`
menggantikan `status` tunggal), bukan menambah koleksi baru di sampingnya.

**Konsekuensi**: ini keputusan besar (lihat §7, pertanyaan #2) karena berarti endpoint
`/subscriptions` lama akan diganti, bukan dipertahankan — dan test yang ada perlu dirombak
(§5).

---

## 4. "Saku Aman" — cara hitung (v1, tanpa AI)

```
saku_aman_hari_ini = total_anggaran_bulanan
                    - total_transaksi_expense_bulan_keuangan_berjalan
                    - total_obligations_jatuh_tempo_sebelum_gajian_berikutnya_yang_belum_lunas
```

- **"bulan keuangan berjalan"** = window dari `payday` bulan lalu (atau tanggal 1 kalau `payday`
  belum diset) sampai `payday` bulan ini dikurangi 1 hari.
- **Proyeksi "diperkirakan habis tanggal X"**: `rata_rata_pengeluaran_harian = total_expense_bulan_keuangan_berjalan / hari_yang_sudah_lewat_di_bulan_keuangan_ini`. Kalau `saku_aman_hari_ini / rata_rata_pengeluaran_harian` < sisa hari sampai gajian berikutnya → proyeksi tanggal habis = hari ini + (`saku_aman_hari_ini / rata_rata_pengeluaran_harian`) hari. Proyeksi linear sederhana, sesuai brief ("tanpa AI").

---

## 5. Dampak ke test yang ada

- `test_notifin_backend.py::TestSubscriptionsAndFreemium` (7 test), `TestDashboard`,
  `TestCleanup`, `TestMonthlySummary` — **semua perlu ditulis ulang** karena field `subscriptions`
  berubah bentuk total (`status` tunggal → `period_status` map, tambah `type`). Estimasi: rombak
  besar, bukan tambal sulam.
- `test_notifin_fase3.py::TestReminderSweep` — `reminder_sweep()` yang baca `subscriptions` perlu
  disesuaikan baca `obligations`, test ikut berubah.
- `test_notifin_groups.py` — **tidak terdampak langsung** (skema `group_subscriptions` tidak
  disentuh di v1 ini; redesign "grup jadi rumah tangga" itu scope terpisah, bukan bagian rancangan
  data model ini).
- Test baru dibutuhkan buat: `obligations` CRUD+pay, `transactions` CRUD, `budgets`, `/saku-aman`
  projection, `goals`+`deposit`, freemium limit versi baru.

Sesuai Langkah 5 (implementasi bertahap per irisan, test hijau sebelum lanjut), rombak test ini
kemungkinan besar jadi bagian slice pertama ("Kewajiban/tagihan umum + mesin reminder generik"),
bukan dikerjakan terpisah di akhir.

---

## 6. Freemium — file konfigurasi paket

`backend/server.py` (atau file baru `backend/plans.py` kalau mau dipisah — ikut konvensi 1-file yang
sudah ada, saya condong tetap di `server.py` biar konsisten):

```python
PLANS = {
    "free": {
        "max_obligations_active": 8,
        "max_goals_active": 3,
        "wa_notif_quota_per_month": 5,       # reuse angka existing (FREE_WA_NOTIF_LIMIT)
        "arisan_can_create": False,           # join tetap boleh, semua plan (pola sama seperti grup)
    },
    "premium": {
        "max_obligations_active": None,      # unlimited
        "max_goals_active": None,
        "wa_notif_quota_per_month": None,
        "arisan_can_create": True,
    },
}
ARISAN_FEATURE_ENABLED = False  # kill-switch global — endpoint 404 kalau False, apa pun plan-nya
```

Reminder WhatsApp: gratis dengan kuota (pola `consume_wa_quota()` yang sudah ada, dipakai ulang apa
adanya). Referral & pembatasan toggle WhatsApp dari Notifin: **dipakai ulang tanpa perubahan**.

---

## 7. Keputusan (dijawab 2026-09-20)

1. **Batas paket Free**: `max_obligations_active = 8`, `max_goals_active = 3`. Naik dari 3 (Notifin)
   karena cakupan lebih luas (listrik+air+internet+cicilan+SPP bisa 5+ sekaligus buat rumah tangga
   biasa) — 8 masih jadi dorongan wajar buat upgrade, bukan ngerem pemakaian normal.
2. **Konfirmasi**: `obligations` MENGGANTIKAN `subscriptions` sepenuhnya — **disetujui**. Bukan dua
   sistem paralel (lihat §3, dampak test di §5).
3. **Dana tagihan tahunan**: **opt-in/manual**. User bikin `obligation` tahunan dulu, baru ada tombol
   "Jadikan tabungan bulanan" kalau mau — tidak auto-create goal tanpa diminta.
4. **Kategori tanpa `budgets`**: **unlimited/tidak dihitung** sebagai pembatas Saku Aman (bukan
   dianggap over-budget/0), sampai user secara sadar isi budget kategori itu — hindari alarm palsu
   di pengalaman awal.
5. **`payday` belum diisi**: default ke tanggal 1 kalender (tidak wajib di onboarding), plus
   **soft-prompt** di dashboard ("Atur tanggal gajian biar Saku Aman lebih akurat") kalau kosong —
   tidak blocking.
6. **Arisan premium/free**: **bikin arisan = Premium-only** (konsisten create-grup Notifin sekarang),
   **join arisan = semua plan** (konsisten join-grup Notifin, kode 6 karakter).

**Status: disetujui, siap Langkah 5.**
