import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { api } from '../../api/client.ts';

const STEPS = ['welcome', 'equipment', 'beans', 'first-brew', 'explore'] as const;

type StepProps = { t: ReturnType<typeof useTranslation>['t'] };

export function OnboardingWizard() {
  const { t } = useTranslation();
  const { user: _user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

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
      {currentStep === 'equipment' && <EquipmentStep t={t} />}
      {currentStep === 'beans' && <BeansStep t={t} />}
      {currentStep === 'first-brew' && <FirstBrewStep t={t} />}
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

function EquipmentStep({ t }: StepProps) {
  return (
    <>
      <div className='text-6xl mb-4'>🔧</div>
      <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.equipment')}
      </h2>
      <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.equipmentDescription')}
      </p>
      <div className='mt-4'>
        <a href='/setups' className='btn-primary inline-block'>{t('onboarding.equipmentAction')}</a>
      </div>
    </>
  );
}

function BeansStep({ t }: StepProps) {
  return (
    <>
      <div className='text-6xl mb-4'>🫘</div>
      <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.beans')}
      </h2>
      <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.beansDescription')}
      </p>
      <div className='mt-4'>
        <a href='/beans' className='btn-primary inline-block'>{t('onboarding.beansAction')}</a>
      </div>
    </>
  );
}

function FirstBrewStep({ t }: StepProps) {
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
        <a href='/recipes/new' className='btn-primary inline-block'>
          {t('onboarding.firstBrewAction')}
        </a>
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
