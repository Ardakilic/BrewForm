import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { recipeApi } from '../../api/index';
import { SEOHead } from '../../components/seo/SEOHead';
import { TasteAutocomplete } from '../../components/taste/TasteAutocomplete';
import { BREW_METHODS, DRINK_TYPES, VISIBILITY_STATES, EMOJI_TAGS } from '@brewform/shared/constants';
import type { BrewMethod, DrinkType, Visibility } from '@brewform/shared/types';

// deno-lint-ignore no-explicit-any
const BREW_METHODS_ANY = BREW_METHODS as unknown as any[];
// deno-lint-ignore no-explicit-any
const DRINK_TYPES_ANY = DRINK_TYPES as unknown as any[];
// deno-lint-ignore no-explicit-any
const VISIBILITY_ANY = VISIBILITY_STATES as unknown as any[];
// deno-lint-ignore no-explicit-any
const EMOJI_ANY = EMOJI_TAGS as unknown as any[];

export function RecipeCreatePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('draft');
  const [brewMethod, setBrewMethod] = useState<BrewMethod>('espresso_machine');
  const [drinkType, setDrinkType] = useState<DrinkType>('espresso');
  const [productName, setProductName] = useState('');
  const [coffeeBrand, setCoffeeBrand] = useState('');
  const [coffeeProcessing, setCoffeeProcessing] = useState('');
  const [grinder, setGrinder] = useState('');
  const [grindSize, setGrindSize] = useState('');
  const [groundWeightGrams, setGroundWeightGrams] = useState('');
  const [extractionTimeSeconds, setExtractionTimeSeconds] = useState('');
  const [extractionVolumeMl, setExtractionVolumeMl] = useState('');
  const [temperatureCelsius, setTemperatureCelsius] = useState('');
  const [personalNotes, setPersonalNotes] = useState('');
  const [rating, setRating] = useState('');
  const [emojiTag, setEmojiTag] = useState('');
  const [tasteNoteIds, setTasteNoteIds] = useState<string[]>([]);

  const compatibleDrinks = DRINK_TYPES_ANY.filter((d: any) => d.compatibleMethods.includes(brewMethod));

  useEffect(() => {
    if (!compatibleDrinks.some((d) => d.value === drinkType)) {
      setDrinkType(compatibleDrinks[0]?.value as DrinkType || 'espresso');
    }
  }, [brewMethod]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data: Record<string, unknown> = {
        title: title.trim(),
        visibility,
        brewMethod,
        drinkType,
        ...(productName ? { productName } : {}),
        ...(coffeeBrand ? { coffeeBrand } : {}),
        ...(coffeeProcessing ? { coffeeProcessing } : {}),
        ...(grinder ? { grinder } : {}),
        ...(grindSize ? { grindSize } : {}),
        ...(groundWeightGrams ? { groundWeightGrams: Number(groundWeightGrams) } : {}),
        ...(extractionTimeSeconds ? { extractionTimeSeconds: Number(extractionTimeSeconds) } : {}),
        ...(extractionVolumeMl ? { extractionVolumeMl: Number(extractionVolumeMl) } : {}),
        ...(temperatureCelsius ? { temperatureCelsius: Number(temperatureCelsius) } : {}),
        ...(personalNotes ? { personalNotes } : {}),
        ...(rating ? { rating: Number(rating) } : {}),
        ...(emojiTag ? { emojiTag } : {}),
        ...(tasteNoteIds.length > 0 ? { tasteNoteIds } : {}),
      };
      const result = await recipeApi.create(data) as Record<string, unknown>;
      navigate(`/recipes/${result.slug}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create recipe';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <SEOHead title="New Recipe" />
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Create Recipe</h1>

      {error && (
        <div className="mb-4 rounded p-3 text-sm" style={{ backgroundColor: 'var(--error)', color: 'white' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Section title="Basic Info">
          <Field label="Title" required>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="input-field" placeholder="My Espresso Recipe" />
          </Field>
          <Field label="Visibility">
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)} className="input-field">
              {VISIBILITY_ANY.map((v: any) => <option key={v.value} value={v.value}>{v.label} — {v.description}</option>)}
            </select>
          </Field>
        </Section>

        <Section title="Brew Configuration">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Brew Method" required>
              <select value={brewMethod} onChange={(e) => setBrewMethod(e.target.value as BrewMethod)} className="input-field">
                {BREW_METHODS_ANY.map((m: any) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Drink Type" required>
              <select value={drinkType} onChange={(e) => setDrinkType(e.target.value as DrinkType)} className="input-field">
                {compatibleDrinks.map((d: any) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Coffee Identity">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Product Name">
              <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} className="input-field" />
            </Field>
            <Field label="Coffee Brand">
              <input type="text" value={coffeeBrand} onChange={(e) => setCoffeeBrand(e.target.value)} className="input-field" />
            </Field>
            <Field label="Processing">
              <input type="text" value={coffeeProcessing} onChange={(e) => setCoffeeProcessing(e.target.value)} className="input-field" placeholder="e.g. washed, natural, honey" />
            </Field>
          </div>
        </Section>

        <Section title="Brew Parameters">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Grinder">
              <input type="text" value={grinder} onChange={(e) => setGrinder(e.target.value)} className="input-field" />
            </Field>
            <Field label="Grind Size">
              <input type="text" value={grindSize} onChange={(e) => setGrindSize(e.target.value)} className="input-field" />
            </Field>
            <Field label="Dose (grams)">
              <input type="number" value={groundWeightGrams} onChange={(e) => setGroundWeightGrams(e.target.value)} className="input-field" step="0.1" />
            </Field>
            <Field label="Extraction Time (seconds)">
              <input type="number" value={extractionTimeSeconds} onChange={(e) => setExtractionTimeSeconds(e.target.value)} className="input-field" />
            </Field>
            <Field label="Yield (ml)">
              <input type="number" value={extractionVolumeMl} onChange={(e) => setExtractionVolumeMl(e.target.value)} className="input-field" step="0.1" />
            </Field>
            <Field label="Temperature (°C)">
              <input type="number" value={temperatureCelsius} onChange={(e) => setTemperatureCelsius(e.target.value)} className="input-field" step="0.5" />
            </Field>
          </div>
        </Section>

        <Section title="Taste & Rating">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Rating (1-10)">
              <input type="number" value={rating} onChange={(e) => setRating(e.target.value)} className="input-field" min="1" max="10" />
            </Field>
            <Field label="How did it taste?">
              <select value={emojiTag} onChange={(e) => setEmojiTag(e.target.value)} className="input-field">
                <option value="">Select...</option>
                {EMOJI_ANY.map((t: any) => <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Taste Notes</label>
            <TasteAutocomplete selectedIds={tasteNoteIds} onSelectionChange={setTasteNoteIds} />
          </div>
        </Section>

        <Section title="Personal Notes">
          <textarea value={personalNotes} onChange={(e) => setPersonalNotes(e.target.value)} className="input-field" rows={4} placeholder="Tips, observations, things to try next time..." />
        </Section>

        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create Recipe'}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
        {label}{required && ' *'}
      </label>
      {children}
    </div>
  );
}