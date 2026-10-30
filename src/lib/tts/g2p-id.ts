/**
 * Indonesian grapheme-to-phoneme converter for the Paradee-8M voice.
 *
 * A TypeScript port of the rule-based G2P shipped with ArboTTS
 * (ARBO-TEAM/arboTTS, MIT). It writes IPA the model understands:
 * pepet /ə/ vs taling /e/, ng → ŋ, ny → ɲ, sy → ʃ, kh → x, final k → ʔ,
 * diphthongs ai/au/oi → aj/aw/oj, and c/j/y/g → tʃ/dʒ/j/ɡ.
 */

/** Indonesian words where `e` is a taling /e/ rather than pepet /ə/. */
const KNOWN_TALING = new Set([
  "bebek", "meja", "sore", "capek", "sate", "tempe", "lele", "tante",
  "nenek", "kakek", "kolega", "model", "modern", "konser", "paket", "tiket",
  "presiden", "hotel", "kafe", "periode", "tema", "teks", "pesta", "desa",
  "daerah", "merah", "lewat", "pena", "belok", "tenda", "level", "elemen",
  "kue", "kode", "mode", "ide", "tape", "toge", "onde", "bemo",
]);

/** Roots whose penultimate `e` is pepet /ə/. */
const PEPET_ROOTS = new Set([
  "dengan", "penuh", "beli", "membeli", "dibeli", "pembeli", "pembelian",
  "beri", "memberi", "diberi", "pemberian", "temu", "bertemu", "menemui",
  "kenal", "mengenal", "dikenal", "terkenal", "pegang", "memegang", "dipegang",
  "tekan", "menekan", "ditekan", "tekanan", "renang", "berenang", "perenang",
  "senin", "selasa", "kemarin", "sebentar", "sekarang", "selamat", "semoga",
  "selalu", "semua", "seperti", "sedang", "sendiri", "sembilan", "sepuluh",
  "sebelas", "seratus", "seribu", "sedikit", "tersebut", "pemerintah", "negeri",
  "beras", "kera", "tepi", "teman", "lezat", "dekat", "besar", "cepat",
  "tepat", "berat", "lebat", "tebal", "gelap", "terang", "tenang", "senang",
  "selat", "tepuk", "remuk", "belut", "semut", "leher", "lemah", "kering",
  "keluar", "kembali", "kertas", "kepala", "kelapa", "keluarga", "belum",
  "benar", "benci", "benda", "bengkok", "bentak", "bentang", "bentuk",
  "berani", "berapa", "berkas", "berkat", "bersih", "betul", "cegah",
  "cekik", "celaka", "celana", "cemburu", "cemas", "cengkeram", "cerah",
  "cerita", "cermat", "cermin", "derajat", "deras", "derita", "dermaga",
  "gedung", "geli", "gempa", "gemetar", "gerak", "geram", "gerbang", "gereja",
  "gertak", "hela", "hembus", "hening", "hentak", "henti", "jelajah",
  "jelas", "jelita", "jemput", "jemur", "jendela", "jenderal", "jengkal",
  "jengkel", "jerapah", "jerat", "jerit", "jeruk", "kelabu", "kelasi",
  "kelelawar", "keledai", "kelinci", "kelompok", "keluh", "kemari", "kemarau",
  "kemas", "kembang", "kembar", "kempa", "kempis", "kemudi", "kendali",
  "kendaraan", "kendur", "kental", "kentang", "kentut", "kenyal", "kenyang",
  "kepada", "kepal", "keping", "kepiting", "kepul", "kerak", "keramas",
  "keranjang", "kerbau", "kerikil", "keringat", "keripik", "keris", "keriting",
  "kerudung", "kerumun", "kesal", "kesan", "kesatria", "ketam", "ketat",
  "ketemu", "ketik", "ketika", "ketua", "ketuk", "ketupat", "lebah", "lebam",
  "lebar", "lebih", "lecut", "ledak", "lega", "legam", "lekat", "lekuk", "lelah",
  "lelaki", "leluasa", "lemak", "lemari", "lembab", "lembar", "lembut",
  "lempeng", "lencana", "lengah", "lengan", "lengkap", "lengkung", "lenyap",
  "lepas", "lereng", "lesu", "letak", "letup", "letus", "medan", "megah",
  "melati", "melarat", "menara", "mendarat", "menit", "mentah", "menteri",
  "merak", "merang", "merpati", "mesin", "meski", "mesra", "mewah",
  "neraka", "pedang", "pedas", "pedati", "peduli", "pegawai", "pekan",
  "pelan", "pelangi", "pelat", "pelatuk", "pelopor", "peluit", "peluk", "peluru",
  "pematang", "pemeo", "penat", "pendek", "pendekar", "pendeta", "pengantin",
  "penjara", "perahu", "perak", "perang", "perangkap", "perban", "perca",
  "percaya", "percik", "perdana", "perempuan", "pergi", "perih", "periksa",
  "perintah", "peristiwa", "perkara", "perkasa", "perlahan", "perlu",
  "permaisuri", "pernah", "perosot", "persen", "persis", "pertama", "pertiwi",
  "perut", "pesan", "pesantren", "pesat", "pesona", "petak", "petang", "petani",
  "peti", "petik", "petir", "petualang", "petunjuk", "rebah", "rebung", "rebus",
  "reda", "redam", "redup", "regan", "regang", "regu", "rehat", "rejam", "rekat",
  "rela", "relung", "remang", "remas", "remeh", "rempah", "remuk", "rencana",
]);

const PEPET_PREFIXES = [
  "ber", "bel", "be", "men", "mem", "meng", "me", "per", "pel", "pe", "ter", "te", "se", "ke",
];

const VOWELS = "aeiou";

function vowelIndices(chars: string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < chars.length; i++) if (VOWELS.includes(chars[i])) out.push(i);
  return out;
}

/** Resolve pepet /ə/ vs taling /e/ for one word. */
export function resolvePepet(word: string): string {
  const w = word.toLowerCase();
  if (KNOWN_TALING.has(w)) return w;

  if (PEPET_ROOTS.has(w)) {
    const chars = w.split("");
    const vi = vowelIndices(chars);
    if (vi.length >= 2) {
      const penult = vi[vi.length - 2];
      if (chars[penult] === "e") chars[penult] = "ə";
    } else if (vi.length === 1 && chars[vi[0]] === "e") {
      chars[vi[0]] = "ə";
    }
    return chars.join("");
  }

  for (const pfx of PEPET_PREFIXES) {
    if (w.startsWith(pfx) && w.length > pfx.length + 2) {
      return pfx.replace(/e/g, "ə") + resolvePepet(w.slice(pfx.length));
    }
  }

  const chars = w.split("");
  const vi = vowelIndices(chars);
  if (vi.length >= 2) {
    const penult = vi[vi.length - 2];
    if (chars[penult] === "e") chars[penult] = "ə";
  }
  return chars.join("");
}

const CHAR_MAP: Record<string, string> = { c: "tʃ", j: "dʒ", y: "j", g: "ɡ" };

/** Convert a single Indonesian word to Paradee-compatible IPA. */
export function wordToIdIpa(word: string): string {
  let w = resolvePepet(word);

  // glottal stop for a final `k` (bapak → bapaʔ), like the reference G2P
  if (w.endsWith("k") && w.length > 2) w = `${w.slice(0, -1)}ʔ`;

  w = w
    .replace(/ng/g, "ŋ")
    .replace(/ny/g, "ɲ")
    .replace(/sy/g, "ʃ")
    .replace(/kh/g, "x")
    .replace(/ai/g, "aj")
    .replace(/au/g, "aw")
    .replace(/oi/g, "oj");

  let out = "";
  for (const ch of w) out += CHAR_MAP[ch] ?? ch;
  return out;
}

const PUNCT = /^[.,!?;:—–-]$/;

/** Convert a full Indonesian sentence to IPA. */
export function textToIdIpa(text: string): string {
  const clean = text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  const tokens = clean.match(/[\p{L}\p{N}']+|[.,!?;:—–-]/gu) ?? [];
  const parts = tokens.map((t) => (PUNCT.test(t) ? t : wordToIdIpa(t)));
  return parts.join(" ").replace(/\s+([.,!?;:—–-])/g, "$1");
}

/** Very small Indonesian/English heuristic — the narration here is Indonesian. */
export function detectLang(text: string): "id" | "en" {
  const words = new Set((text.toLowerCase().match(/\b[a-z]+\b/g) ?? []));
  const en = ["the", "is", "are", "this", "that", "and", "to", "of", "in", "for", "with", "we", "you"].filter((w) => words.has(w)).length;
  const id = ["yang", "dan", "di", "ke", "dari", "ini", "itu", "untuk", "pada", "dengan", "adalah", "bisa", "akan"].filter((w) => words.has(w)).length;
  return en > id ? "en" : "id";
}

/**
 * Rough syllable count used to spread word timings across a sentence.
 * Indonesian syllables are nearly one-per-vowel-group; a trailing consonant
 * cluster adds a beat.
 */
export function syllableWeight(word: string): number {
  const clean = word.toLowerCase().replace(/[^\p{L}]/gu, "");
  if (!clean) return 1;
  const groups = clean.match(/[aeiou]+/g);
  let n = groups ? groups.length : 1;
  // final consonant clusters (e.g. "teks", "print") get a little extra air time
  if (/[^aeiou]{2,}$/.test(clean)) n += 0.5;
  return Math.max(1, n);
}
