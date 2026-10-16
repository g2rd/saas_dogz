import QRCode from "qrcode";

/** Kod QR jako SVG; poziom korekcji M wystarcza do wydruku i ekranu telefonu. */
export async function renderQrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, width: 240, errorCorrectionLevel: "M" });
}
