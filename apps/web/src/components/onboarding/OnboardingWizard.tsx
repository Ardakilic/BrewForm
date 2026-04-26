import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';

const STEPS = ['welcome', 'equipment', 'beans', 'first-brew', 'explore'] as const;

export function OnboardingWizard() {
  const { user, refreshUser } = useAuth();
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
    <div className="mx-auto max-w-lg px-6 py-12 text-center">
      {currentStep === 'welcome' && <WelcomeStep />}
      {currentStep === 'equipment' && <EquipmentStep />}
      {currentStep === 'beans' && <BeansStep />}
      {currentStep === 'first-brew' && <FirstBrewStep />}
      {currentStep === 'explore' && <ExploreStep />}

      <div className="mt-8 flex justify-between">
        <button type="button" onClick={skip} className="btn-secondary">Skip</button>
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={() => setStep(Math.min(step + 1, STEPS.length - 1))} className="btn-primary">Next</button>
        ) : (
          <button type="button" onClick={complete} className="btn-primary">Get Started!</button>
        )}
      </div>

      <div className="mt-6 flex justify-center gap-2">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: i === step ? 'var(--accent-primary)' : 'var(--bg-tertiary)' }}
          />
        ))}
      </div>
    </div>
  );
}

function WelcomeStep() {
  return (
    <>
      <div className="text-6xl mb-4">☕</div>
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Welcome to BrewForm{''}!</h1>
      <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>
        Let's set up your brewing profile so you can start logging and sharing your coffee recipes.
      </p>
    </>
  );
}

function EquipmentStep() {
  return (
    <>
      <div className="text-6xl mb-4">🔧</div>
      <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Add Your Equipment</h2>
      <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>
        Set up your espresso machine, grinder, and accessories. You can create setups for different brewing configurations.
      </p>
      <div className="mt-4">
        <a href="/setups" className="btn-primary inline-block">Set Up Equipment</a>
      </div>
    </>
  );
}

function BeansStep() {
  return (
    <>
      <div className="text-6xl mb-4">🫘</div>
      <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Add Your Beans</h2>
      <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>
        Add the coffee beans you currently have so you can track them in your recipes.
      </p>
      <div className="mt-4">
        <a href="/beans" className="btn-primary inline-block">Add Beans</a>
      </div>
    </>
  );
}

function FirstBrewStep() {
  return (
    <>
      <div className="text-6xl mb-4">📝</div>
      <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Log Your First Brew</h2>
      <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>
        Time to record your first recipe! Fill in the brew parameters, taste notes, and personal observations.
      </p>
      <div className="mt-4">
        <a href="/recipes/new" className="btn-primary inline-block">Create Recipe</a>
      </div>
    </>
  );
}

function ExploreStep() {
  return (
    <>
      <div className="text-6xl mb-4">🌍</div>
      <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Explore & Discover</h2>
      <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>
        Browse popular recipes, follow other brewers, and discover new techniques. You're all set!
      </p>
      <div className="mt-4">
        <a href="/recipes" className="btn-primary inline-block">Browse Recipes</a>
      </div>
    </>
  );
}