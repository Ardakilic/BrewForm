import QRCode from 'qrcode';

export async function generateQRCodePng(url: string): Promise<Uint8Array> {
  const buffer = await QRCode.toBuffer(url, {
    type: 'png',
    width: 300,
    margin: 2,
  });
  return new Uint8Array(buffer);
}

export async function generateQRCodeSvg(url: string): Promise<string> {
  return await QRCode.toString(url, {
    type: 'svg',
    width: 300,
    margin: 2,
  });
}