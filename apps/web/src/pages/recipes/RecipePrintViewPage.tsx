import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { recipeApi } from '../../api/index';
import { EMOJI_TAGS } from '@brewform/shared/constants';

export function RecipePrintViewPage() {
  const { slug } = useParams();
  const [recipe, setRecipe] = useState<any>(null);

  useEffect(() => {
    if (!slug) return;
    recipeApi.get(slug).then((data) => { setRecipe(data); }).catch(() => {});
  }, [slug]);

  useEffect(() => {
    if (recipe) {
      setTimeout(() => globalThis.print(), 300);
    }
  }, [recipe]);

  if (!recipe) return <div className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>Loading...</div>;

  const v = recipe.currentVersion;
  const emoji = v.emojiTag ? EMOJI_TAGS.find((e: any) => e.key === v.emojiTag) : null;

  return (
    <div className="print-container mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-bold mb-1">{recipe.title}</h1>
      <p className="text-sm mb-4">By {recipe.author?.displayName || recipe.author?.username} — {new Date(recipe.createdAt).toLocaleDateString()}</p>

      <table className="w-full mb-4 text-sm">
        <tbody>
          {v.brewMethod && <tr><td className="py-1 font-medium pr-4">Brew Method</td><td>{v.brewMethod.replace(/_/g, ' ')}</td></tr>}
          {v.drinkType && <tr><td className="py-1 font-medium pr-4">Drink Type</td><td>{v.drinkType.replace(/_/g, ' ')}</td></tr>}
          {v.productName && <tr><td className="py-1 font-medium pr-4">Product Name</td><td>{v.productName}</td></tr>}
          {v.coffeeBrand && <tr><td className="py-1 font-medium pr-4">Coffee Brand</td><td>{v.coffeeBrand}</td></tr>}
          {v.coffeeProcessing && <tr><td className="py-1 font-medium pr-4">Processing</td><td>{v.coffeeProcessing}</td></tr>}
          {v.grinder && <tr><td className="py-1 font-medium pr-4">Grinder</td><td>{v.grinder}</td></tr>}
          {v.grindSize && <tr><td className="py-1 font-medium pr-4">Grind Size</td><td>{v.grindSize}</td></tr>}
          {v.groundWeightGrams && <tr><td className="py-1 font-medium pr-4">Dose</td><td>{v.groundWeightGrams}g</td></tr>}
          {v.extractionTimeSeconds && <tr><td className="py-1 font-medium pr-4">Time</td><td>{v.extractionTimeSeconds}s</td></tr>}
          {v.extractionVolumeMl && <tr><td className="py-1 font-medium pr-4">Yield</td><td>{v.extractionVolumeMl}ml</td></tr>}
          {v.temperatureCelsius && <tr><td className="py-1 font-medium pr-4">Temperature</td><td>{v.temperatureCelsius}°C</td></tr>}
          {v.brewRatio && <tr><td className="py-1 font-medium pr-4">Ratio</td><td>1:{v.brewRatio}</td></tr>}
          {v.rating && <tr><td className="py-1 font-medium pr-4">Rating</td><td>{v.rating}/10 {emoji ? emoji.emoji : ''}</td></tr>}
        </tbody>
      </table>

      {recipe.tasteNotes.length > 0 && (
        <div className="mb-4">
          <h2 className="font-semibold mb-1">Taste Notes</h2>
          <p>{(recipe.tasteNotes as any[]).map((t: any) => t.name).join(', ')}</p>
        </div>
      )}

      {recipe.equipment.length > 0 && (
        <div className="mb-4">
          <h2 className="font-semibold mb-1">Equipment</h2>
          <p>{(recipe.equipment as any[]).map((e: any) => e.name).join(', ')}</p>
        </div>
      )}

      {v.personalNotes && (
        <div className="mb-4">
          <h2 className="font-semibold mb-1">Personal Notes</h2>
          <p className="whitespace-pre-wrap">{v.personalNotes}</p>
        </div>
      )}

      <div className="text-xs text-gray-500 mt-8">BrewForm — {globalThis.location.href}</div>
    </div>
  );
}