import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { recipeApi } from '../../api/index';
import { EMOJI_TAGS } from '@brewform/shared/constants';

export function RecipeFocusModePage() {
  const { slug } = useParams();
  // deno-lint-ignore no-explicit-any
  const [recipe, setRecipe] = useState<any>(null);

  useEffect(() => {
    if (!slug) return;
    recipeApi.get(slug).then((data) => { setRecipe(data); }).catch(() => {});
  }, [slug]);

  if (!recipe) return <div className="mx-auto max-w-2xl px-6 py-12 text-center" style={{ color: 'var(--text-secondary)' }}>Loading...</div>;

  const v = recipe.currentVersion;
  const emoji = v.emojiTag ? EMOJI_TAGS.find((e: any) => e.key === v.emojiTag) : null;

  return (
    <div className="focus-mode mx-auto max-w-2xl px-6 py-16">
      <button
        type="button"
        onClick={() => globalThis.history.back()}
        className="mb-8 text-sm"
        style={{ color: 'var(--accent-primary)' }}
      >
        ← Back
      </button>

      <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{recipe.title}</h1>
      <p className="mb-8 text-sm" style={{ color: 'var(--text-secondary)' }}>By {recipe.author?.displayName || recipe.author?.username}</p>

      <div className="space-y-6" style={{ lineHeight: '1.8' }}>
        <section>
          <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--accent-primary)' }}>Brew Parameters</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {v.brewMethod && <Param label="Method" value={v.brewMethod.replace(/_/g, ' ')} />}
            {v.drinkType && <Param label="Drink" value={v.drinkType.replace(/_/g, ' ')} />}
            {v.productName && <Param label="Product" value={v.productName} />}
            {v.coffeeBrand && <Param label="Brand" value={v.coffeeBrand} />}
            {v.grinder && <Param label="Grinder" value={v.grinder} />}
            {v.grindSize && <Param label="Grind" value={v.grindSize} />}
            {v.groundWeightGrams && <Param label="Dose" value={`${v.groundWeightGrams}g`} />}
            {v.extractionTimeSeconds && <Param label="Time" value={`${v.extractionTimeSeconds}s`} />}
            {v.extractionVolumeMl && <Param label="Yield" value={`${v.extractionVolumeMl}ml`} />}
            {v.temperatureCelsius && <Param label="Temp" value={`${v.temperatureCelsius}°C`} />}
            {v.brewRatio && <Param label="Ratio" value={`1:${v.brewRatio}`} />}
            {v.rating && <Param label="Rating" value={`${v.rating}/10 ${emoji ? emoji.emoji : ''}`} />}
          </div>
        </section>

        {recipe.tasteNotes.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--accent-primary)' }}>Taste Notes</h2>
            <div className="flex flex-wrap gap-2">
              {recipe.tasteNotes.map((t: any) => (
                <span key={t.id} className="badge">{t.name}</span>
              ))}
            </div>
          </section>
        )}

        {v.personalNotes && (
          <section>
            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--accent-primary)' }}>Notes</h2>
            <p className="whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{v.personalNotes}</p>
          </section>
        )}
      </div>
    </div>
  );
}

function Param({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1" style={{ borderBottom: '1px solid var(--border-primary)' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}