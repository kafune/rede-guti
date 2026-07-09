import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface Props {
  url: string;
  ownerName?: string;
}

const QR_OPTIONS = {
  margin: 2,
  errorCorrectionLevel: 'M' as const,
  color: { dark: '#111827', light: '#ffffff' }
};

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const ShareLinkQrCode: React.FC<Props> = ({ url, ownerName }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [downloadLabel, setDownloadLabel] = useState('Baixar QR code');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, { ...QR_OPTIONS, width: 240 })
      .then((generated) => active && setDataUrl(generated))
      .catch(() => active && setDataUrl(null)); // não-crítico: sem QR, o bloco some
    return () => {
      active = false;
    };
  }, [url]);

  const handleDownload = async () => {
    try {
      // Alta resolução para impressão em material de evento.
      const highRes = await QRCode.toDataURL(url, { ...QR_OPTIONS, width: 1024 });
      const slug = ownerName ? slugify(ownerName) : '';
      const link = document.createElement('a');
      link.href = highRes;
      link.download = slug ? `qrcode-cadastro-${slug}.png` : 'qrcode-cadastro.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setDownloadLabel('QR code baixado!');
      window.setTimeout(() => setDownloadLabel('Baixar QR code'), 1500);
    } catch {
      setDownloadLabel('Nao foi possivel baixar');
      window.setTimeout(() => setDownloadLabel('Baixar QR code'), 1800);
    }
  };

  if (!dataUrl) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 mt-4 pt-4 border-t dark:border-gray-700">
      {/* Fundo branco fixo: mantém o QR escaneável também no dark mode */}
      <div className="bg-white p-3 rounded-2xl border dark:border-gray-700 shrink-0">
        <img
          src={dataUrl}
          alt="QR code do link de cadastro"
          className="w-36 h-36"
          width={144}
          height={144}
        />
      </div>
      <div className="flex-1 text-center sm:text-left">
        <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">
          QR code do seu link
        </p>
        <p className="text-sm opacity-60 mb-3">
          Aponte a câmera do celular para abrir o cadastro. Baixe a imagem para
          imprimir ou mostrar em eventos.
        </p>
        <button
          onClick={handleDownload}
          className="px-5 py-3 rounded-2xl font-bold text-sm bg-gray-100 dark:bg-gray-900 active:scale-95 transition-all duration-300 ease-out hover:-translate-y-0.5"
        >
          <i className="fa-solid fa-download mr-2"></i>
          {downloadLabel}
        </button>
      </div>
    </div>
  );
};

export default ShareLinkQrCode;
