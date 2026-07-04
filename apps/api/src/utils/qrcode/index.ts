import QRCode from 'qrcode';

/** Render a URL as a 300px-wide PNG QR code (2-module quiet zone). */
export async function generateQRCodePng(url: string): Promise<Uint8Array> {
  const buffer = await QRCode.toBuffer(url, {
    type: 'png',
    width: 300,
    margin: 2,
  });
  return new Uint8Array(buffer);
}

/** Render a URL as a 300px-wide SVG QR code string (2-module quiet zone). */
export async function generateQRCodeSvg(url: string): Promise<string> {
  return await QRCode.toString(url, {
    type: 'svg',
    width: 300,
    margin: 2,
  });
}
