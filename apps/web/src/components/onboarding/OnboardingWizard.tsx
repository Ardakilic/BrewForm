import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { api } from '../../api/client.ts';

const STEPS = ['welcome', 'equipment', 'beans', 'first-brew', 'explore'] as const;

type StepProps = { t: ReturnType<typeof useTranslation>['t'] };

/**
 * Five-step onboarding flow (welcome → equipment → beans → first brew →
 * explore). Skip/complete both mark onboarding done in preferences and
 * navigate home.
 */
export function OnboardingWizard() {
  const { t } = useTranslation();
  const { user: _user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [selectedSetupId, setSelectedSetupId] = useState<string | null>(null);
  const [savedBeanId, setSavedBeanId] = useState<string | null>(null);

  async function skip() {
    try {
      await api.patch('/preferences', { onboardingCompleted: true } as Record<string, unknown>);
      await refreshUser();
      navigate('/');
    } catch {
      navigate('/');
    }
  }

  async function complete() {
    try {
      await api.patch('/preferences', { onboardingCompleted: true } as Record<string, unknown>);
      await refreshUser();
      navigate('/');
    } catch {
      navigate('/');
    }
  }

  const currentStep = STEPS[step];

  return (
    <div className='mx-auto max-w-lg px-6 py-12 text-center'>
      {currentStep === 'welcome' && <WelcomeStep t={t} />}
      {currentStep === 'equipment' && <EquipmentStep t={t} onSelect={setSelectedSetupId} />}
      {currentStep === 'beans' && <BeansStep t={t} onBeanSaved={setSavedBeanId} />}
      {currentStep === 'first-brew' && (
        <FirstBrewStep t={t} setupId={selectedSetupId} beanId={savedBeanId} />
      )}
      {currentStep === 'explore' && <ExploreStep t={t} />}

      <div className='mt-8 flex justify-between'>
        <button type='button' onClick={skip} className='btn-secondary'>
          {t('onboarding.skip')}
        </button>
        {step < STEPS.length - 1
          ? (
            <button
              type='button'
              onClick={() => setStep(Math.min(step + 1, STEPS.length - 1))}
              className='btn-primary'
            >
              {t('onboarding.next')}
            </button>
          )
          : (
            <button type='button' onClick={complete} className='btn-primary'>
              {t('onboarding.getStarted')}
            </button>
          )}
      </div>

      <div className='mt-6 flex justify-center gap-2'>
        {STEPS.map((_, i) => (
          <div
            key={i}
            className='w-2 h-2 rounded-full'
            style={{ backgroundColor: i === step ? 'var(--accent-primary)' : 'var(--bg-tertiary)' }}
          />
        ))}
      </div>
    </div>
  );
}

function WelcomeStep({ t }: StepProps) {
  return (
    <>
      <div className='text-6xl mb-4'>☕</div>
      <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.welcome')}
      </h1>
      <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.welcomeDescription')}
      </p>
    </>
  );
}

function EquipmentStep({ t, onSelect }: StepProps & { onSelect: (id: string | null) => void }) {
  const [setups, setSetups] = useState<{ id: string; name: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ id: string; name: string }[]>('/setups').then((data) => setSetups(data ?? [])).catch(
      () => {},
    );
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value || null;
    setSelectedId(id);
    onSelect(id);
  }

  return (
    <>
      <div className='text-6xl mb-4'>🔧</div>
      <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.equipment')}
      </h2>
      <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.equipmentDescription')}
      </p>
      {setups.length > 0
        ? (
          <select
            value={selectedId ?? ''}
            onChange={handleChange}
            className='mt-4 w-full input-primary'
          >
            <option value=''>{t('onboarding.equipment.selectPlaceholder')}</option>
            {setups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )
        : (
          <div className='mt-4'>
            <a href='/setups' className='btn-primary inline-block'>
              {t('onboarding.equipmentAction')}
            </a>
          </div>
        )}
    </>
  );
}

function BeansStep({ t, onBeanSaved }: StepProps & { onBeanSaved: (id: string) => void }) {
  const [origin, setOrigin] = useState('');
  const [roaster, setRoaster] = useState('');
  const [saved, setSaved] = useState(false);

  async function handleQuickAdd() {
    if (!origin && !roaster) return;
    try {
      const res = await api.post<{ id: string }>('/beans', { origin, roaster });
      setSaved(true);
      onBeanSaved(res.id);
    } catch { /* user can add beans later */ }
  }

  return (
    <>
      <div className='text-6xl mb-4'>🫘</div>
      <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.beans')}
      </h2>
      <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.beansDescription')}
      </p>
      {saved
        ? <p className='mt-4' style={{ color: 'var(--success)' }}>{t('onboarding.beans.saved')}</p>
        : (
          <div className='mt-4 space-y-3 text-left'>
            <input
              type='text'
              placeholder={t('onboarding.beans.originPlaceholder')}
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className='w-full input-primary'
            />
            <input
              type='text'
              placeholder={t('onboarding.beans.roasterPlaceholder')}
              value={roaster}
              onChange={(e) => setRoaster(e.target.value)}
              className='w-full input-primary'
            />
            <button type='button' onClick={handleQuickAdd} className='btn-primary w-full'>
              {t('onboarding.beansAction')}
            </button>
          </div>
        )}
      <a
        href='/beans'
        className='text-sm mt-3 inline-block'
        style={{ color: 'var(--text-tertiary)' }}
      >
        {t('onboarding.beans.advancedLink')}
      </a>
    </>
  );
}

function FirstBrewStep(
  { t, setupId, beanId }: StepProps & { setupId: string | null; beanId: string | null },
) {
  const navigate = useNavigate();

  function startRecipe() {
    const params = new URLSearchParams();
    if (setupId) params.set('setupId', setupId);
    if (beanId) params.set('beanId', beanId);
    const qs = params.toString();
    navigate(`/recipes/new${qs ? `?${qs}` : ''}`);
  }

  return (
    <>
      <div className='text-6xl mb-4'>📝</div>
      <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.firstBrew')}
      </h2>
      <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.firstBrewDescription')}
      </p>
      <div className='mt-4'>
        <button type='button' onClick={startRecipe} className='btn-primary'>
          {t('onboarding.firstBrewAction')}
        </button>
      </div>
    </>
  );
}

function ExploreStep({ t }: StepProps) {
  return (
    <>
      <div className='text-6xl mb-4'>🌍</div>
      <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.explore')}
      </h2>
      <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.exploreDescription')}
      </p>
      <div className='mt-4'>
        <a href='/recipes' className='btn-primary inline-block'>{t('onboarding.exploreAction')}</a>
      </div>
    </>
  );
}
