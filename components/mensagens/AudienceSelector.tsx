import React, { useEffect, useState } from 'react';
import type { AudienceFilter } from '../../whatsapp/types';

type Props = {
  value: AudienceFilter;
  onChange: (value: AudienceFilter) => void;
  churchFieldEnabled: boolean;
};

const ids = (value: string) => {
  const parsed = value.split(',').map((item) => item.trim()).filter(Boolean);
  return parsed.length ? parsed : undefined;
};

const idsText = (value?: string[]) => value?.join(', ') ?? '';

const toggled = <T extends string>(values: T[] | undefined, item: T, checked: boolean): T[] | undefined => {
  const next = new Set(values ?? []); checked ? next.add(item) : next.delete(item);
  return next.size ? [...next] : undefined;
};

function IdsInput({ label, value, onChange }: { label: string; value?: string[]; onChange: (value?: string[]) => void }) {
  const [text, setText] = useState(idsText(value));
  useEffect(() => setText(idsText(value)), [value]);
  return <label className="font-semibold">{label}
    <input className="mt-1 w-full rounded-xl border p-3" value={text}
      onChange={(event) => setText(event.target.value)} onBlur={() => onChange(ids(text))} />
  </label>;
}

export function AudienceSelector({ value, onChange, churchFieldEnabled }: Props) {
  const changeType = (type: AudienceFilter['type']) => {
    if (type === 'LEADERS') onChange({ type });
    if (type === 'SUPPORTERS') onChange({ type });
    if (type === 'EVENT_GUESTS') onChange({ type, eventId: '' });
    if (type === 'TEAM_CONTACTS') onChange({ type });
  };

  return (
    <section className="space-y-4" aria-labelledby="audience-heading">
      <h2 id="audience-heading" className="text-xl font-black">Público</h2>
      <label className="block font-semibold">
        Tipo de público
        <select className="mt-1 w-full rounded-xl border p-3" value={value.type}
          onChange={(event) => changeType(event.target.value as AudienceFilter['type'])}>
          <option value="SUPPORTERS">Apoiadores</option>
          <option value="LEADERS">Lideranças</option>
          <option value="EVENT_GUESTS">Convidados de evento</option>
          <option value="TEAM_CONTACTS">Contatos de equipes</option>
        </select>
      </label>

      {value.type === 'SUPPORTERS' && <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="sm:col-span-2"><legend className="font-semibold">Situação dos apoiadores</legend>
          {([['ATIVO', 'Apoiadores ativos'], ['INATIVO', 'Apoiadores inativos']] as const).map(([status, label]) => <label key={status} className="mr-4 inline-flex gap-2">
            <input type="checkbox" checked={value.statuses?.includes(status) ?? false}
              onChange={(event) => onChange({ ...value, statuses: toggled(value.statuses, status, event.target.checked) })} />{label}
          </label>)}
        </fieldset>
        <IdsInput label="IDs de municípios" value={value.municipalityIds} onChange={(municipalityIds) => onChange({ ...value, municipalityIds })} />
        {churchFieldEnabled && <IdsInput label="IDs de igrejas" value={value.churchIds} onChange={(churchIds) => onChange({ ...value, churchIds })} />}
        <IdsInput label="IDs de lideranças" value={value.leaderIds} onChange={(leaderIds) => onChange({ ...value, leaderIds })} />
        <IdsInput label="IDs de apoiadores" value={value.selectedIds} onChange={(selectedIds) => onChange({ ...value, selectedIds })} />
        <label className="font-semibold">Criados a partir de
          <input type="datetime-local" className="mt-1 w-full rounded-xl border p-3" value={value.createdFrom ?? ''}
            onChange={(event) => onChange({ ...value, createdFrom: event.target.value || undefined })} />
        </label>
        <label className="font-semibold">Criados até
          <input type="datetime-local" className="mt-1 w-full rounded-xl border p-3" value={value.createdTo ?? ''}
            onChange={(event) => onChange({ ...value, createdTo: event.target.value || undefined })} />
        </label>
      </div>}

      {value.type === 'LEADERS' && <div className="grid gap-4 sm:grid-cols-2">
        <label className="font-semibold">Perfis
          <select multiple className="mt-1 w-full rounded-xl border p-3" value={value.roles ?? []}
            onChange={(event) => onChange({ ...value, roles: Array.from(event.target.selectedOptions).map(({ value }) => value as any) })}>
            <option value="COORDENADOR">Coordenadores</option><option value="LIDER_REGIONAL">Líderes regionais</option>
            <option value="VERIFICADORA">Verificadoras</option>
          </select>
        </label>
        <label className="font-semibold">Situação
          <select className="mt-1 w-full rounded-xl border p-3" value={value.active === undefined ? '' : String(value.active)}
            onChange={(event) => onChange({ ...value, active: event.target.value === '' ? undefined : event.target.value === 'true' })}>
            <option value="">Todos</option><option value="true">Ativos</option><option value="false">Inativos</option>
          </select>
        </label>
        <label className="font-semibold">Raiz da hierarquia
          <input className="mt-1 w-full rounded-xl border p-3" value={value.hierarchyRootId ?? ''}
            onChange={(event) => onChange({ ...value, hierarchyRootId: event.target.value || undefined })} />
        </label>
        <IdsInput label="IDs selecionados" value={value.selectedIds} onChange={(selectedIds) => onChange({ ...value, selectedIds })} />
      </div>}

      {value.type === 'EVENT_GUESTS' && <div className="grid gap-4 sm:grid-cols-2">
        <label className="font-semibold">ID do evento
          <input required className="mt-1 w-full rounded-xl border p-3" value={value.eventId}
            onChange={(event) => onChange({ ...value, eventId: event.target.value })} />
        </label>
        <IdsInput label="IDs de convidados" value={value.selectedIds} onChange={(selectedIds) => onChange({ ...value, selectedIds })} />
        <fieldset className="sm:col-span-2"><legend className="font-semibold">Situação dos convidados</legend>
          {([
            ['INDICADO', 'Convidados indicados'], ['APROVADO', 'Convidados aprovados'],
            ['RECUSADO', 'Convidados recusados'], ['CONFIRMADO', 'Convidados confirmados'],
            ['PRESENTE', 'Convidados presentes'],
          ] as const).map(([status, label]) => <label key={status} className="mr-4 inline-flex gap-2">
            <input type="checkbox" checked={value.statuses?.includes(status) ?? false}
              onChange={(event) => onChange({ ...value, statuses: toggled(value.statuses, status, event.target.checked) })} />{label}
          </label>)}
        </fieldset>
      </div>}

      {value.type === 'TEAM_CONTACTS' && <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="sm:col-span-2"><legend className="font-semibold">Situação das equipes</legend>
          {([['ATIVA', 'Equipes ativas'], ['INATIVA', 'Equipes inativas']] as const).map(([status, label]) => <label key={status} className="mr-4 inline-flex gap-2">
            <input type="checkbox" checked={value.statuses?.includes(status) ?? false}
              onChange={(event) => onChange({ ...value, statuses: toggled(value.statuses, status, event.target.checked) })} />{label}
          </label>)}
        </fieldset>
        <IdsInput label="IDs de equipes" value={value.teamIds} onChange={(teamIds) => onChange({ ...value, teamIds })} />
        <IdsInput label="IDs de lideranças" value={value.leaderIds} onChange={(leaderIds) => onChange({ ...value, leaderIds })} />
        <IdsInput label="IDs de contatos" value={value.selectedIds} onChange={(selectedIds) => onChange({ ...value, selectedIds })} />
        <fieldset className="sm:col-span-2"><legend className="font-semibold">Tipos de contato</legend>
          {(['DRIVER', 'MEMBER'] as const).map((kind) => <label key={kind} className="mr-4 inline-flex gap-2">
            <input type="checkbox" checked={value.contactKinds?.includes(kind) ?? false} onChange={(event) => {
              onChange({ ...value, contactKinds: toggled(value.contactKinds, kind, event.target.checked) });
            }} />{kind === 'DRIVER' ? 'Motoristas' : 'Membros'}
          </label>)}
        </fieldset>
      </div>}
    </section>
  );
}
