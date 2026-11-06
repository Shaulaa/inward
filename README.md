# Inward

Perjalanan scroll 3D ke dalam tubuh manusia. Mulai dari permukaan kulit, kamera menembus dermis, masuk ke pembuluh darah bersama sel darah merah, menembus membran sel, masuk ke inti sel, sampai ke heliks DNA, tanpa potongan scene yang terasa. Di akhir, kamera mundur cepat kembali ke kulit.

**Demo:** _(belum dideploy)_

> **Catatan:** visual di Inward adalah ilustrasi. Bentuk, warna, ukuran relatif, dan kepadatannya disederhanakan atau didramatisir supaya terbaca di layar. Teks dan fakta di dalamnya mengacu ke rujukan ilmiah, dan daftar lengkapnya (dengan tanda mana yang wajib dicek) ada di [docs/teks-dan-fakta.md](docs/teks-dan-fakta.md).

## Perjalanannya

| Scene | Skala | Yang dilihat |
| --- | --- | --- |
| Kulit | ±1 cm | Pori, alur, dan rambut halus yang makin besar |
| Dermis | ±1 mm | Lapisan epidermis, papila, kolagen, sampai pembuluh darah |
| Pembuluh darah | ±100 µm | Sel darah merah terbawa arus yang ikut berdenyut |
| Sel | ±20 µm | Mitokondria, retikulum endoplasma, badan Golgi, inti sel |
| Inti sel | ±5 µm | Kromatin, nukleolus, nukleosom, DNA telanjang |
| DNA | ±2 nm | Heliks ganda dan pasangan basa A–T, C–G |

Di setiap scene ada teks singkat yang muncul dan hilang mengikuti scroll, 2–3 titik klik berisi fakta (bisa dipakai dengan mouse, keyboard, dan layar sentuh), indikator skala, dan suara prosedural (opsional). Penutupnya menampilkan fakta bahwa DNA dalam satu sel panjangnya sekitar 2 meter kalau direntangkan.

## Tech stack

- **Three.js** dan **GLSL**: semua objek dibuat prosedural di kode, tanpa model atau tekstur dari luar.
- **GSAP ScrollTrigger** dan **Lenis**: scroll yang halus, dipetakan ke satu garis waktu perjalanan.
- **Web Audio API**: suara (detak jantung, aliran, dengung) disintesis di browser.
- **Vite** (Rolldown) untuk build, **Vitest** untuk tes.

## Menjalankan

Butuh Node.js 20 atau lebih baru.

```bash
npm install
npm run dev       # server pengembangan
npm run build     # build produksi ke dist/
npm run preview   # sajikan dist/ secara lokal
npm test          # tes unit
npm run facts     # tulis ulang docs/teks-dan-fakta.md dari src/content/story.js
```

Parameter URL yang berguna:

- `?debug`: panel debug (fps, scene yang aktif, draw call, triangle, preset, snapshot).
- `?quality=mobile` atau `?quality=desktop`: paksa preset kualitas (biasanya dipilih otomatis).
- `?scale=fixed`: matikan resolusi dinamis, untuk membandingkan performa.

### Deploy

Proyek ini situs statis. `vercel.json` sudah menyiapkan build (`npm run build` ke `dist/`) dan header cache untuk aset ber-hash. Isi `VITE_SITE_URL` (lihat `.env`) dengan alamat situs tanpa garis miring di akhir, supaya URL gambar Open Graph dan Twitter Card absolut.

## Struktur

```
src/
  content/story.js   semua teks: nama scene, skala, caption, fakta + tanda cek, penutup, fallback
  core/              timeline, scene manager, transisi, post-processing, kualitas, resolusi dinamis
  scenes/            satu folder per scene, masing-masing dengan koordinat dan shader sendiri
  shaders/           pustaka GLSL bersama (noise, bump, selubung inti)
  ui/                caption, titik klik, indikator skala, tombol suara, fallback
  audio/             soundscape prosedural
tests/               tes unit (timeline, geometri, choreography, rewind, culling, dll.)
scripts/             export daftar teks dan fakta
```

## Tantangan teknis

- **Skala yang beda jauh.** Dari sentimeter ke nanometer ada selisih tujuh orde besaran. Satu dunia berukuran asli akan merusak presisi angka di GPU, jadi tiap scene punya koordinat dan kamera sendiri. Perpindahannya ditutup oleh objek yang sedang ditembus: kamera menekan permukaan, lalu lubang membran terbuka ke scene berikutnya.
- **Cuma scene yang perlu yang hidup.** Hanya scene aktif dan tetangganya yang memegang memori GPU. Yang jauh dilepas beserta geometri, material, shader, dan teksturnya, dan tetangga dibangun saat browser sedang longgar. Penutup tetap dalam batas yang sama: kamera mundur memakai gambar resolusi penuh dari scene tengah yang diambil saat perjalanan maju, jadi hanya DNA dan kulit yang berupa scene 3D.
- **Jumlah objek.** Ribuan sel darah, sel kulit, ribosom, dan pasangan basa digambar dengan instancing. Yang di luar pandangan atau yang sudah tertutup kabut tidak digambar, dan objek jauh memakai model yang lebih ringan. Tabung panjang (kromatin, pita DNA) dipotong per bagian agar bisa di-cull, lalu digabung per area agar draw call tetap sedikit.
- **Biaya piksel.** Di transisi, dua scene digambar sekaligus. Resolusi render turun sementara kalau fps-nya rendah: sampai 1× ukuran CSS, di bawah itu hanya kalau fps benar-benar rendah, lalu naik lagi begitu pulih.
- **Kompilasi shader.** Shader yang berat butuh 0,5–1 detik untuk dikompilasi di sebagian GPU (D3D lewat ANGLE). Scene tetangga dikompilasi secara paralel sebelum dibutuhkan.
- **Artefak turunan.** Noise Voronoi dan `fwidth` di tepi sel menghasilkan garis putus-putus. Tepinya dilunakkan, dan nilai per sel dijauhkan dari peta tinggi bump.
- **Aksesibilitas.** `prefers-reduced-motion` mematikan scroll halus, blur, dan zoom di penutup, serta memperlambat gerak ambien. Titik klik berupa tombol dengan area sentuh 44 px. Ada versi teks perjalanan kalau WebGL 2 tidak tersedia.

## Yang belum diuji

Performa dan tampilan di HP asli (GPU mobile, iOS Safari, panas perangkat) belum diuji. Pengujian sejauh ini memakai browser desktop dan emulasi perangkat.
