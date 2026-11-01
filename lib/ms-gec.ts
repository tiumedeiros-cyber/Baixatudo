/**
 * Token `Sec-MS-GEC` (versão 2) exigido pelo serviço de voz do Microsoft Edge.
 *
 * O algoritmo não é o SHA-256 padrão: usa CS64 + SHA-256 com estado inicial
 * próprio, então foi portado do projeto open-source `edge-tts` (licença GPL-3.0)
 * para cá. O valor muda a cada 5 minutos e é memorizado.
 */

const MASK = 0xFFFFFFFFn;

const SHA256_INITIAL: bigint[] = [
  0x6A09E667n,
  0xBB67AE85n,
  0x3C6EF372n,
  0xA54FF53An,
  0x510E527Fn,
  0x9B05688Cn,
  0x1F83D9ABn,
  0x5BE0CD19n,
];

const SHA256_STATE: bigint[] = [
  0xFD9FBEA2n,
  0x91243CE7n,
  0xBE499094n,
  0xCD2E1E0An,
  0x6C006F49n,
  0x04BD35ABn,
  0xFEB0A7E4n,
  0x03EFFBD2n,
];

const SHA256_SCHEDULE: bigint[] = [
  0xEB24BF9En,
  0x1558691Fn,
  0xA0C09EE2n,
  0x0CFA32BAn,
  0xA622EE8Cn,
  0xD1DD9491n,
  0xC0DD25A0n,
  0xF9E70AB6n,
  0xF0C31573n,
  0x7058CE4En,
  0x7188E606n,
  0x00E5AB33n,
  0xD258B060n,
  0x72766564n,
];

const SHA256_ROUND_CONSTANTS: bigint[] = [
  0x428A2F98n,
  0x71374491n,
  0xB5C0FBCFn,
  0xE9B5DBA5n,
  0x3956C25Bn,
  0x59F111F1n,
  0x923F82A4n,
  0xAB1C5ED5n,
  0xD807AA98n,
  0x12835B01n,
  0x243185BEn,
  0x550C7DC3n,
  0x72BE5D74n,
  0x80DEB1FEn,
  0x9BDC06A7n,
  0xC19BF174n,
  0xE49B69C1n,
  0xEFBE4786n,
  0x0FC19DC6n,
  0x240CA1CCn,
  0x2DE92C6Fn,
  0x4A7484AAn,
  0x5CB0A9DCn,
  0x76F988DAn,
  0x983E5152n,
  0xA831C66Dn,
  0xB00327C8n,
  0xBF597FC7n,
  0xC6E00BF3n,
  0xD5A79147n,
  0x06CA6351n,
  0x14292967n,
  0x27B70A85n,
  0x2E1B2138n,
  0x4D2C6DFCn,
  0x53380D13n,
  0x650A7354n,
  0x766A0ABBn,
  0x81C2C92En,
  0x92722C85n,
  0xA2BFE8A1n,
  0xA81A664Bn,
  0xC24B8B70n,
  0xC76C51A3n,
  0xD192E819n,
  0xD6990624n,
  0xF40E3585n,
  0x106AA070n,
  0x19A4C116n,
  0x1E376C08n,
  0x2748774Cn,
  0x34B0BCB5n,
  0x391C0CB3n,
  0x4ED8AA4An,
  0x5B9CCA4Fn,
  0x682E6FF3n,
  0x748F82EEn,
  0x78A5636Fn,
  0x84C87814n,
  0x8CC70208n,
  0x90BEFFFAn,
  0xA4506CEBn,
  0xBEF9A3F7n,
  0xC67178F2n,
];

const SHA256_ADJUSTMENT = 0xC9DC06A7n;

const SHA256_BLOCK_CONSTANTS: bigint[] = [
  0x428A2F98n,
  0x71374491n,
  0xB5C0FBCFn,
  0xE9B5DBA5n,
  0x3956C25Bn,
  0x59F111F1n,
  0x923F82A4n,
  0xAB1C5ED5n,
  0xD807AA98n,
  0x12835B01n,
  0x243185BEn,
  0x550C7DC3n,
  0x72BE5D74n,
  0x80DEB1FEn,
  0xC9DC06A7n,
  0xC19BF174n,
  0xE49B69C1n,
  0xEFBE4786n,
  0x0FC19DC6n,
  0x240CA1CCn,
  0x2DE92C6Fn,
  0x4A7484AAn,
  0x5CB0A9DCn,
  0x76F988DAn,
  0x983E5152n,
  0xA831C66Dn,
  0xB00327C8n,
  0xBF597FC7n,
  0xC6E00BF3n,
  0xD5A79147n,
  0x06CA6351n,
  0x14292967n,
  0x27B70A85n,
  0x2E1B2138n,
  0x4D2C6DFCn,
  0x53380D13n,
  0x650A7354n,
  0x766A0ABBn,
  0x81C2C92En,
  0x92722C85n,
  0xA2BFE8A1n,
  0xA81A664Bn,
  0xC24B8B70n,
  0xC76C51A3n,
  0xD192E819n,
  0xD6990624n,
  0xF40E3585n,
  0x106AA070n,
  0x19A4C116n,
  0x1E376C08n,
  0x2748774Cn,
  0x34B0BCB5n,
  0x391C0CB3n,
  0x4ED8AA4An,
  0x5B9CCA4Fn,
  0x682E6FF3n,
  0x748F82EEn,
  0x78A5636Fn,
  0x84C87814n,
  0x8CC70208n,
  0x90BEFFFAn,
  0xA4506CEBn,
  0xBEF9A3F7n,
  0xC67178F2n,
];

const SHA256_SIGMA0_ADJ = 0x059C0B80n;
const SHA256_SIGMA1_ADJ = 0x000B92C0n;

const CS64_COEFFICIENTS: [bigint, bigint][] = [
  [0xE82E91B1n, 0xB32700D0n],
  [0x44DE24C6n, 0x88DFF51Dn],
  [0x3BEB65BCn, 0x29514038n],
  [0xC89C5933n, 0xB328CBDFn],
  [0x8D1EC211n, 0xD405B4D5n],
  [0x314EF5D5n, 0x26E55F3Cn],
  [0xE92491B1n, 0x607801C6n],
  [0xF0A5B9D5n, 0x82B2C1FBn],
  [0x06064CF3n, 0xFA51A3DAn],
  [0xDA79FA60n, 0x207CC464n],
  [0xBED20560n, 0x3C3C74F3n],
  [0x89F9C9F8n, 0xD2D14B61n],
  [0x35FA38C6n, 0xBB04A2C1n],
  [0xCB49E3C6n, 0xC5626167n],
];

const CS64_FACTOR = 0x82893933n;
const CS64_ADJ0 = 0xF2F90B1An;
const CS64_ADJ1 = 0x0B1A0000n;

function u(value: bigint) {
  return value & MASK;
}

function rol16(value: bigint) {
  const v = u(value);
  return u((v << 16n) | (v >> 16n));
}

function sigma0(value: bigint) {
  return u((value >> 7n) ^ (value << 25n) ^ (value >> 18n) ^ (value << 14n) ^ (value >> 3n));
}

function sigma1(value: bigint) {
  return u((value >> 17n) ^ (value << 15n) ^ (value >> 19n) ^ (value << 13n) ^ (value >> 10n));
}

function sha256Rounds(state: bigint[], words: bigint[], firstRound = 0): bigint[] {
  let [a, b, c, d, e, f, g, h] = state;
  const constants = firstRound === 14 ? SHA256_BLOCK_CONSTANTS : SHA256_ROUND_CONSTANTS;
  const aligned = Math.min(64, Math.floor((firstRound + 7) / 8) * 8);

  for (let index = firstRound; index < aligned; index += 1) {
    const rotE = e * 0x100000001n;
    const rotA = a * 0x100000001n;
    const t1 =
      h + ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) + (g ^ (e & (f ^ g))) + constants[index] + words[index];
    const t2 = ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) + ((a & b) | (c & (a | b)));
    [a, b, c, d, e, f, g, h] = [u(t1 + t2), a, b, c, u(d + t1), e, f, g];
  }

  for (let index = aligned; index < 64; index += 8) {
    let rotE = e * 0x100000001n;
    let rotA = a * 0x100000001n;
    let t1 =
      h + ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) + (g ^ (e & (f ^ g))) + constants[index] + words[index];
    d = u(d + t1);
    h = u(t1 + ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) + ((a & b) | (c & (a | b))));

    rotE = d * 0x100000001n;
    rotA = h * 0x100000001n;
    t1 =
      g + ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) + (f ^ (d & (e ^ f))) + constants[index + 1] + words[index + 1];
    c = u(c + t1);
    g = u(t1 + ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) + ((h & a) | (b & (h | a))));

    rotE = c * 0x100000001n;
    rotA = g * 0x100000001n;
    t1 =
      f + ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) + (e ^ (c & (d ^ e))) + constants[index + 2] + words[index + 2];
    b = u(b + t1);
    f = u(t1 + ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) + ((g & h) | (a & (g | h))));

    rotE = b * 0x100000001n;
    rotA = f * 0x100000001n;
    t1 =
      e + ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) + (d ^ (b & (c ^ d))) + constants[index + 3] + words[index + 3];
    a = u(a + t1);
    e = u(t1 + ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) + ((f & g) | (h & (f | g))));

    rotE = a * 0x100000001n;
    rotA = e * 0x100000001n;
    t1 =
      d + ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) + (c ^ (a & (b ^ c))) + constants[index + 4] + words[index + 4];
    h = u(h + t1);
    d = u(t1 + ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) + ((e & f) | (g & (e | f))));

    rotE = h * 0x100000001n;
    rotA = d * 0x100000001n;
    t1 =
      c + ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) + (b ^ (h & (a ^ b))) + constants[index + 5] + words[index + 5];
    g = u(g + t1);
    c = u(t1 + ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) + ((d & e) | (f & (d | e))));

    rotE = g * 0x100000001n;
    rotA = c * 0x100000001n;
    t1 =
      b + ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) + (a ^ (g & (h ^ a))) + constants[index + 6] + words[index + 6];
    f = u(f + t1);
    b = u(t1 + ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) + ((c & d) | (e & (c | d))));

    rotE = f * 0x100000001n;
    rotA = b * 0x100000001n;
    t1 =
      a + ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) + (h ^ (f & (g ^ h))) + constants[index + 7] + words[index + 7];
    e = u(e + t1);
    a = u(t1 + ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) + ((b & c) | (d & (b | c))));
  }

  return [a, b, c, d, e, f, g, h];
}

function expandSchedule(words: bigint[], firstWord = 16) {
  for (let index = firstWord; index < 64; index += 1) {
    const x = words[index - 2];
    const y = words[index - 15];
    const s1 = (x >> 17n) ^ (x << 15n) ^ (x >> 19n) ^ (x << 13n) ^ (x >> 10n);
    const s0 = (y >> 7n) ^ (y << 25n) ^ (y >> 18n) ^ (y << 14n) ^ (y >> 3n);
    words.push(u(s1 + words[index - 7] + s0 + words[index - 16]));
  }
}

function sha256Init(data: Buffer): bigint[] {
  const words: bigint[] = new Array(14).fill(0n);
  words.push(BigInt(`0x${data.subarray(0, 3).toString('hex')}`));
  words.push(BigInt(`0x${data.subarray(3, 7).toString('hex')}`));
  for (let index = 16; index < 30; index += 1) {
    let value = SHA256_SCHEDULE[index - 16];
    if (index - 2 >= 14) {
      value += index === 16 ? sigma1(words[index - 2]) ^ SHA256_SIGMA1_ADJ : sigma1(words[index - 2]);
    }
    if (index - 7 >= 14) value += words[index - 7];
    if (index - 15 >= 14) {
      value += index === 29 ? sigma0(words[index - 15]) ^ SHA256_SIGMA0_ADJ : sigma0(words[index - 15]);
    }
    words.push(u(value));
  }
  words.push(
    u(sigma1(words[28]) + words[23] + sigma0(words[15]) + words[14] + SHA256_ADJUSTMENT - SHA256_ROUND_CONSTANTS[14]),
  );
  expandSchedule(words, 31);
  const working = sha256Rounds(SHA256_STATE, words, 14);
  return SHA256_INITIAL.map((value, index) => u(value + working[index]));
}

function sha256Digest(data: Buffer): Buffer {
  if (data.length < 7) throw new Error('token curto');
  const length = 57 + data.length;
  const zeros = ((55 - length) % 64 + 64) % 64;
  const head = Buffer.concat([data.subarray(7), Buffer.from([0x80]), Buffer.alloc(zeros)]);
  const lengthBytes = Buffer.alloc(8);
  lengthBytes.writeBigUInt64BE(BigInt(length * 8));
  const padded = Buffer.concat([head, lengthBytes]);

  let state = sha256Init(data.subarray(0, 7));
  for (let offset = 0; offset < padded.length; offset += 64) {
    const words: bigint[] = [];
    for (let i = 0; i < 16; i += 1) words.push(BigInt(padded.readUInt32BE(offset + i * 4)));
    expandSchedule(words);
    const working = sha256Rounds(state, words);
    state = state.map((value, index) => u(value + working[index]));
  }
  const out = Buffer.alloc(32);
  state.forEach((value, index) => out.writeUInt32BE(Number(value), index * 4));
  return out;
}

function wordsLe4Even(data: Buffer): bigint[] {
  const pad = (4 - (data.length % 4)) % 4;
  const padded = Buffer.concat([data, Buffer.alloc(pad)]);
  const words: bigint[] = [];
  for (let i = 0; i < padded.length; i += 4) {
    words.push(BigInt(padded.readUInt32LE(i)));
  }
  if (words.length % 2) words.push(0n);
  return words;
}

function cs64Digest(data: Buffer, digest: Buffer): [bigint, bigint] {
  const keyA = (BigInt(digest.readUInt32LE(0)) | 1n) & MASK;
  const keyB = (BigInt(digest.readUInt32LE(4)) | 1n) & MASK;
  const factors = [u(keyA * CS64_FACTOR), u(keyB * CS64_FACTOR)];

  const terms: bigint[] = CS64_COEFFICIENTS.map(([coefficient], index) => u(coefficient * factors[index % 2]));
  const offsets: bigint[] = CS64_COEFFICIENTS.map(([, offset]) => offset);

  wordsLe4Even(Buffer.concat([Buffer.from([0]), data])).forEach((word, index) => {
    let term = word * (index % 2 === 0 ? keyA : keyB);
    let offset = rol16(word) * (index % 2 === 0 ? 0xef0569fbn : 0xc31713dbn);
    if (index === 0) {
      term += CS64_ADJ0 * factors[0];
      offset += CS64_ADJ1;
    }
    terms.push(u(term));
    offsets.push(u(offset));
  });

  let swapAcc = 0n;
  let swapLast = 0n;
  let state = 0n;
  let acc = 0n;
  for (let index = 0; index < terms.length; index += 2) {
    const x = terms[index];
    const y = terms[index + 1];

    let t = rol16(u(offsets[index] + x));
    let q = u(t * 0x76f50f34n);
    swapAcc += u(rol16(q) * 0xc3efeA97n) + q;
    t = rol16(u(offsets[index + 1] + y));
    q = u(t * 0x1881ce3cn);
    swapLast = u(rol16(q) * 0x35bd1ec9n + q);
    swapAcc = u(swapAcc + swapLast);

    state = u(state * keyA + x);
    state = u(rol16(state) * 0xcf98b111n);
    state = u(rol16(state) * 0x87085b9fn);
    state = u(rol16(state) * 0x12ceb96dn);
    state = u(rol16(state) * 0x257e1d83n);
    acc = u(acc + state);
    t = u(state * keyB + y);
    t = u(rol16(t) * 0xa27416f5n);
    t = u(rol16(t) * 0xd38396ffn);
    state = u(rol16(u(rol16(t) * 0x7c932b89n)) * 0xbfa49f69n);
    acc = u(acc + state);
  }

  return [swapLast ^ state, swapAcc ^ acc];
}

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WIN_EPOCH = 11644473600;
const BUCKET_SECONDS = 300;

function tokenFor(unixSeconds: number) {
  const seconds = BigInt(Math.floor(unixSeconds) + WIN_EPOCH);
  const ticks = (seconds - (seconds % 300n)) * 10_000_000n;
  const data = Buffer.from(`${ticks}${TRUSTED_CLIENT_TOKEN}`, 'ascii');
  const digest = sha256Digest(data);
  const [low, high] = cs64Digest(data, digest);
  const cs64 = Buffer.alloc(8);
  cs64.writeUInt32LE(Number(low), 0);
  cs64.writeUInt32LE(Number(high), 4);
  return `${cs64.toString('hex').toUpperCase()}-${digest.toString('hex').toUpperCase()}`;
}

let cachedToken = { bucket: -1, token: '' };

/** Token pronto para a query string do WebSocket (renovado a cada 5 minutos). */
export function secMsGec(unixSeconds = Date.now() / 1000) {
  const bucket = Math.floor((unixSeconds + WIN_EPOCH) / BUCKET_SECONDS);
  if (cachedToken.bucket !== bucket) {
    cachedToken = { bucket, token: tokenFor(unixSeconds) };
  }
  return cachedToken.token;
}

export const SEC_MS_GEC_TOKEN = TRUSTED_CLIENT_TOKEN;
