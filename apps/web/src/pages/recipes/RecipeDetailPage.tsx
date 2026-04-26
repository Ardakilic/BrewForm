import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router';
import { recipeApi } from '../../api/index';
import { SEOHead } from '../../components/seo/SEOHead';
import { RecipeJsonLd } from '../../components/seo/JsonLd';
import { LikeButton } from '../../components/recipe/LikeButton';
import { FavouriteButton } from '../../components/recipe/FavouriteButton';
import { CommentSection } from '../../components/recipe/CommentSection';
import { RecipeQRCode } from '../../components/qrcode/RecipeQRCode';
import { PrintButton, FocusModeButton } from '../../components/recipe/PrintButton';
import { useAuth } from '../../contexts/AuthContext';
import { EMOJI_TAGS } from '@brewform/shared/constants';

export function RecipeDetailPage() {
  const { slug } = useParams();
  const { user, isAuthenticated } = useAuth();
  // deno-lint-ignore no-explicit-any
  const [recipe, setRecipe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    recipeApi.get(slug).then((data) => {
      setRecipe(data);
    }).catch(() => {
    }).finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <div className="mx-auto max-w-4xl px-6 py-12 text-center" style={{ color: 'var(--text-secondary)' }}>Loading...</div>;
  }

  if (!recipe) {
    return <div className="mx-auto max-w-4xl px-6 py-12 text-center" style={{ color: 'var(--text-tertiary)' }}>Recipe not found.</div>;
  }

  const isOwner = user?.id === recipe.authorId;
  const v = recipe.currentVersion;
  // deno-lint-ignore no-explicit-any
  const emojiInfo = v.emojiTag ? EMOJI_TAGS.find((e: any) => e.key === v.emojiTag) : null;

  return (
    <div className={focusMode ? 'focus-mode' : ''}>
      <SEOHead
        title={recipe.title}
        description={v.personalNotes || `${v.brewMethod} ${v.drinkType} recipe by ${recipe.author?.displayName || recipe.author?.username}`}
        image={recipe.photos?.[0]?.url}
      />
      <RecipeJsonLd
        title={recipe.title}
        description={v.personalNotes || ''}
        slug={recipe.slug}
        authorName={recipe.author?.displayName || recipe.author?.username || ''}
        datePublished={recipe.createdAt}
      />

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{recipe.title}</h1>
            <div className="flex items-center gap-2 mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <Link to={`/u/${recipe.author?.username}`} style={{ color: 'var(--accent-primary)' }}>
                {recipe.author?.displayName || recipe.author?.username}
              </Link>
              <span>•</span>
              <span className="badge">{recipe.visibility}</span>
              {recipe.forkedFromSlug && (
                <>
                  <span>•</span>
                  <Link to={`/recipes/${recipe.forkedFromSlug}`} style={{ color: 'var(--accent-primary)' }}>
                    Forked from original
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {isOwner && <Link to={`/recipes/${recipe.id}/edit`} className="btn-secondary text-sm">Edit</Link>}
            <PrintButton slug={recipe.slug} />
            <FocusModeButton isFocusMode={focusMode} onToggle={() => setFocusMode(!focusMode)} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="md:col-span-2 space-y-4">
            <div className="card">
              <h2 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Brew Parameters</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <ParamRow label="Brew Method" value={v.brewMethod.replace(/_/g, ' ')} />
                <ParamRow label="Drink Type" value={v.drinkType.replace(/_/g, ' ')} />
                <ParamRow label="Product Name" value={v.productName} />
                <ParamRow label="Coffee Brand" value={v.coffeeBrand} />
                <ParamRow label="Processing" value={v.coffeeProcessing} />
                <ParamRow label="Grinder" value={v.grinder} />
                <ParamRow label="Grind Size" value={v.grindSize} />
                <ParamRow label="Dose" value={v.groundWeightGrams ? `${v.groundWeightGrams}g` : null} />
                <ParamRow label="Extraction Time" value={v.extractionTimeSeconds ? `${v.extractionTimeSeconds}s` : null} />
                <ParamRow label="Yield" value={v.extractionVolumeMl ? `${v.extractionVolumeMl}ml` : null} />
                <ParamRow label="Temperature" value={v.temperatureCelsius ? `${v.temperatureCelsius}°C` : null} />
                <ParamRow label="Ratio" value={v.brewRatio ? `1:${v.brewRatio}` : null} />
                <ParamRow label="Flow Rate" value={v.flowRate ? `${v.flowRate} ml/s` : null} />
              </div>
            </div>

            {v.personalNotes && (
              <div className="card">
                <h2 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Personal Notes</h2>
                <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{v.personalNotes}</p>
              </div>
            )}

            {recipe.tasteNotes.length > 0 && (
              <div className="card">
                <h2 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Taste Notes</h2>
                <div className="flex flex-wrap gap-2">
                  {recipe.tasteNotes.map((note: any) => (
                    <span key={note.id} className="badge">{note.name}</span>
                  ))}
                </div>
              </div>
            )}

            {recipe.equipment.length > 0 && (
              <div className="card">
                <h2 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Equipment</h2>
                <div className="flex flex-wrap gap-2">
                  {recipe.equipment.map((eq: any) => (
                    <span key={eq.id} className="badge" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>{eq.name} ({eq.type})</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Rating</span>
                {emojiInfo && <span title={emojiInfo.label}>{emojiInfo.emoji}</span>}
              </div>
              {v.rating && (
                <div className="text-2xl font-bold" style={{ color: 'var(--accent-primary)' }}>
                  {v.rating}/10
                </div>
              )}
            </div>

            <div className="card flex flex-col gap-3">
              <LikeButton recipeId={recipe.id} initialLiked={recipe.userLiked} initialCount={recipe.likeCount} />
              {isAuthenticated && <FavouriteButton recipeId={recipe.id} initialFavourited={recipe.userFavourited} initialCount={0} />}
              {isAuthenticated && !isOwner && (
                <Link to={`/recipes/${recipe.id}/fork`} className="btn-secondary text-sm text-center">🍴 Fork Recipe</Link>
              )}
            </div>

            <RecipeQRCode slug={recipe.slug} visibility={recipe.visibility} />
          </div>
        </div>

        <CommentSection recipeId={recipe.id} recipeAuthorId={recipe.authorId} />
      </div>
    </div>
  );
}

function ParamRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between py-1" style={{ borderBottom: '1px solid var(--border-primary)' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}