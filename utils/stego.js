// utils/stego.js
import { PNG } from "pngjs";
import crypto from "crypto";

function aesEncryptRaw(plaintext) {
  const passphrase = "ISAA";
  const key = crypto.createHash("sha256").update(passphrase).digest();
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  //  return raw bytes
  return Buffer.concat([iv, encrypted]);  
}

export function embedMessageInPngBuffer(pngBuffer, message) {
  const encryptedRaw = aesEncryptRaw(message);  // <-- raw bytes

  const png = PNG.sync.read(pngBuffer);
  const { width, height, data } = png;

  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(encryptedRaw.length);

  const payload = Buffer.concat([lenBuf, encryptedRaw]); 

  const bitsNeeded = payload.length * 8;
  const bitsAvailable = width * height * 3;

  if (bitsNeeded > bitsAvailable) throw new Error("Message too large");

  let bitIndex = 0;

  for (const byte of payload) {
    for (let b = 7; b >= 0; b--) {

      const bit = (byte >> b) & 1;

      const pixelIdx = Math.floor(bitIndex / 3);
      const channel = bitIndex % 3;

      const dataIdx = pixelIdx * 4 + channel;
      data[dataIdx] = (data[dataIdx] & 0xFE) | bit;

      bitIndex++;
    }
  }

  return PNG.sync.write(png);
}
