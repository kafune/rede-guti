import React, { useEffect, useMemo, useState } from 'react';
import {
  Church,
  Municipality,
  RegistrationPayload,
  RegistrationTarget,
  SUPPORTER_REGISTRATION_TARGET,
  User
} from '../types';
import {
  getCreatableRegistrationTargets,
  getDefaultCreatableRegistrationTarget,
  getRegistrationTargetLabel,
  getRoleLabel,
  isUserRoleRegistrationTarget
} from '../roleUtils';

interface Props {
  currentUser: User;
  churches: Church[];
  municipalities: Municipality[];
  onSubmit: (payload: RegistrationPayload) => Promise<boolean>;
  onSuccess?: () => void | Promise<void>;
  onCancel?: () => void;
  variant?: 'page' | 'embedded';
}

const SupporterForm: React.FC<Props> = ({
  currentUser,
  churches,
  municipalities,
  onSubmit,
  onSuccess,
  onCancel,
  variant = 'page'
}) => {
  const allowedTargets = useMemo(
    () => getCreatableRegistrationTargets(currentUser.role),
    [currentUser.role]
  );
  const isEmbedded = variant === 'embedded';

  const [target, setTarget] = useState<RegistrationTarget>(
    getDefaultCreatableRegistrationTarget(currentUser.role)
  );
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    password: '',
    devzappLink: ''
  });
  const [supporterForm, setSupporterForm] = useState({
    name: '',
    whatsapp: '',
    churchName: '',
    municipalityName: ''
  });

  useEffect(() => {
    setTarget((currentTarget) =>
      allowedTargets.includes(currentTarget)
        ? currentTarget
        : getDefaultCreatableRegistrationTarget(currentUser.role)
    );
  }, [allowedTargets, currentUser.role]);

  const resetUserForm = () => {
    setUserForm({
      name: '',
      email: '',
      password: '',
      devzappLink: ''
    });
  };

  const resetSupporterForm = () => {
    setSupporterForm({
      name: '',
      whatsapp: '',
      churchName: '',
      municipalityName: ''
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSuccessMessage('');

    let payload: RegistrationPayload;

    if (isUserRoleRegistrationTarget(target)) {
      if (!userForm.name.trim() || !userForm.email.trim() || !userForm.password.trim()) {
        alert('Preencha nome, email e senha.');
        return;
      }

      payload = {
        target,
        name: userForm.name.trim(),
        email: userForm.email.trim(),
        password: userForm.password,
        devzappLink: userForm.devzappLink.trim() || undefined
      };
    } else {
      if (
        !supporterForm.name.trim() ||
        !supporterForm.whatsapp.trim() ||
        !supporterForm.churchName.trim() ||
        !supporterForm.municipalityName.trim()
      ) {
        alert('Preencha nome, WhatsApp, igreja e municipio.');
        return;
      }

      payload = {
        target: SUPPORTER_REGISTRATION_TARGET,
        name: supporterForm.name.trim(),
        whatsapp: supporterForm.whatsapp.trim(),
        churchName: supporterForm.churchName.trim(),
        municipalityName: supporterForm.municipalityName.trim()
      };
    }

    setSaving(true);
    try {
      const success = await onSubmit(payload);
      if (!success) {
        return;
      }

      if (payload.target === SUPPORTER_REGISTRATION_TARGET) {
        resetSupporterForm();
        setSuccessMessage('Apoiador cadastrado com sucesso.');
      } else {
        resetUserForm();
        setSuccessMessage(`${getRoleLabel(payload.target)} cadastrado com sucesso.`);
      }

      if (onSuccess) {
        await onSuccess();
      }
    } finally {
      setSaving(false);
    }
  };

  const submitLabel =
    target === SUPPORTER_REGISTRATION_TARGET
      ? saving
        ? 'CADASTRANDO APOIADOR...'
        : 'CADASTRAR APOIADOR'
      : saving
        ? 'CRIANDO ACESSO...'
        : `CRIAR ${getRegistrationTargetLabel(target).toUpperCase()}`;

  if (!allowedTargets.length) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
        Seu perfil nao possui permissoes de cadastro.
      </div>
    );
  }

  return (
    <div className={isEmbedded ? 'space-y-5' : 'max-w-xl mx-auto animate-fade-up'}>
      {!isEmbedded && (
        <div className="flex items-center gap-4 mb-8 animate-soft-pop">
          {onCancel && (
            <button onClick={onCancel} className="p-2">
              <i className="fa-solid fa-arrow-left text-xl"></i>
            </button>
          )}
          <h2 className="text-3xl font-black">Novo Cadastro</h2>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-sm border dark:border-gray-700 space-y-5 transition-all duration-500 ease-out">
          <div>
            <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-2">
              Perfil a cadastrar
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {allowedTargets.map((allowedTarget) => {
                const isActive = target === allowedTarget;
                return (
                  <button
                    key={allowedTarget}
                    type="button"
                    onClick={() => setTarget(allowedTarget)}
                    className={`rounded-2xl px-4 py-3 text-sm font-black transition-all duration-300 ease-out ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                        : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {getRegistrationTargetLabel(allowedTarget)}
                  </button>
                );
              })}
            </div>
          </div>

          {successMessage && (
            <div className="text-sm text-green-700 font-semibold bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
              {successMessage}
            </div>
          )}

          {isUserRoleRegistrationTarget(target) ? (
            <>
              <div>
                <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-2">
                  Nome Completo
                </label>
                <input
                  type="text"
                  placeholder={`Ex: ${getRegistrationTargetLabel(target)}`}
                  className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={userForm.name}
                  onChange={(event) =>
                    setUserForm((previous) => ({ ...previous, name: event.target.value }))
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-2">
                    Email de acesso
                  </label>
                  <input
                    type="email"
                    placeholder="usuario@exemplo.com"
                    className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={userForm.email}
                    onChange={(event) =>
                      setUserForm((previous) => ({ ...previous, email: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-2">
                    Senha
                  </label>
                  <input
                    type="password"
                    placeholder="Minimo 6 caracteres"
                    className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={userForm.password}
                    onChange={(event) =>
                      setUserForm((previous) => ({ ...previous, password: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-2">
                  Link DevZapp
                </label>
                <input
                  type="text"
                  placeholder="Opcional"
                  className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={userForm.devzappLink}
                  onChange={(event) =>
                    setUserForm((previous) => ({
                      ...previous,
                      devzappLink: event.target.value
                    }))
                  }
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-2">
                  Nome Completo
                </label>
                <input
                  type="text"
                  placeholder="Ex: Joao Silva"
                  className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={supporterForm.name}
                  onChange={(event) =>
                    setSupporterForm((previous) => ({ ...previous, name: event.target.value }))
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-2">
                    WhatsApp
                  </label>
                  <input
                    type="tel"
                    placeholder="119..."
                    className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={supporterForm.whatsapp}
                    onChange={(event) =>
                      setSupporterForm((previous) => ({
                        ...previous,
                        whatsapp: event.target.value
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-2">
                    Municipio
                  </label>
                  <input
                    type="text"
                    list="registration-municipalities"
                    placeholder="Ex: Sao Paulo"
                    className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={supporterForm.municipalityName}
                    onChange={(event) =>
                      setSupporterForm((previous) => ({
                        ...previous,
                        municipalityName: event.target.value
                      }))
                    }
                  />
                  <datalist id="registration-municipalities">
                    {municipalities.map((municipality) => (
                      <option key={municipality.id} value={municipality.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-2">
                  Igreja / Denominacao
                </label>
                <input
                  type="text"
                  list="registration-churches"
                  placeholder="Ex: Igreja Batista Viva"
                  className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={supporterForm.churchName}
                  onChange={(event) =>
                    setSupporterForm((previous) => ({
                      ...previous,
                      churchName: event.target.value
                    }))
                  }
                />
                <datalist id="registration-churches">
                  {churches.map((church) => (
                    <option key={church.id} value={church.name} />
                  ))}
                </datalist>
              </div>
            </>
          )}

          <div className="pt-4 border-t dark:border-gray-700">
            <label className="text-[10px] font-black uppercase opacity-40 ml-2 tracking-widest block mb-2">
              Indicacao vinculada a:
            </label>
            <input
              type="text"
              readOnly
              className="w-full bg-blue-50 dark:bg-blue-900/20 border-none rounded-2xl px-6 py-4 text-blue-700 dark:text-blue-300 font-bold"
              value={currentUser.name || currentUser.email}
            />
            <p className="text-[10px] mt-2 opacity-50 font-bold">
              O cadastro sera relacionado automaticamente ao usuario logado.
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-6 bg-blue-600 text-white rounded-3xl font-black text-xl shadow-2xl shadow-blue-500/30 active:scale-[0.98] transition-all duration-300 ease-out hover:-translate-y-0.5 disabled:opacity-60"
        >
          {submitLabel}
        </button>
      </form>
    </div>
  );
};

export default SupporterForm;
