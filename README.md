# 🎪 CrunchyVerse: Interactive Theatrical Stage & Quest System

Selamat datang di **CrunchyVerse**, portfolio interaktif berbasis teater pertunjukan modern yang terintegrasi secara real-time dengan bot Discord **Sparxie**. Proyek ini terdiri dari dua komponen utama:
1. **Frontend (Next.js)**: Menyajikan UI interaktif panggung teater, dashboard statistik, papan jawara, arsip kasta, dan Quest Game (Tirai Tantangan).
2. **Backend (Node.js/Express + Discord Bot)**: Menjalankan bot Discord Sparxie, sinkronisasi status voice/chat, validasi role, monitoring livestream otomatis (TikTok/YouTube), dan API database submissions.

---

## 🛠️ Panduan Integrasi Repositori GitHub

Repositori ini siap diunggah ke GitHub dan di-deploy secara terpisah untuk frontend (Vercel) dan backend (Render).

### 1. Inisialisasi & Push ke GitHub
Untuk mengunggah kode lokal Anda ke repositori GitHub `https://github.com/AnataSim/CV.git`, jalankan perintah berikut di terminal komputer lokal Anda:

```bash
# Inisialisasi git jika belum dilakukan
git init

# Tambahkan remote repository
git remote add origin https://github.com/AnataSim/CV.git

# Buat branch utama ke main
git branch -M main

# Add & Commit semua file (node_modules, rahasia .env otomatis diabaikan oleh .gitignore)
git add .
git commit -m "feat: setup deployment vercel & render, countdown timer, dan login discord only"

# Push ke GitHub
git push -u origin main
```

---

## 🚀 Panduan Deployment & Hosting

### 📡 A. Backend & Bot Discord (Render)
Karena bot Discord memerlukan koneksi persistent WebSocket (tidak bisa berjalan di serverless Vercel), backend diletakkan di **Render** sebagai **Web Service** agar Express API dan Bot Discord dapat berjalan bersamaan.

1. Masuk ke [Dashboard Render](https://dashboard.render.com/) dan buat **New Web Service**.
2. Hubungkan repositori GitHub Anda (`AnataSim/CV`).
3. Konfigurasikan detail service sebagai berikut:
   - **Name**: `crunchyverse-backend` (atau nama pilihan Anda)
   - **Environment**: `Node`
   - **Region**: Pilih terdekat (misal `Singapore`)
   - **Branch**: `main`
   - **Root Directory**: `discord-bot` *(Sangat Penting! Ini mengarahkan Render hanya memproses subfolder bot)*
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Tambahkan **Environment Variables** berikut di menu **Environment**:
   - `PORT`: `3001`
   - `DISCORD_TOKEN`: *(Token bot Discord Anda dari Discord Developer Portal)*
   - `DISCORD_CLIENT_ID`: *(Client ID aplikasi Discord Anda)*
   - `DISCORD_CLIENT_SECRET`: *(Client Secret OAuth2 Anda)*
   - `DISCORD_REDIRECT_URI`: `https://<nama-aplikasi-anda>.onrender.com/api/oauth/callback` *(Sesuaikan dengan domain Web Service Render Anda)*
   - `TIKTOK_USERNAME`: `jobetmaritoas` *(Untuk monitoring live)*
   - *(Opsional - Firebase)* `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` *(Untuk sinkronisasi database Firestore)*
5. Klik **Create Web Service**. Setelah build selesai, backend Anda akan aktif di `https://crunchyverse-backend.onrender.com`.

> [!WARNING]
> **Penyimpanan Database Lokal**: Layanan gratis Render bersifat ephemeral (data terhapus saat server restart). Untuk produksi skala besar, sangat disarankan menggunakan integrasi **Firestore** (otomatis aktif jika env Firebase diisi). 
> Jika ingin tetap memakai database JSON lokal di Render, Anda harus membuat **Persistent Disk** (misal ukuran 1GB) di Render, dipasang di `/opt/database`, dan ubah path penyimpanan di `src/index.js` mengarah ke volume eksternal tersebut.

---

### 🎨 B. Frontend (Vercel)
Frontend Next.js di-deploy ke **Vercel** yang dirancang khusus untuk optimasi static & serverless rendering Next.js.

1. Masuk ke [Vercel](https://vercel.com/) dan buat project baru (**Add New Project**).
2. Hubungkan repositori GitHub Anda (`AnataSim/CV`).
3. Konfigurasikan proyek sebagai berikut:
   - **Framework Preset**: `Next.js`
   - **Root Directory**: `./` *(Biarkan default di root)*
4. Tambahkan **Environment Variables** berikut di Vercel:
   - `NEXT_PUBLIC_BACKEND_URL`: `https://crunchyverse-backend.onrender.com` *(Gunakan URL Web Service Render Anda tanpa slash di akhir)*
   - *(Opsional - Firebase Client)* `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, dll.
5. Klik **Deploy**. Vercel akan otomatis melakukan build dan memberikan Anda domain publik teater Anda (misal `https://cv-seven.vercel.app`).

---

## ⏰ Konfigurasi Cron Job (Stay 24/7)

Layanan gratis Render memiliki fitur tidur otomatis jika tidak menerima trafik dalam 15 menit. Agar **Sparxie Bot**, **Panggung Jawara**, dan **Stream Tracker** tetap menyala 24/7 secara konstan, kita harus menyetel Cron Job eksternal untuk melakukan ping ke backend secara rutin.

### Cara Menyiapkan Uptime Ping (Gratis):
1. Daftar akun gratis di [cron-job.org](https://cron-job.org/) atau [UptimeRobot](https://uptimerobot.com/).
2. Buat Cron Job baru dengan konfigurasi:
   - **Title**: `CrunchyVerse Backend Keep-Alive`
   - **Address (URL)**: `https://crunchyverse-backend.onrender.com/api/stats` *(Ganti dengan domain backend Render Anda)*
   - **Request Method**: `GET`
   - **Schedule (Execution)**: Setiap **10 menit** (`*/10 * * * *`)
3. Simpan Cron Job.
4. Ping rutin ini akan mencegah Render mematikan server Anda, sehingga Sparxie Bot selalu standby di Voice Channel 24/7 dan status stream langsung diperbarui tepat waktu!

---

## 🔒 Sistem Keamanan & Autentikasi Pengguna

Untuk meningkatkan keamanan platform teater saat digunakan oleh banyak orang serentak, beberapa penyesuaian keamanan penting telah diterapkan:

1. **Discord OAuth Only**: Metode pendaftaran tiket manual, login Google, dan login email/password konvensional telah dihapus. Pengguna hanya dapat masuk teater menggunakan **Discord Login**. Hal ini memastikan integritas identitas penonton, mencegah spam akun palsu, dan menyinkronkan kasta (role) Discord secara otomatis.
2. **Role-Based Authorization**:
   - Menu sensitif seperti **Sinyal Bot**, **Toggle Simulasi Live**, **Integrasikan**, dan **Frame 6 (Obrolan Anomali)** disembunyikan dan dikunci total bagi pengguna dengan kasta `Penonton`. Hanya pemilik role `Volunteer Theater`, `Ketua Kerupuk`, atau `Ketua Keripik` yang dapat mengakses dan mengoperasikannya.
3. **Gerbang Tirai Tantangan (Countdown)**:
   - Akses Quest Game (Frame 7 - Tirai Tantangan) ditutup untuk `Penonton` umum hingga pembukaan resmi pada **1 September 2026**.
   - Sistem akan memunculkan menu countdown teatrikal yang premium dan interaktif dengan hitung mundur real-time.
   - Admin (`Volunteer Theater`, `Ketua Kerupuk`, dan `Ketua Keripik`) melewati gerbang countdown secara otomatis dan dapat masuk ke area Tirai Tantangan kapan saja untuk pengujian quest.
4. **Firestore Timeout Safety**:
   - Semua koneksi database Firestore dilengkapi dengan timeout wrapper 1.5 detik. Apabila jaringan bermasalah atau kuota Firebase habis, sistem akan secara aman melakukan fallback ke dataset local JSON, sehingga website tidak akan pernah crash/hang.

---

## 📂 Struktur Direktori Proyek

```
CrunchyVerse/
├── discord-bot/               # 🤖 Server Backend Express & Bot Discord (Render)
│   ├── database/              # Penyimpanan data JSON lokal (user_decks, submissions, dll)
│   ├── src/
│   │   ├── index.js           # Main Express server & logic bot
│   │   └── utils/
│   ├── package.json
│   └── reset-sim.js           # Script reset testing deck/score
├── src/                       # 🎨 Frontend Web Next.js (Vercel)
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx           # Halaman utama panggung teater
│   │   └── globals.css        # Tema teatrikal kustom HSL
│   ├── components/
│   │   ├── TiraiCountdown.tsx # Countdown gate premium untuk Frame 7
│   │   ├── LoginModal.tsx     # Form login khusus Discord OAuth
│   │   ├── QuestGame.tsx      # Quest board (Tirai Tantangan)
│   │   └── ... (komponen lain)
│   └── lib/
│       └── firebase.ts        # Inisialisasi Firebase & Firestore
├── public/                    # Aset statis & gambar teater
├── package.json               # Package Root script
├── tsconfig.json              # Konfigurasi TypeScript (mengabaikan folder bot)
└── README.md                  # Panduan Teknis
```
