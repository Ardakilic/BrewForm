import { useState } from 'react';
import { useFetcher, useLoaderData, useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import type { action, loader, OnboardingSetup } from './OnboardingWizard.data.ts';

const STEPS = ['welcome', 'equipment', 'beans', 'first-brew', 'explore'] as const;

type StepProps = { t: ReturnType<typeof useTranslation>['t'] };

/**
 * Five-step onboarding flow (welcome → equipment → beans → first brew →
 * explore). The saved setups come from the `/onboarding` route loader; Skip and
 * Get Started both submit the `complete` intent to the route action
 * (`OnboardingWizard.data.ts`), refresh the user on success, and navigate home either way.
 */
export function OnboardingWizard() {
  const { t } = useTranslation();
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const { setups } = useLoaderData<typeof loader>();
  const completeFetcher = useFetcher<typeof action>();
  const [step, setStep] = useState(0);
  const [selectedSetupId, setSelectedSetupId] = useState<string | null>(null);
  const [savedBeanId, setSavedBeanId] = useState<string | null>(null);

  useActionFeedback(completeFetcher, {
    onSuccess: () => {
      // Pick up onboardingCompleted, then go home even if the refresh fails.
      void refreshUser()
        .catch(() => undefined)
        .then(() => navigate('/'));
    },
    onError: () => navigate('/'),
  });

  /** Marks onboarding complete (Skip and Get Started share this). */
  function finish() {
    completeFetcher.submit(
      { intent: 'complete' },
      { method: 'post', defaultShouldRevalidate: false },
    );
  }

  const currentStep = STEPS[step];

  return (
    <div className="mx-auto max-w-lg px-6 py-12 text-center">
      {currentStep === 'welcome' && <WelcomeStep t={t} />}
      {currentStep === 'equipment' && (
        <EquipmentStep t={t} setups={setups} onSelect={setSelectedSetupId} />
      )}
      {currentStep === 'beans' && <BeansStep t={t} onBeanSaved={setSavedBeanId} />}
      {currentStep === 'first-brew' && (
        <FirstBrewStep t={t} setupId={selectedSetupId} beanId={savedBeanId} />
      )}
      {currentStep === 'explore' && <ExploreStep t={t} />}

      <div className="mt-8 flex justify-between">
        <button type="button" onClick={finish} className="btn-secondary">
          {t('onboarding.skip')}
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep(Math.min(step + 1, STEPS.length - 1))}
            className="btn-primary"
          >
            {t('onboarding.next')}
          </button>
        ) : (
          <button type="button" onClick={finish} className="btn-primary">
            {t('onboarding.getStarted')}
          </button>
        )}
      </div>

      <div className="mt-6 flex justify-center gap-2">
        {STEPS.map((name, i) => (
          <div
            key={name}
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: i === step ? 'var(--accent-primary)' : 'var(--bg-tertiary)' }}
          />
        ))}
      </div>
    </div>
  );
}

/** Step 1: the welcome message. */
function WelcomeStep({ t }: StepProps) {
  return (
    <>
      <div className="text-6xl mb-4">☕</div>
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.welcome')}
      </h1>
      <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.welcomeDescription')}
      </p>
    </>
  );
}

/**
 * Step 2: pick one of the saved setups (from the route loader), or a link to create one when
 * there are none.
 */
function EquipmentStep({
  t,
  setups,
  onSelect,
}: StepProps & { setups: OnboardingSetup[]; onSelect: (id: string | null) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value || null;
    setSelectedId(id);
    onSelect(id);
  }

  return (
    <>
      <div className="text-6xl mb-4">🔧</div>
      <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.equipment')}
      </h2>
      <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.equipmentDescription')}
      </p>
      {setups.length > 0 ? (
        <select
          value={selectedId ?? ''}
          onChange={handleChange}
          className="mt-4 w-full input-primary"
        >
          <option value="">{t('onboarding.equipment.selectPlaceholder')}</option>
          {setups.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ) : (
        <div className="mt-4">
          <a href="/setups" className="btn-primary inline-block">
            {t('onboarding.equipmentAction')}
          </a>
        </div>
      )}
    </>
  );
}

/**
 * Step 3: quick-add a bean (origin and/or roaster) through the `add-bean` intent of the route
 * action. A failure is non-blocking: the user can add beans later.
 */
function BeansStep({ t, onBeanSaved }: StepProps & { onBeanSaved: (id: string) => void }) {
  const [origin, setOrigin] = useState('');
  const [roaster, setRoaster] = useState('');
  const fetcher = useFetcher<typeof action>();
  const saved = fetcher.state === 'idle' && fetcher.data?.ok === true;

  useActionFeedback(fetcher, {
    onSuccess: (data) => {
      if (data.ok && data.intent === 'add-bean') onBeanSaved(data.beanId);
    },
  });

  /** Submits the quick-add bean form. */
  function handleQuickAdd() {
    if (!origin && !roaster) return;
    fetcher.submit(
      { intent: 'add-bean', origin, roaster },
      { method: 'post', defaultShouldRevalidate: false },
    );
  }

  return (
    <>
      <div className="text-6xl mb-4">🫘</div>
      <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.beans')}
      </h2>
      <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.beansDescription')}
      </p>
      {saved ? (
        <p className="mt-4" style={{ color: 'var(--success)' }}>
          {t('onboarding.beans.saved')}
        </p>
      ) : (
        <div className="mt-4 space-y-3 text-left">
          <input
            type="text"
            placeholder={t('onboarding.beans.originPlaceholder')}
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className="w-full input-primary"
          />
          <input
            type="text"
            placeholder={t('onboarding.beans.roasterPlaceholder')}
            value={roaster}
            onChange={(e) => setRoaster(e.target.value)}
            className="w-full input-primary"
          />
          <button type="button" onClick={handleQuickAdd} className="btn-primary w-full">
            {t('onboarding.beansAction')}
          </button>
        </div>
      )}
      <a
        href="/beans"
        className="text-sm mt-3 inline-block"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {t('onboarding.beans.advancedLink')}
      </a>
    </>
  );
}

/** Step 4: start a first recipe, pre-filled with the chosen setup and bean. */
function FirstBrewStep({
  t,
  setupId,
  beanId,
}: StepProps & { setupId: string | null; beanId: string | null }) {
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
      <div className="text-6xl mb-4">📝</div>
      <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.firstBrew')}
      </h2>
      <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.firstBrewDescription')}
      </p>
      <div className="mt-4">
        <button type="button" onClick={startRecipe} className="btn-primary">
          {t('onboarding.firstBrewAction')}
        </button>
      </div>
    </>
  );
}

/** Step 5: explore public recipes. */
function ExploreStep({ t }: StepProps) {
  return (
    <>
      <div className="text-6xl mb-4">🌍</div>
      <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.explore')}
      </h2>
      <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.exploreDescription')}
      </p>
      <div className="mt-4">
        <a href="/recipes" className="btn-primary inline-block">
          {t('onboarding.exploreAction')}
        </a>
      </div>
    </>
  );
}
