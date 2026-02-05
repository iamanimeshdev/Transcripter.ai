// utils/image.js
import axios from "axios";
import sharp from "sharp";

export async function fetchRandomImage(width = 1200, height = 800) {
  const url = `https://picsum.photos/${width}/${height}`;
  const resp = await axios.get(url, { responseType: "arraybuffer" });
  const buffer = Buffer.from(resp.data);
  return sharp(buffer).png().toBuffer();
}
