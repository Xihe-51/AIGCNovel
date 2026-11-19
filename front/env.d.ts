/// <reference types="vite/client" />

declare module 'qrcode' {
  interface QRCodeToCanvasOptions {
    width?: number
    margin?: number
    scale?: number
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
    color?: { dark?: string; light?: string }
  }

  interface QRCodeApi {
    toCanvas(
      canvas: HTMLCanvasElement,
      text: string,
      options?: QRCodeToCanvasOptions
    ): Promise<void>
  }

  const QRCode: QRCodeApi
  export default QRCode
}
