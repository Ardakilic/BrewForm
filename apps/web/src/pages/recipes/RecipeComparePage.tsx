import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { recipeApi } from '../../api/index';
import { SEOHead } from '../../components/seo/SEOHead';
import { BREW_METHODS, DRINK_TYPES } from '@brewform/shared/constants';

// deno-lint-ignore no-explicit-any
function labelFor(value: string, constants: any) {
  return constants.find((c: any) => c.value === value)?.label || value;
}

export function RecipeComparePage() {
  const { id1, id2 } = useParams();
  // deno-lint-ignore no-explicit-any
  const [recipe1, setRecipe1] = useState<any>(null);
  // deno-lint-ignore no-explicit-any
  const [recipe2, setRecipe2] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id1 || !id2) return;
    setLoading(true);
    Promise.all([
      recipeApi.get(id1).catch(() => null),
      recipeApi.get(id2).catch(() => null),
    ]).then(([r1, r2]) => {
      setRecipe1(r1);
      setRecipe2(r2);
    }).finally(() => setLoading(false));
  }, [id1, id2]);

  if (loading) return <div className="mx-auto max-w-6xl px-6 py-12 text-center" style={{ color: 'var(--text-secondary)' }}>Loading...</div>;
  if (!recipe1 || !recipe2) return <div className="mx-auto max-w-6xl px-6 py-12 text-center" style={{ color: 'var(--text-tertiary)' }}>One or both recipes not found.</div>;

  const v1 = recipe1.currentVersion;
  const v2 = recipe2.currentVersion;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <SEOHead title={`Compare: ${recipe1.title} vs ${recipe2.title}`} />
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Compare Recipes</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--accent-primary)' }}>{recipe1.title}</h2>
          <CompareTable v={v1} tasteNotes={recipe1.tasteNotes} equipment={recipe1.equipment} />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--accent-secondary)' }}>{recipe2.title}</h2>
          <CompareTable v={v2} tasteNotes={recipe2.tasteNotes} equipment={recipe2.equipment} />
        </div>
      </div>
    </div>
  );
}

// deno-lint-ignore no-explicit-any
function CompareTable({ v, tasteNotes, equipment }: { v: any; tasteNotes: { id: string; name: string }[]; equipment: { id: string; name: string; type: string }[] }) {
  return (
    <div className="card">
      <table className="w-full text-sm">
        <tbody>
          <CompareRow label="Brew Method" value={labelFor(v.brewMethod, BREW_METHODS)} />
          <CompareRow label="Drink Type" value={labelFor(v.drinkType, DRINK_TYPES)} />
          <CompareRow label="Dose" value={v.groundWeightGrams ? `${v.groundWeightGrams}g` : '-'} />
          <CompareRow label="Yield" value={v.extractionVolumeMl ? `${v.extractionVolumeMl}ml` : '-'} />
          <CompareRow label="Time" value={v.extractionTimeSeconds ? `${v.extractionTimeSeconds}s` : '-'} />
          <CompareRow label="Temperature" value={v.temperatureCelsius ? `${v.temperatureCelsius}°C` : '-'} />
          <CompareRow label="Ratio" value={v.brewRatio ? `1:${v.brewRatio}` : '-'} />
          <CompareRow label="Rating" value={v.rating ? `${v.rating}/10` : '-'} />
          <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
            <td className="py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Taste Notes</td>
            <td className="py-2" style={{ color: 'var(--text-primary)' }}>{tasteNotes.map((t) => t.name).join(', ') || '-'}</td>
          </tr>
          <tr>
            <td className="py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Equipment</td>
            <td className="py-2" style={{ color: 'var(--text-primary)' }}>{equipment.map((e) => e.name).join(', ') || '-'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CompareRow({ label, value }: { label: string; value: string }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
      <td className="py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</td>
      <td className="py-2" style={{ color: 'var(--text-primary)' }}>{value}</td>
    </tr>
  );
}