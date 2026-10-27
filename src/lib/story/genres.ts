export type Genre = "misteri" | "horor" | "keluarga" | "persahabatan" | "religi" | "motivasi" | "cinta";

export const GENRE_LABEL: Record<Genre, string> = {
  misteri: "Misteri & Ketegangan",
  horor: "Horor Rakyat",
  keluarga: "Drama Keluarga",
  persahabatan: "Persahabatan",
  religi: "Renungan Religi",
  motivasi: "Perjuangan & Motivasi",
  cinta: "Kisah Cinta",
};

const KEYWORDS: Record<Genre, string[]> = {
  misteri: ["misteri", "rahasia", "hilang", "gelap", "dajjal", "kabar", "aneh", "tabu", "teror", "kunci", "pesan", "surat", "jejak", "kabur", "detektif", "pencuri", "mafia"],
  horor: ["hantu", "setan", "kuntilanak", "pocong", "genderuwo", "angker", "santet", "kuburan", "makam", "gaib", "kerasukan", "terkutuk", "berdarah"],
  keluarga: ["ibu", "ayah", "anak", "keluarga", "adik", "kakak", "rumah", "rindu", "pulang", "orang tua", "warisan", "perceraian", "sekolah", "biaya"],
  persahabatan: ["sahabat", "teman", "persahabatan", "sekolah", "kelas", "hutang", "menolong", "pertemanan", "geng", "solidaritas"],
  religi: ["doa", "sholat", "salat", "masjid", "tuhan", "iman", "taubat", "dosa", "surga", "neraka", "kiamat", "sabar", "syukur", "ustad", "hijrah", "dajjal", "akhir zaman"],
  motivasi: ["miskin", "gagal", "bangkit", "usaha", "kerja", "modal", "sukses", "berjuang", "impian", "harapan", "putus asa", "kuliah", "beasiswa"],
  cinta: ["cinta", "pacar", "rindu", "pernikahan", "nikah", "patah hati", "sayang", "jodoh", "mantan"],
};

export function detectGenre(text: string, fallback: Genre = "misteri"): Genre {
  const t = text.toLowerCase();
  let best: Genre = fallback;
  let bestScore = 0;
  for (const [genre, words] of Object.entries(KEYWORDS) as [Genre, string[]][]) {
    let score = 0;
    for (const w of words) if (t.includes(w)) score += w.length > 6 ? 2 : 1;
    if (score > bestScore) {
      bestScore = score;
      best = genre;
    }
  }
  return bestScore === 0 ? fallback : best;
}

export interface BeatTemplate {
  key: "hook" | "setup" | "konflik" | "klimaks" | "resolusi" | "cta";
  lines: string[];
}

/** Narration banks per genre & beat. Slots: {A} protagonist, {B} second character,
 * {T} place, {O} object/secret, {W} time phrase, {N} episode number. */
export const BEAT_BANK: Record<Genre, BeatTemplate[]> = {
  misteri: [
    {
      key: "hook",
      lines: [
        "Malam itu, {T} terasa berbeda.",
        "{A} tahu ada sesuatu yang tidak beres sejak {W}.",
        "Sejak {W}, {T} tidak pernah lagi terasa aman.",
        "Ada satu hal yang {A} sembunyikan dari semua orang.",
        "Pesan itu datang tepat saat hujan mulai turun.",
      ],
    },
    {
      key: "setup",
      lines: [
        "{A} tinggal di {T} bersama {B}.",
        "Sejak kecil, {A} selalu diajari untuk tidak keluar saat {W}.",
        "{B} memperingatkan {A} untuk tidak menyentuh {O}.",
        "Semua orang di {T} tahu satu aturan: jangan pernah membicarakannya.",
        "{A} hanya ingin hidup tenang. Tapi malam ini, semuanya berubah.",
      ],
    },
    {
      key: "konflik",
      lines: [
        "Lalu terdengar suara ketukan di pintu.",
        "{O} hilang dari tempatnya. Tidak ada yang melihat siapa yang mengambilnya.",
        "{A} menemukan {O} di tempat yang seharusnya tidak mungkin.",
        "Seseorang meninggalkan jejak basah menuju {T}.",
        "{B} menghilang tanpa jejak, hanya menyisakan satu pesan singkat.",
      ],
    },
    {
      key: "klimaks",
      lines: [
        "Ketika {A} membuka pintu, tidak ada siapa pun di sana.",
        "{A} menyalakan lampu, dan melihat sesuatu yang membuat darahnya dingin.",
        "Suara itu kembali. Kali ini dari dalam rumah.",
        "Di balik pintu itu, {A} melihat {O} sedang menunggunya.",
        "Kebenaran itu jauh lebih buruk dari yang {A} bayangkan.",
      ],
    },
    {
      key: "resolusi",
      lines: [
        "Sampai hari ini, {A} tidak pernah berani keluar saat {W}.",
        "Tapi ada satu pertanyaan yang masih mengganggu {A}.",
        "Sejak malam itu, {T} tidak pernah sama lagi.",
        "{A} akhirnya tahu siapa yang selama ini mengawasinya.",
      ],
    },
    {
      key: "cta",
      lines: [
        "Kalau kamu jadi {A}, apa yang akan kamu lakukan?",
        "Menurutmu, siapa yang sebenarnya bersalah?",
        "Tulis jawabanmu di komentar, sebelum episode berikutnya.",
        "Pilih: hadapi, atau lari?",
      ],
    },
  ],
  horor: [
    {
      key: "hook",
      lines: [
        "Kampung itu punya satu pantangan yang tidak boleh dilanggar.",
        "{A} tidak percaya cerita tentang {T}.",
        "Malam itu, mereka memutuskan untuk membuktikannya sendiri.",
        "Ada satu rumah di {T} yang tidak pernah kosong.",
      ],
    },
    {
      key: "setup",
      lines: [
        "Orang-orang bilang, siapa pun yang masuk tidak pernah kembali.",
        "{B} hanya tertawa. Menurutnya itu cuma cerita orang tua.",
        "{A} datang ke {T} hanya untuk mencari konten.",
        "Sejak awal, {O} sudah terasa aneh di tangan {A}.",
      ],
    },
    {
      key: "konflik",
      lines: [
        "Begitu pintu terbuka, udara di dalam terasa jauh lebih dingin.",
        "Lampu mati, lalu menyala lagi. Tapi posisi barangnya berubah.",
        "Mereka mendengar suara langkah, padahal tidak ada siapa pun.",
        "{O} tiba-tiba bergerak dengan sendirinya.",
      ],
    },
    {
      key: "klimaks",
      lines: [
        "{A} menoleh, dan melihat {B} berdiri di ujung lorong. Tapi {B} ada di sebelahnya.",
        "Sesosok bayangan muncul di belakang {B}.",
        "Suara itu menyebut nama {A} dengan sangat jelas.",
        "{A} berlari, tapi setiap pintu membawanya kembali ke ruangan yang sama.",
      ],
    },
    {
      key: "resolusi",
      lines: [
    "Hingga kini, {A} masih mendengar suara itu setiap malam.",
        "Mereka berhasil keluar. Tapi bukan semua dari mereka.",
        "Kampung itu tetap diam. Seolah tidak pernah terjadi apa-apa.",
        "{A} menyimpan satu bukti. Dan bukti itu masih bergerak.",
      ],
    },
    {
      key: "cta",
      lines: [
        "Kamu berani masuk ke {T} sendirian?",
        "Kalau suara itu memanggil namamu, kamu jawab atau diam?",
        "Tulis di komentar: kamu percaya atau tidak?",
        "Ada yang pernah mengalami hal serupa?",
      ],
    },
  ],
  keluarga: [
    {
      key: "hook",
      lines: [
        "Ada hal yang tidak pernah {A} katakan pada {B}.",
        "{A} pulang setelah sepuluh tahun pergi.",
        "Rumah itu masih sama. Tapi {B} sudah tidak sama.",
        "Sejak {W}, semuanya berubah di rumah ini.",
      ],
    },
    {
      key: "setup",
      lines: [
        "{A} pergi karena tidak sanggup menghadapi {B}.",
        "Sepuluh tahun, tanpa kabar, tanpa pulang.",
        "{B} selalu menyimpan {O} di tempat yang sama.",
        "Di {T}, setiap sudut menyimpan kenangan yang menyakitkan.",
      ],
    },
    {
      key: "konflik",
      lines: [
        "Malam itu, mereka bertengkar lagi. Lebih keras dari sebelumnya.",
        "{B} menangis, tapi berusaha menyembunyikannya.",
        "{A} menemukan surat yang tidak pernah dikirim {B}.",
        "Ternyata {B} tahu semuanya sejak lama.",
      ],
    },
    {
      key: "klimaks",
      lines: [
        "{A} akhirnya mengucapkan tiga kata yang ditahan sepuluh tahun.",
        "Untuk pertama kalinya, {A} memeluk {B} tanpa ragu.",
        "\"Aku sudah memaafkanmu,\" kata {B} pelan.",
        "{A} menangis. Bukan karena sedih, tapi karena lega.",
      ],
    },
    {
      key: "resolusi",
      lines: [
        "Tidak semua luka punya kata. Sebagian hanya butuh waktu.",
        "Sejak malam itu, rumah itu terasa lebih hangat.",
        "{A} akhirnya pulang. Kali ini, untuk tinggal.",
        "{B} tersenyum. Untuk pertama kalinya dalam sepuluh tahun.",
      ],
    },
    {
      key: "cta",
      lines: [
        "Kalau kamu {A}, kamu akan pulang lebih cepat?",
        "Siapa orang yang ingin kamu minta maafkan hari ini?",
        "Komentar di bawah: satu kata untuk keluargamu.",
        "Bagikan ke orang yang perlu mendengar ini.",
      ],
    },
  ],
  persahabatan: [
    {
      key: "hook",
      lines: [
        "{A} punya satu sahabat yang selalu ada, apa pun yang terjadi.",
        "Persahabatan mereka diuji malam itu.",
        "Semua orang meninggalkan {B}. Kecuali {A}.",
        "Satu keputusan kecil bisa merusak segalanya.",
      ],
    },
    {
      key: "setup",
      lines: [
        "Mereka sudah berteman sejak kelas satu di {T}.",
        "{A} dan {B} selalu pulang bersama, lewat jalan yang sama.",
        "Tapi tahun ini, {B} berubah.",
        "{A} tahu ada yang disembunyikan {B}.",
      ],
    },
    {
      key: "konflik",
      lines: [
        "Kabar itu menyebar ke seluruh sekolah dalam satu hari.",
        "{A} mendengar bahwa {B} membutuhkan uang, dan tidak mengatakan apa pun.",
        "Semua orang menjauh. {A} hampir ikut menjauh.",
        "{B} dikeluarkan dari sekolah karena hal yang tidak ia lakukan.",
      ],
    },
    {
      key: "klimaks",
      lines: [
        "{A} berdiri di depan kelas dan mengatakan kebenaran.",
        "Untuk pertama kalinya, seseorang membela {B}.",
        "{A} menyerahkan tabungannya tanpa berpikir dua kali.",
        "\"Kita hadapi ini bersama,\" kata {A}.",
      ],
    },
    {
      key: "resolusi",
      lines: [
        "Teman sejati tidak selalu bilang iya. Tapi selalu ada.",
        "Tahun itu, mereka lulus bersama.",
        "{B} menangis dan memeluk {A}.",
        "Sampai kini, mereka masih pulang lewat jalan yang sama.",
      ],
    },
    {
      key: "cta",
      lines: [
        "Sebutkan nama sahabatmu di komentar.",
        "Kamu punya teman yang akan membelamu seperti {A}?",
        "Tandai sahabatmu di sini, sebelum terlambat.",
        "Kalau kamu {B}, kamu akan memaafkan {A}?",
      ],
    },
  ],
  religi: [
    {
      key: "hook",
      lines: [
        "Ada malam yang tidak akan pernah {A} lupakan.",
        "Tanda-tanda itu sudah muncul sejak lama. Tapi tidak ada yang peduli.",
        "{A} mendengar kabar itu dari {B}, dan sejak saat itu ia tidak bisa tidur.",
        "Kabut tebal menyelimuti {T}. Dan dengan kabut itu, datanglah {O}.",
      ],
    },
    {
      key: "setup",
      lines: [
        "Awalnya hanya rumor. Kemudian menjadi berita di setiap layar.",
        "{A} hanya seorang biasa. Ia tidak pernah menyangka akan menjadi saksi.",
        "{T} mulai kehilangan listrik, satu per satu.",
        "{B} menyuruh {A} untuk tidak keluar rumah malam itu.",
      ],
    },
    {
      key: "konflik",
      lines: [
        "Lalu, semua suara berhenti. Bahkan suara hujan.",
        "Ada yang berjalan di depan rumah. Lebih tinggi dari manusia.",
        "{O} hilang tanpa jejak. Begitu juga orang yang menjaganya.",
        "Kabar itu benar: {O} telah sampai di {T}.",
      ],
    },
    {
      key: "klimaks",
      lines: [
        "{A} berlari ke masjid, dan hanya menemukan pintu yang terbuka.",
        "Suara azan tidak terdengar lagi. Diganti suara yang tidak ia kenal.",
        "Ayahnya berbisik: jangan pernah membukakan pintu.",
        "{A} membuka Al-Qur'an, dan tangannya gemetar.",
      ],
    },
    {
      key: "resolusi",
      lines: [
        "Yang tersisa hanyalah doa dan harapan.",
        "Sejak malam itu, {A} tidak pernah meninggalkan salat.",
        "Tidak semua cerita berakhir bahagia. Tapi semuanya berakhir dengan jawaban.",
        "Kabar itu belum berakhir. Episode berikutnya masih menunggu.",
      ],
    },
    {
      key: "cta",
      lines: [
        "Kalau kamu sedang diuji hari ini, jawabannya satu: bersabar.",
        "Sudahkah kamu berdoa untuk {T} malam ini?",
        "Tulis amalan apa yang ingin kamu jaga mulai hari ini.",
        "Ceritakan pengalamanmu di komentar, jika kamu bersedia.",
      ],
    },
  ],
  motivasi: [
    {
      key: "hook",
      lines: [
        "Orang-orang sudah menyerah pada {A}.",
        "Tidak ada yang percaya {A} bisa bangkit.",
        "{A} kehilangan semuanya dalam satu hari.",
        "Modal {A} hanya satu: tekad.",
      ],
    },
    {
      key: "setup",
      lines: [
        "{A} gagal ujian, tiga kali berturut-turut.",
        "Biaya hidup di {T} naik, sementara penghasilan {A} makin kecil.",
        "{B} berkata jujur: lebih baik berhenti.",
        "Setiap malam, {A} menulis target yang tidak pernah ia capai.",
      ],
    },
    {
      key: "konflik",
      lines: [
        "Hutang menumpuk. Dan {O} harus diserahkan.",
        "{A} bekerja dua shift tanpa tidur.",
        "Kegagalan itu datang lagi, tepat saat ia paling dekat.",
        "Seorang teman menawarkan jalan pintas yang tidak jujur.",
      ],
    },
    {
      key: "klimaks",
      lines: [
        "{A} memilih bangkit, bukan menyerah.",
        "Untuk pertama kalinya, usahanya dihargai.",
        "\"Aku akan mencoba sekali lagi,\" kata {A}.",
        "Pagi itu, {A} berdiri lebih awal dari sebelumnya.",
      ],
    },
    {
      key: "resolusi",
      lines: [
        "Setahun kemudian, {A} berdiri di tempat yang selalu ia impikan.",
        "Bukan karena keberuntungan. Tapi karena tidak menyerah.",
        "{A} sudah menjadi orang yang dulu hanya ia bayangkan.",
        "Dan semua itu dimulai dari satu pagi yang sulit.",
      ],
    },
    {
      key: "cta",
      lines: [
        "Apa mimpi yang kamu tunda hari ini?",
        "Kalau {A} bisa, kamu juga bisa.",
        "Tulis satu hal yang akan kamu perjuangkan minggu ini.",
        "Tandai temanmu yang sedang butuh semangat.",
      ],
    },
  ],
  cinta: [
    {
      key: "hook",
      lines: [
        "Ada nama yang tidak pernah berhasil {A} hapus dari ingatannya.",
        "Mereka bertemu lagi setelah tujuh tahun.",
        "{A} mengirim pesan yang seharusnya tidak pernah dikirim.",
        "Malam itu, {A} hampir mengatakan yang sebenarnya.",
      ],
    },
    {
      key: "setup",
      lines: [
        "{A} dan {B} dulu selalu pulang bersama.",
        "Tapi sebuah keputusan memisahkan mereka.",
        "Sekarang {B} kembali ke {T}, dengan hidup yang baru.",
        "{A} menyimpan {O} dari masa itu, dan tidak pernah membuangnya.",
      ],
    },
    {
      key: "konflik",
      lines: [
        "{B} akan menikah bulan depan.",
        "{A} belajar bersabar dengan jarak dan waktu.",
        "Mereka bertemu tanpa sengaja, dan tidak ada yang tahu harus berkata apa.",
        "{A} mendengar {B} kini banyak tersenyum sendiri.",
      ],
    },
    {
      key: "klimaks",
      lines: [
        "{A} akhirnya mengucapkan tiga kata itu.",
        "Untuk pertama kalinya sejak lama, mereka berdua diam, saling menatap.",
        "{B} menatap {A} lama, seperti menunggu.",
        "\"Aku sudah bahagia,\" kata {B} dengan suara yang hampir hilang.",
      ],
    },
    {
      key: "resolusi",
      lines: [
        "Tidak semua perasaan harus dimiliki untuk tetap indah.",
        "{A} akhirnya melepas, dengan cara yang tenang.",
        "Bertahun-tahun kemudian, {A} bisa tersenyum saat menyebut nama {B}.",
        "Dan itu sudah cukup.",
      ],
    },
    {
      key: "cta",
      lines: [
        "Kamu pernah melepas seseorang yang masih kamu sayang?",
        "Komentar: nama depan orang itu, tanpa menjelaskan siapa.",
        "Apa yang akan kamu lakukan jika kamu {A}?",
        "Bagikan ke orang yang sedang belajar melepas.",
      ],
    },
  ],
};

export const LOCATION_POOL: Record<Genre, { text: string; time: "pagi" | "siang" | "sore" | "malam" }[]> = {
  misteri: [
    { text: "rumah tua di ujung gang", time: "malam" },
    { text: "jalan kota yang basah oleh hujan", time: "malam" },
    { text: "kamar kecil dengan lampu kuning", time: "malam" },
    { text: "teras rumah saat hujan", time: "malam" },
  ],
  horor: [
    { text: "rumah kosong di ujung kampung", time: "malam" },
    { text: "masjid tua di pinggir kampung", time: "malam" },
    { text: "jalan berlumpur menuju makam", time: "malam" },
    { text: "kamar tidur dengan jendela terbuka", time: "malam" },
  ],
  keluarga: [
    { text: "rumah kecil di pinggir kota", time: "sore" },
    { text: "ruang tamu dengan meja kayu", time: "malam" },
    { text: "dapur tempat ibu memasak", time: "pagi" },
    { text: "teras rumah", time: "sore" },
  ],
  persahabatan: [
    { text: "halaman sekolah", time: "siang" },
    { text: "jalan pulang yang biasa mereka lewati", time: "siang" },
    { text: "ruang kelas yang sepi", time: "sore" },
    { text: "warung kecil dekat sekolah", time: "sore" },
  ],
  religi: [
    { text: "rumah tua di ujung gang", time: "malam" },
    { text: "masjid kampung", time: "malam" },
    { text: "jalan kota yang gelap", time: "malam" },
    { text: "kamar dengan lampu minyak", time: "malam" },
  ],
  motivasi: [
    { text: "kamar sempit dengan satu lampu", time: "malam" },
    { text: "jalan kota sebelum matahari terbit", time: "pagi" },
    { text: "pasar tempat ia berjualan", time: "pagi" },
    { text: "kantor kecil tempat ia bekerja", time: "siang" },
  ],
  cinta: [
    { text: "jalan senja di kota kecil", time: "sore" },
    { text: "halte tempat mereka menunggu", time: "sore" },
    { text: "teras rumah saat hujan", time: "malam" },
    { text: "kafe kecil di sudut kota", time: "sore" },
  ],
};

export const MOOD_POOL: Record<Genre, string[]> = {
  misteri: ["tegang", "gelisah", "misterius", "dramatis"],
  horor: ["takut", "tegang", "kaget", "gelisah"],
  keluarga: ["haru", "sedih", "hangat", "tenang"],
  persahabatan: ["hangat", "tegang", "haru", "dramatis"],
  religi: ["khidmat", "takut", "haru", "dramatis"],
  motivasi: ["sedih", "semangat", "haru", "dramatis"],
  cinta: ["haru", "rindu", "sedih", "hangat"],
};

export const WEATHER_POOL: Record<Genre, string[]> = {
  misteri: ["hujan", "berkabut", "gerimis", "badai"],
  horor: ["berkabut", "hujan", "badai", "gerimis"],
  keluarga: ["cerah", "gerimis", "cerah", "hujan"],
  persahabatan: ["cerah", "gerimis", "cerah", "hujan"],
  religi: ["hujan", "berkabut", "gerimis", "cerah"],
  motivasi: ["cerah", "hujan", "cerah", "gerimis"],
  cinta: ["gerimis", "cerah", "hujan", "cerah"],
};
