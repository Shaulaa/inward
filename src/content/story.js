/**
 * Semua teks yang tampil di Inward ada di file ini: nama scene dan skalanya,
 * teks tiap scene, fakta titik klik, penutup, dan catatan ilustrasi.
 * (Pengecualian: teks statis di index.html — judul halaman, meta description,
 * Open Graph/Twitter, nama brand, petunjuk scroll, pesan noscript — karena
 * crawler dan browser tanpa JavaScript membacanya langsung dari HTML; dan
 * label tombol suara di SoundToggle.js.)
 *
 * Penanda cek fakta (`check`):
 *   level 'wajib'      angka atau perkiraan. Wajib dicocokkan ke sumber
 *                      sebelum rilis; angkanya bisa beda antar sumber.
 *   level 'disarankan' fakta buku teks yang umum. Cukup pastikan kalimatnya
 *                      sesuai sumber.
 *   what               bagian kalimat yang perlu dicek.
 *   source             SARAN rujukan untuk mengecek. Ini bukan tanda bahwa
 *                      faktanya sudah dicek.
 *
 * Panjang teks dijaga pendek supaya muat di kolom samping (desktop) dan di
 * pita bawah (HP) tanpa menutupi tengah layar. Lihat tests/content.test.js.
 */

/** Rujukan yang sering dipakai di bawah. */
const REF = {
  alberts: 'Alberts dkk., Molecular Biology of the Cell (ed. 6/7)',
  guyton: 'Guyton & Hall, Textbook of Medical Physiology',
  bionumbers: 'BioNumbers (bionumbers.hms.harvard.edu)',
  histology: 'Ross & Pawlina, Histology: A Text and Atlas',
};

export const NOTE = 'Visual ini ilustrasi. Bentuk, warna, dan kepadatannya disederhanakan atau didramatisir.';

/**
 * Per scene, dengan urutan dan id yang sama dengan journey.js.
 * `label` dan `scale` dipakai indikator skala.
 */
export const SCENES = {
  skin: {
    label: 'Kulit',
    scale: '±1 cm',
    scaleCheck: { level: 'disarankan', what: 'Lebar pandang kira-kira 1–2 cm', source: 'Ukuran pori dan rambut di scene ini' },
    caption: {
      title: 'Permukaan kulit',
      text: 'Kulit adalah organ terbesar tubuh, luasnya sekitar 1,5–2 m² pada orang dewasa. Dari dekat, permukaannya penuh alur halus, pori, dan rambut.',
      check: { level: 'wajib', what: 'Luas kulit 1,5–2 m²', source: REF.histology },
    },
    hotspots: [
      {
        id: 'pore',
        label: 'Pori',
        title: 'Pori-pori',
        text: 'Pori yang terlihat adalah mulut folikel rambut, tempat minyak kulit (sebum) keluar. Pori keringat jauh lebih kecil. Kulit punya sekitar 2–4 juta kelenjar keringat.',
        check: { level: 'wajib', what: 'Jumlah kelenjar keringat 2–4 juta', source: REF.guyton },
      },
      {
        id: 'hair',
        label: 'Rambut halus',
        title: 'Rambut halus',
        text: 'Hampir seluruh kulit ditumbuhi rambut halus (vellus). Tiap folikel punya otot kecil penegak rambut. Otot inilah yang bikin bulu kuduk berdiri saat merinding.',
        check: { level: 'disarankan', what: 'Rambut vellus dan otot arrector pili', source: REF.histology },
      },
      {
        id: 'surface',
        label: 'Lapisan tanduk',
        title: 'Lapisan tanduk',
        text: 'Lapisan terluar kulit tersusun dari sel mati yang pipih dan terus mengelupas. Tubuh melepas puluhan ribu sel kulit setiap menit.',
        check: { level: 'wajib', what: '"Puluhan ribu sel per menit" (angka populer ±30.000–40.000)', source: REF.histology },
      },
    ],
  },

  dermis: {
    label: 'Dermis',
    scale: '±1 mm',
    scaleCheck: { level: 'disarankan', what: 'Tebal epidermis + dermis atas di scene ini', source: REF.histology },
    caption: {
      title: 'Di bawah permukaan',
      text: 'Kulit punya dua lapisan utama. Epidermis di atas terus memperbarui diri. Dermis di bawahnya berisi pembuluh darah, saraf, dan serat kolagen.',
      check: { level: 'disarankan', what: 'Pembagian epidermis dan dermis', source: REF.histology },
    },
    hotspots: [
      {
        id: 'epidermis',
        label: 'Sel epidermis',
        title: 'Sel epidermis',
        text: 'Sel epidermis lahir di lapisan paling bawah, lalu terdorong ke atas, memipih, dan mati menjadi lapisan tanduk. Perjalanan ini makan waktu sekitar satu bulan.',
        check: { level: 'wajib', what: 'Waktu pergantian epidermis ±1 bulan (sumber menyebut 4–8 minggu)', source: REF.histology },
      },
      {
        id: 'papilla',
        label: 'Papila dermis',
        title: 'Papila dermis',
        text: 'Batas epidermis dan dermis bergelombang membentuk papila. Epidermis tidak punya pembuluh darah sendiri, jadi kapiler di papila yang memasok nutrisinya.',
        check: { level: 'disarankan', what: 'Epidermis avaskular, nutrisi dari kapiler papila', source: REF.histology },
      },
      {
        id: 'fibroblast',
        label: 'Fibroblas',
        title: 'Fibroblas',
        text: 'Fibroblas membuat kolagen dan elastin, serat yang bikin kulit kuat sekaligus lentur. Kolagen adalah protein paling melimpah di tubuh manusia.',
        check: { level: 'wajib', what: 'Kolagen protein paling melimpah (±25–30% protein tubuh)', source: REF.alberts },
      },
    ],
  },

  vessel: {
    label: 'Pembuluh darah',
    scale: '±100 µm',
    scaleCheck: { level: 'disarankan', what: 'Diameter pembuluh ±10× sel darah merah', source: REF.guyton },
    caption: {
      title: 'Arus darah',
      text: 'Darah membawa oksigen ke seluruh tubuh. Di sini sel darah merah terbawa arus yang ikut menghentak setiap kali jantung berdetak.',
      check: { level: 'disarankan', what: 'Aliran berdenyut mengikuti detak jantung', source: REF.guyton },
    },
    hotspots: [
      {
        id: 'redCells',
        label: 'Sel darah merah',
        title: 'Sel darah merah',
        text: 'Cakram cekung selebar sekitar 7–8 µm, tanpa inti, penuh hemoglobin pengangkut oksigen. Tiap sel hidup sekitar 120 hari.',
        check: { level: 'wajib', what: 'Diameter 7–8 µm dan umur ±120 hari', source: REF.guyton },
      },
      {
        id: 'wall',
        label: 'Dinding pembuluh',
        title: 'Endotel',
        text: 'Bagian dalam pembuluh dilapisi selapis sel tipis bernama endotel. Endotel ikut mengatur kapan pembuluh melebar atau menyempit, dan menjaga darah tidak menggumpal.',
        check: { level: 'disarankan', what: 'Fungsi endotel', source: REF.guyton },
      },
    ],
  },

  cell: {
    label: 'Sel',
    scale: '±20 µm',
    scaleCheck: { level: 'disarankan', what: 'Diameter sel di scene ±20 µm', source: REF.bionumbers },
    caption: {
      title: 'Di dalam sel',
      text: 'Tubuh tersusun dari puluhan triliun sel. Di dalam tiap sel, organel bekerja seperti pabrik kecil yang berjejal di sekitar inti.',
      check: { level: 'wajib', what: 'Jumlah sel tubuh (perkiraan ±30–37 triliun)', source: 'Sender dkk. 2016, PLOS Biology; Bianconi dkk. 2013' },
    },
    hotspots: [
      {
        id: 'mitochondrion',
        label: 'Mitokondria',
        title: 'Mitokondria',
        text: 'Mitokondria mengubah gula dan oksigen menjadi ATP, sumber energi sel. Mitokondria punya DNA sendiri yang diwariskan dari ibu.',
        check: { level: 'disarankan', what: 'Fungsi mitokondria dan DNA mitokondria dari ibu', source: REF.alberts },
      },
      {
        id: 'golgi',
        label: 'Badan Golgi',
        title: 'Badan Golgi',
        text: 'Badan Golgi mengolah dan mengemas protein, memberinya semacam label alamat, lalu mengirimnya dalam gelembung kecil (vesikel) ke tujuan.',
        check: { level: 'disarankan', what: 'Fungsi badan Golgi', source: REF.alberts },
      },
      {
        id: 'er',
        label: 'Retikulum endoplasma',
        title: 'Retikulum endoplasma',
        text: 'Jaringan membran ini menempel pada inti sel. Ribosom di permukaannya merakit protein dari asam amino, mengikuti salinan instruksi DNA (mRNA).',
        check: { level: 'disarankan', what: 'RE kasar, ribosom, dan mRNA', source: REF.alberts },
      },
    ],
  },

  nucleus: {
    label: 'Inti sel',
    scale: '±5 µm',
    scaleCheck: { level: 'disarankan', what: 'Diameter inti ±5–10 µm', source: REF.bionumbers },
    caption: {
      title: 'Inti sel',
      text: 'Inti sel menyimpan hampir seluruh DNA. DNA di sini tidak berserakan, tapi tergulung rapi menjadi kromatin.',
      check: { level: 'disarankan', what: 'Sebagian kecil DNA ada di mitokondria', source: REF.alberts },
    },
    hotspots: [
      {
        id: 'nucleolus',
        label: 'Nukleolus',
        title: 'Nukleolus',
        text: 'Nukleolus adalah tempat bahan ribosom dirakit. Ia tidak dibungkus membran, hanya gumpalan padat RNA dan protein.',
        check: { level: 'disarankan', what: 'Fungsi nukleolus, tanpa membran', source: REF.alberts },
      },
      {
        id: 'chromatin',
        label: 'Kromatin',
        title: 'Kromatin',
        text: 'Kromatin yang padat (heterokromatin) banyak berada di tepi inti dan gennya jarang dibaca. Kromatin yang longgar (eukromatin) berisi gen yang aktif.',
        check: { level: 'disarankan', what: 'Heterokromatin dan eukromatin', source: REF.alberts },
      },
      {
        id: 'nucleosome',
        label: 'Nukleosom',
        title: 'Nukleosom',
        text: 'DNA melilit protein histon sekitar 1,7 putaran (±147 pasang basa). Hasilnya mirip manik-manik pada tali, langkah pertama memadatkan DNA.',
        check: { level: 'wajib', what: '±147 pasang basa, ±1,7 putaran', source: REF.alberts },
      },
    ],
  },

  dna: {
    label: 'DNA',
    scale: '±2 nm',
    scaleCheck: { level: 'wajib', what: 'Diameter heliks DNA ±2 nm', source: REF.alberts },
    caption: {
      title: 'Heliks ganda',
      text: 'Dua untai berpilin membentuk heliks ganda. Urutan basa A, T, C, dan G di antaranya adalah kode untuk membuat protein.',
      check: { level: 'disarankan', what: 'Struktur heliks ganda dan kode genetik', source: REF.alberts },
    },
    hotspots: [
      {
        id: 'basePair',
        label: 'Pasangan basa',
        title: 'Pasangan basa',
        text: 'A selalu berpasangan dengan T, dan C dengan G. Satu putaran heliks berisi sekitar 10,5 pasang basa.',
        check: { level: 'wajib', what: '±10,5 pasang basa per putaran (B-DNA)', source: REF.alberts },
      },
      {
        id: 'backbone',
        label: 'Tulang punggung',
        title: 'Tulang punggung DNA',
        text: 'Pita di sisi luar tersusun dari gula dan fosfat yang berselang-seling. Ikatan antarbasa di tengah lebih lemah, jadi untai bisa dibuka saat DNA dibaca atau disalin.',
        check: { level: 'disarankan', what: 'Gula-fosfat dan ikatan hidrogen antarbasa', source: REF.alberts },
      },
      {
        id: 'genome',
        label: 'Untai lain',
        title: 'Genom manusia',
        text: 'Satu set kromosom manusia berisi sekitar 3,1 miliar pasang basa, dan kebanyakan sel tubuh punya dua set.',
        check: { level: 'wajib', what: '±3,1 miliar pasang basa per set (GRCh38); "kebanyakan sel" (sel telur/sperma satu set, sel darah merah tanpa inti)', source: 'Genome Reference Consortium, GRCh38' },
      },
    ],
  },
};

/** Penutup setelah DNA. */
export const OUTRO = {
  fact: {
    kicker: 'Kalau direntangkan',
    title: '±2 meter',
    text: 'Itu panjang seluruh DNA dalam satu sel. Semuanya terlipat di dalam inti yang lebarnya cuma beberapa mikrometer.',
    check: { level: 'wajib', what: '±2 meter per sel (±6,2 miliar pb × 0,34 nm)', source: REF.alberts },
  },
  closing: {
    title: 'Kembali ke permukaan',
    text: 'Dua meter DNA itu ada di hampir setiap sel tubuhmu, termasuk di bawah kulit yang barusan kita tembus.',
    check: { level: 'disarankan', what: '"Hampir setiap sel" (sel darah merah dewasa tidak punya inti)', source: REF.alberts },
  },
  replay: 'Ulangi perjalanan',
};

/** Teks antarmuka untuk titik klik. */
export const UI = {
  hotspotPrefix: 'Fakta:',
  closeFact: 'Tutup fakta',
};

/** Kalau tampilan 3D tidak bisa jalan (lihat src/ui/Fallback.js). */
export const FALLBACK = {
  unsupported: {
    title: 'Perjalanan 3D-nya belum bisa tampil di sini',
    text: 'Browser atau perangkat ini belum mendukung WebGL 2, teknologi grafis yang dipakai Inward. Coba buka di versi terbaru Chrome, Edge, Firefox, atau Safari. Sementara itu, ini perjalanannya dalam bentuk teks.',
  },
  failed: {
    title: 'Tampilan 3D gagal dimulai',
    text: 'WebGL tersedia, tapi gagal dijalankan di perangkat ini (biasanya karena driver grafis atau akselerasi hardware dimatikan). Ini perjalanannya dalam bentuk teks.',
  },
  contextLost: {
    title: 'Tampilan 3D berhenti',
    text: 'Perangkat grafis di-reset atau kehabisan memori. Muat ulang halaman untuk melanjutkan.',
  },
  reload: 'Muat ulang',
  journeyHeading: 'Perjalanannya, dalam teks',
};
