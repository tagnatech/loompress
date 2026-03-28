import fs from 'node:fs/promises';

interface FileSignature {
  mimeType: string;
  matches: (buffer: Buffer) => boolean;
}

const SIGNATURES: FileSignature[] = [
  {
    mimeType: 'image/jpeg',
    matches: buffer => buffer.length >= 3
      && buffer[0] === 0xff
      && buffer[1] === 0xd8
      && buffer[2] === 0xff,
  },
  {
    mimeType: 'image/png',
    matches: buffer => buffer.length >= 8
      && buffer[0] === 0x89
      && buffer[1] === 0x50
      && buffer[2] === 0x4e
      && buffer[3] === 0x47
      && buffer[4] === 0x0d
      && buffer[5] === 0x0a
      && buffer[6] === 0x1a
      && buffer[7] === 0x0a,
  },
  {
    mimeType: 'image/gif',
    matches: buffer => buffer.length >= 6
      && (buffer.subarray(0, 6).toString('ascii') === 'GIF87a'
        || buffer.subarray(0, 6).toString('ascii') === 'GIF89a'),
  },
  {
    mimeType: 'image/webp',
    matches: buffer => buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

export async function detectImageMimeType(filePath: string): Promise<string | null> {
  const fileHandle = await fs.open(filePath, 'r');

  try {
    const buffer = Buffer.alloc(32);
    await fileHandle.read(buffer, 0, buffer.length, 0);
    const match = SIGNATURES.find(signature => signature.matches(buffer));
    return match?.mimeType ?? null;
  } finally {
    await fileHandle.close();
  }
}

export async function isSafeUploadedImage(filePath: string, declaredMimeType: string): Promise<boolean> {
  const detected = await detectImageMimeType(filePath);
  return Boolean(detected && detected === declaredMimeType);
}
