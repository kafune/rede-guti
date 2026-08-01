import React from 'react';
import type { AudiencePreview, WhatsAppContentItem } from '../../whatsapp/types';

const contentText = (item: WhatsAppContentItem) => {
  if (item.type === 'text' || item.type === 'button' || item.type === 'poll' || item.type === 'carousel') return item.text;
  if (item.type === 'document') return item.caption || item.filename || `Mídia ${item.mediaId}`;
  return item.caption || `Mídia ${item.mediaId}`;
};

const reason = {
  INVALID_LENGTH: 'Telefone com tamanho inválido', INVALID_DDD: 'DDD inválido',
  INVALID_SUBSCRIBER: 'Assinante inválido', DUPLICATE: 'Contato duplicado', SUPPRESSED: 'Contato suprimido',
} as const;

export function CampaignPreview({ preview }: { preview: AudiencePreview }) {
  return <section aria-label="Resumo da prévia" className="space-y-5 rounded-2xl border p-5">
    <h2 className="text-xl font-black">Prévia</h2>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <strong>{preview.totals.source} na origem</strong><strong>{preview.totals.valid} válidos</strong>
      <strong>{preview.totals.invalid} inválido{preview.totals.invalid === 1 ? '' : 's'}</strong>
      <strong>{preview.totals.duplicate} duplicado{preview.totals.duplicate === 1 ? '' : 's'}</strong>
      <strong>{preview.totals.suppressed} suprimido{preview.totals.suppressed === 1 ? '' : 's'}</strong>
    </div>
    <div><h3 className="font-black">Amostras personalizadas</h3>
      {preview.samples.length === 0 ? <p>Nenhum destinatário válido.</p> : <ul className="mt-2 space-y-3">
        {preview.samples.map((sample) => <li key={sample.sourceId} className="rounded-xl bg-slate-50 p-3">
          <strong>{sample.personName}</strong><span className="ml-2 text-sm opacity-60">{sample.phoneNormalized}</span>
          {[sample.content.primary, ...sample.content.sequence].map((item, index) => <p key={index}>{contentText(item)}</p>)}
        </li>)}
      </ul>}
    </div>
    {preview.recipients.some(({ exclusionReason }) => exclusionReason) && <div>
      <h3 className="font-black">Exclusões</h3><ul>
        {preview.recipients.filter(({ exclusionReason }) => exclusionReason).map((recipient) =>
          <li key={`${recipient.origin}-${recipient.sourceId}`}>{recipient.personName}: {reason[recipient.exclusionReason!]}</li>)}
      </ul>
    </div>}
  </section>;
}
