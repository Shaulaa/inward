# Inward: Perjalanan ke Dalam Tubuh

Nov 5, 2026 · @Lord Syan 👑

## Konsep

Inward adalah web scroll storytelling yang bikin lo berasa menyusut terus masuk ke tubuh manusia, dari kulit sampai DNA, tanpa potongan scene yang kerasa.

## Alur perjalanan

| Urutan | Scene | Ukuran | Yang dilihat |
| --- | --- | --- | --- |
| 1 | Permukaan kulit | ±1 cm | Pori-pori dan tekstur kulit yang makin lama makin besar |
| 2 | Dalam kulit | ±1 mm | Lapisan kulit yang ditembus sampai ketemu pembuluh darah |
| 3 | Pembuluh darah | ±100 µm | Lo kebawa arus bareng sel darah merah |
| 4 | Dalam sel | ±20 µm | Tembus membran, lewat mitokondria dan organel lain |
| 5 | Inti sel | ±5 µm | Gulungan kromatin yang kelihatan makin rapat |
| 6 | DNA | ±2 nm | Heliks raksasa dan pasangan basa A, T, C, G |

Buat penutup, munculin fakta kalau DNA dalam satu sel panjangnya sekitar 2 meter kalau direntangin. Abis itu kamera mundur cepet sampai balik ke kulit, jadi perjalanannya berasa nyambung.

## Yang bikin seru

- **Indikator skala:** angkanya turun terus dari cm ke nm, jadi orang sadar seberapa jauh dia udah masuk.
- **Titik yang bisa diklik:** tiap scene punya beberapa objek yang kalau diklik muncul fakta singkat.
- **Kamera ngikutin mouse:** arah pandang bisa sedikit digeser biar nggak berasa kayak nonton video doang.
- **Suara:** detak jantung kedengeran jelas di pembuluh darah, terus makin hilang pas lo makin dalam.

## Tech stack

- **Three.js dan GLSL:** buat scene dan efek organik kayak membran yang bergerak.
- **GSAP ScrollTrigger dan Lenis:** buat ngiket kamera ke scroll biar geraknya halus.
- **InstancedMesh:** biar ribuan sel darah tetep ringan.
- **Postprocessing:** bloom dan depth of field bikin suasananya berasa mikroskopis.
- **Vite dan Vercel:** buat build dan hosting.

## Tantangan utama

1. **Transisi antar skala:** ini yang paling susah. Jangan bikin satu dunia dengan ukuran asli, karena angka sekecil itu bikin rendering berantakan. Mending tiap scene punya koordinat sendiri, terus perpindahannya ditutup pakai objek yang lagi ditembus atau crossfade.
2. **Performa:** enam scene berat nggak boleh aktif barengan, jadi cuma scene yang lagi kelihatan dan sebelahnya yang dirender. Di HP, jumlah partikel dan efeknya juga dikurangin.
3. **Akurasi:** visualnya boleh didramatisir, tapi fakta dan skalanya harus dicek ke sumber yang bener. Kasih juga catatan kecil kalau visualnya ilustrasi.

## Urutan ngerjain

1. Bikin prototype transisi pembuluh darah ke sel dulu, karena kalau bagian ini berhasil, sisanya tinggal ngikutin polanya.
2. Lengkapin keenam scene dalam bentuk kasar dan sambungin sama scroll.
3. Poles shader, lighting, dan suara.
4. Tambahin titik klik dan teks.
5. Optimasi buat HP, terus deploy.
