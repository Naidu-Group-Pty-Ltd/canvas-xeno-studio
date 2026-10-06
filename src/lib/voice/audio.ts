/**
 * Length of an MP3 from its frame headers, so a generated voiceover's length
 * is known without decoding it. Handles MPEG-1/2/2.5 Layer III, constant or
 * variable bit rate, with or without an ID3v2 tag.
 */
const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

export function mp3Duration(bytes: Uint8Array): number | null {
  let offset = 0;
  if (bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size =
      ((bytes[6]! & 0x7f) << 21) |
      ((bytes[7]! & 0x7f) << 14) |
      ((bytes[8]! & 0x7f) << 7) |
      (bytes[9]! & 0x7f);
    offset = 10 + size;
  }
  let samples = 0;
  let sampleRate = 0;
  let frames = 0;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1]! & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }
    const version = (bytes[offset + 1]! >> 3) & 0x03;
    const layer = (bytes[offset + 1]! >> 1) & 0x03;
    const bitrateIndex = (bytes[offset + 2]! >> 4) & 0x0f;
    const rateIndex = (bytes[offset + 2]! >> 2) & 0x03;
    const padding = (bytes[offset + 2]! >> 1) & 0x01;
    if (
      version === 1 ||
      layer !== 1 ||
      bitrateIndex === 0 ||
      bitrateIndex === 15 ||
      rateIndex === 3
    ) {
      offset += 1;
      continue;
    }
    const bitrate = (version === 3 ? BITRATES_V1 : BITRATES_V2)[bitrateIndex]! * 1000;
    const rate = SAMPLE_RATES[version]![rateIndex]!;
    const perFrame = version === 3 ? 1152 : 576;
    const length = Math.floor(((perFrame / 8) * bitrate) / rate) + padding;
    if (length < 4) {
      offset += 1;
      continue;
    }
    sampleRate = rate;
    samples += perFrame;
    frames += 1;
    offset += length;
  }
  return frames && sampleRate ? Number((samples / sampleRate).toFixed(3)) : null;
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}
