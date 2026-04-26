import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
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

export function RecipeEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [bumpVersion, setBumpVersion] = useState(false);

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

  useEffect(() => {
    if (!id) return;
    recipeApi.get(id).then((data) => {
      const r: any = data;
      setTitle(r.title);
      setVisibility(r.visibility as Visibility);
      setBrewMethod(r.currentVersion.brewMethod as BrewMethod);
      setDrinkType(r.currentVersion.drinkType as DrinkType);
      setProductName(r.currentVersion.productName || '');
      setCoffeeBrand(r.currentVersion.coffeeBrand || '');
      setCoffeeProcessing(r.currentVersion.coffeeProcessing || '');
      setGrinder(r.currentVersion.grinder || '');
      setGrindSize(r.currentVersion.grindSize || '');
      setGroundWeightGrams(r.currentVersion.groundWeightGrams?.toString() || '');
      setExtractionTimeSeconds(r.currentVersion.extractionTimeSeconds?.toString() || '');
      setExtractionVolumeMl(r.currentVersion.extractionVolumeMl?.toString() || '');
      setTemperatureCelsius(r.currentVersion.temperatureCelsius?.toString() || '');
      setPersonalNotes(r.currentVersion.personalNotes || '');
      setRating(r.currentVersion.rating?.toString() || '');
      setEmojiTag(r.currentVersion.emojiTag || '');
      setTasteNoteIds((r as any).tasteNotes.map((t: any) => t.id));
    }).catch(() => {
      setError('Failed to load recipe');
    }).finally(() => setFetching(false));
  }, [id]);

  const compatibleDrinks = DRINK_TYPES_ANY.filter((d: any) => d.compatibleMethods.includes(brewMethod));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data: Record<string, unknown> = {
        title: title.trim(),
        visibility,
        brewMethod,
        drinkType,
        bumpVersion,
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
      const result = await recipeApi.update(id, data) as Record<string, unknown>;
      navigate(`/recipes/${result.slug}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update recipe';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (fetching) {
    return <div className="mx-auto max-w-2xl px-6 py-12 text-center" style={{ color: 'var(--text-secondary)' }}>Loading...</div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <SEOHead title="Edit Recipe" />
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Edit Recipe</h1>

      {error && (
        <div className="mb-4 rounded p-3 text-sm" style={{ backgroundColor: 'var(--error)', color: 'white' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card">
          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input type="checkbox" checked={bumpVersion} onChange={(e) => setBumpVersion(e.target.checked)} />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Bump Version (creates a new immutable version)</span>
          </label>
        </div>

        <EditSection title="Basic Info">
          <EditField label="Title" required>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="input-field" />
          </EditField>
          <EditField label="Visibility">
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)} className="input-field">
              {VISIBILITY_ANY.map((v: any) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </EditField>
        </EditSection>

        <EditSection title="Brew Configuration">
          <div className="grid grid-cols-2 gap-4">
            <EditField label="Brew Method" required>
              <select value={brewMethod} onChange={(e) => setBrewMethod(e.target.value as BrewMethod)} className="input-field">
                {BREW_METHODS_ANY.map((m: any) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </EditField>
            <EditField label="Drink Type" required>
              <select value={drinkType} onChange={(e) => setDrinkType(e.target.value as DrinkType)} className="input-field">
                {compatibleDrinks.map((d: any) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </EditField>
          </div>
        </EditSection>

        <EditSection title="Coffee Identity">
          <div className="grid grid-cols-2 gap-4">
            <EditField label="Product Name">
              <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} className="input-field" />
            </EditField>
            <EditField label="Coffee Brand">
              <input type="text" value={coffeeBrand} onChange={(e) => setCoffeeBrand(e.target.value)} className="input-field" />
            </EditField>
            <EditField label="Processing">
              <input type="text" value={coffeeProcessing} onChange={(e) => setCoffeeProcessing(e.target.value)} className="input-field" />
            </EditField>
          </div>
        </EditSection>

        <EditSection title="Brew Parameters">
          <div className="grid grid-cols-2 gap-4">
            <EditField label="Grinder">
              <input type="text" value={grinder} onChange={(e) => setGrinder(e.target.value)} className="input-field" />
            </EditField>
            <EditField label="Grind Size">
              <input type="text" value={grindSize} onChange={(e) => setGrindSize(e.target.value)} className="input-field" />
            </EditField>
            <EditField label="Dose (g)">
              <input type="number" value={groundWeightGrams} onChange={(e) => setGroundWeightGrams(e.target.value)} className="input-field" step="0.1" />
            </EditField>
            <EditField label="Extraction Time (s)">
              <input type="number" value={extractionTimeSeconds} onChange={(e) => setExtractionTimeSeconds(e.target.value)} className="input-field" />
            </EditField>
            <EditField label="Yield (ml)">
              <input type="number" value={extractionVolumeMl} onChange={(e) => setExtractionVolumeMl(e.target.value)} className="input-field" step="0.1" />
            </EditField>
            <EditField label="Temperature (°C)">
              <input type="number" value={temperatureCelsius} onChange={(e) => setTemperatureCelsius(e.target.value)} className="input-field" step="0.5" />
            </EditField>
          </div>
        </EditSection>

        <EditSection title="Taste & Rating">
          <div className="grid grid-cols-2 gap-4">
            <EditField label="Rating (1-10)">
              <input type="number" value={rating} onChange={(e) => setRating(e.target.value)} className="input-field" min="1" max="10" />
            </EditField>
            <EditField label="How did it taste?">
              <select value={emojiTag} onChange={(e) => setEmojiTag(e.target.value)} className="input-field">
                <option value="">Select...</option>
                {EMOJI_ANY.map((t: any) => <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>)}
              </select>
            </EditField>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Taste Notes</label>
            <TasteAutocomplete selectedIds={tasteNoteIds} onSelectionChange={setTasteNoteIds} />
          </div>
        </EditSection>

        <EditSection title="Personal Notes">
          <textarea value={personalNotes} onChange={(e) => setPersonalNotes(e.target.value)} className="input-field" rows={4} />
        </EditSection>

        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
}

function EditSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{title}</h2>
      {children}
    </div>
  );
}

function EditField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
        {label}{required && ' *'}
      </label>
      {children}
    </div>
  );
}