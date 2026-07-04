import { useEffect, useRef } from 'react';
import {
  Link,
  redirect,
  useFetcher,
  useLoaderData,
  useNavigate,
  useNavigation,
  useParams,
} from 'react-router';
import { ApiError, commentApi, recipeApi } from '../../api/index.ts';
import type { CommentData, RecipeDetailResponse, TasteNoteFlatItem } from '../../api/types.ts';
import { getTasteNotesCached } from '../../api/static-cache.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { RecipeDetailSkeleton } from '../../components/ui/Skeleton.tsx';
import { RecipeJsonLd } from '../../components/seo/JsonLd.tsx';
import { LikeButton } from '../../components/recipe/LikeButton.tsx';
import { FavouriteButton } from '../../components/recipe/FavouriteButton.tsx';
import { ForkCard } from '../../components/recipe/ForkCard.tsx';
import { CommentSection } from '../../components/recipe/CommentSection.tsx';
import { StarRating } from '../../components/recipe/StarRating.tsx';
import { BreadcrumbNav } from '../../components/recipe/BreadcrumbNav.tsx';
import { MetadataBadges } from '../../components/recipe/MetadataBadges.tsx';
import { StatCards } from '../../components/recipe/StatCards.tsx';
import { BeanSection } from '../../components/recipe/BeanSection.tsx';
import { BrewTimeline } from '../../components/recipe/BrewTimeline.tsx';
import { EquipmentSection } from '../../components/recipe/EquipmentSection.tsx';
import { TastingNotesSection } from '../../components/recipe/TastingNotesSection.tsx';
import { RecipeNotesSection } from '../../components/recipe/RecipeNotesSection.tsx';
import { ShareSection } from '../../components/recipe/ShareSection.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useUnitSystem } from '../../hooks/useUnitSystem.ts';
import { EMOJI_TAGS_LIST } from '@brewform/shared/constants';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('RecipeDetailPage');

export interface DetailLoaderData {
  recipe: RecipeDetailResponse;
  tasteNotes: TasteNoteFlatItem[];
  comments: {
    data: CommentData[];
    meta: { pagination: { total: number; page: number; perPage: number; totalPages: number } };
  };
}

/**
 * Fetches recipe `:slug` (404s propagate as a 404 Response), then the
 * cached taste-note list and first comments page in parallel; QR visits
 * (`?from=qr`) to non-public recipes redirect to `/recipes/unavailable`.
 * Returns `{ recipe, tasteNotes, comments }`.
 */
export const loader = async (
  { params, request }: { params: { slug: string }; request: Request },
): Promise<DetailLoaderData> => {
  const fromQr = new URL(request.url).searchParams.get('from') === 'qr';
  let recipe: RecipeDetailResponse;
  try {
    recipe = await recipeApi.get(params.slug);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      throw new Response('Not Found', { status: 404 });
    }
    throw err;
  }
  if (fromQr && recipe.visibility !== 'public') {
    throw redirect('/recipes/unavailable');
  }
  const [tasteNotes, comments] = await Promise.all([
    getTasteNotesCached(),
    commentApi.list(recipe.id, 1),
  ]);
  return { recipe, tasteNotes, comments };
};

/**
 * Full recipe detail view: SEO/JSON-LD head, stat cards, bean, timeline,
 * equipment, tasting notes, comments, and share/QR/fork side cards, with
 * owner-only edit and rating controls.
 */
export function RecipeDetailPage() {
  const { recipe, tasteNotes: allTasteNotes, comments: initialComments } =
    useLoaderData() as DetailLoaderData;
  const { slug } = useParams();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const { user, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const unitSystem = useUnitSystem();

  const ratingFetcher = useFetcher();
  const ratingFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    log.debug({ slug }, 'RecipeDetailPage mounted');
    return () => {
      log.debug({ slug }, 'RecipeDetailPage unmounted');
    };
  }, []);

  const loading = navigation.state === 'loading' &&
    navigation.location?.pathname.includes('/recipes/');

  if (loading) {
    return <RecipeDetailSkeleton />;
  }

  const isOwner = user?.id === recipe.authorId;
  const v = recipe.currentVersion ?? {};
  const emojiInfo = v?.emojiTag ? EMOJI_TAGS_LIST.find((e) => e.value === v.emojiTag) : null;
  const tasteNotes = Array.isArray(recipe.tasteNotes) ? recipe.tasteNotes : [];
  const equipment = Array.isArray(recipe.equipment) ? recipe.equipment : [];

  return (
    <article aria-label={recipe.title}>
      <SEOHead
        title={recipe.title}
        description={v.personalNotes ||
          `${v.brewMethod} ${v.drinkType} recipe by ${
            recipe.author?.displayName || recipe.author?.username
          }`}
        image={recipe.photos?.[0]?.url}
        url={`${globalThis.location.origin}/recipes/${recipe.slug}`}
        canonical={`${globalThis.location.origin}/recipes/${recipe.slug}`}
      />
      <RecipeJsonLd
        title={recipe.title}
        description={v.personalNotes?.trim() ||
          [v.brewMethod, v.drinkType, 'recipe'].filter(Boolean).join(' ')}
        slug={recipe.slug}
        authorName={recipe.author?.displayName || recipe.author?.username || ''}
        authorUsername={recipe.author?.username}
        datePublished={recipe.createdAt}
        image={recipe.photos?.[0]?.url}
        extractionTimeSeconds={v.extractionTimeSeconds}
        extractionVolumeMl={v.extractionVolumeMl}
        groundWeightGrams={v.groundWeightGrams}
        grindSize={v.grindSize}
        productName={v.productName}
        brewMethod={v.brewMethod}
        drinkType={v.drinkType}
        preparationNotes={v.preparationNotes}
        temperatureCelsius={v.temperatureCelsius}
        tasteNoteNames={tasteNotes
          .map((tn: { tasteNote?: { name: string } | null }) => tn.tasteNote?.name)
          .filter((n): n is string => Boolean(n))}
        additionalPreparations={v.additionalPreparations}
        avgRating={recipe.avgRating}
        ratingCount={recipe.ratingCount}
      />

      {/* ── Header section ── */}
      <div
        className='py-6'
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-primary)',
        }}
      >
        <div className='mx-auto max-w-4xl px-6'>
          {/* Breadcrumb */}
          <div className='mb-3'>
            <BreadcrumbNav brewMethod={v.brewMethod} recipeTitle={recipe.title} />
          </div>

          {/* Recipe title */}
          <h1
            className='text-3xl font-bold font-serif mb-3'
            style={{ color: 'var(--text-primary)' }}
          >
            {recipe.title}
          </h1>

          {/* Metadata badges + action buttons row */}
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <MetadataBadges
              author={recipe.author ?? null}
              visibility={recipe.visibility}
              brewMethod={v.brewMethod}
              versionNumber={v.versionNumber ?? 1}
              versionCount={recipe.versionCount ?? 1}
              onVersionHistoryClick={recipe.versionCount > 1
                ? () => navigate(`/recipes/${recipe.slug}/versions`)
                : undefined}
            />

            {/* Action buttons */}
            <div className='flex flex-wrap items-center gap-2'>
              {/* Print button */}
              <button
                type='button'
                onClick={() => globalThis.print()}
                className='btn-secondary text-sm min-h-11 px-3'
                aria-label={t('recipe.printAriaLabel')}
              >
                {t('recipe.print')}
              </button>

              {/* Focus button */}
              <button
                type='button'
                onClick={() => navigate(`/recipes/${recipe.slug}/focus`)}
                className='btn-secondary text-sm min-h-11 px-3'
                aria-label={t('recipe.focusModeAriaLabel')}
              >
                {t('recipe.focusMode')}
              </button>

              {/* Fork Recipe button — hidden if not authenticated OR is owner */}
              {isAuthenticated && !isOwner && (
                <button
                  type='button'
                  onClick={() => navigate(`/recipes/${recipe.id}/fork`)}
                  className='btn-secondary text-sm min-h-11 px-3'
                  aria-label={t('recipe.forkAriaLabel')}
                >
                  {t('recipe.fork')}
                </button>
              )}

              {/* Edit button — owner only */}
              {isOwner && (
                <Link
                  to={`/recipes/${recipe.id}/edit`}
                  className='btn-secondary text-sm min-h-11 px-3 inline-flex items-center'
                >
                  {t('common.edit')}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stat Cards (full width below header) ── */}
      <div className='py-4' style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className='mx-auto max-w-4xl px-6'>
          <StatCards version={v} unitSystem={unitSystem} />
        </div>
      </div>

      {/* ── Main content grid ── */}
      <div className='mx-auto max-w-4xl px-6 py-6'>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
          {/* Main column (2/3 width on md+) */}
          <div className='md:col-span-2 space-y-6'>
            <BeanSection
              productName={v.productName}
              coffeeBrand={v.coffeeBrand}
              coffeeProcessing={v.coffeeProcessing}
              roastDate={v.roastDate}
              packageOpenDate={v.packageOpenDate}
              grindDate={v.grindDate}
              brewDate={v.brewDate}
              bean={recipe.bean ?? v.bean ?? null}
            />

            <BrewTimeline
              extractionTimeSeconds={v.extractionTimeSeconds}
              preInfusionTimeSeconds={v.preInfusionTimeSeconds}
              flowRate={v.flowRate}
            />

            <EquipmentSection
              items={equipment}
              brewMethod={v.brewMethod}
              brewerDetails={v.brewerDetails}
            />

            <section className='card' aria-label='Preparation notes'>
              <div className='flex items-center justify-between mb-4'>
                <span
                  className='text-xs font-semibold uppercase tracking-widest'
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {t('recipe.preparationNotes')}
                </span>
              </div>
              <p
                className='text-sm'
                style={{
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                  lineHeight: '1.6',
                }}
              >
                {v.preparationNotes}
              </p>
            </section>

            <TastingNotesSection
              tasteNotes={tasteNotes}
              personalNotes={v.personalNotes}
              allTasteNotes={allTasteNotes}
            />

            {isAuthenticated && (
              <RecipeNotesSection recipeId={recipe.id} initialNotes={v.personalNotes} />
            )}
          </div>

          {/* Sidebar (1/3 width on md+) */}
          <div className='space-y-4 no-print'>
            {/* Share section — at top for reachability */}
            <ShareSection
              slug={recipe.slug}
              title={recipe.title}
              visibility={recipe.visibility}
            />

            {/* Rating card */}
            <div className='card'>
              <div className='flex items-center justify-between mb-3'>
                <span className='text-sm font-medium' style={{ color: 'var(--text-secondary)' }}>
                  {t('recipe.rating')}
                </span>
                {emojiInfo && <span title={emojiInfo.label}>{emojiInfo.emoji}</span>}
              </div>

              {v.rating && (
                <div className='mb-3'>
                  <p className='text-xs mb-1' style={{ color: 'var(--text-tertiary)' }}>
                    {t('recipe.authorRating')}
                  </p>
                  <StarRating value={v.rating} interactive={false} />
                </div>
              )}

              <div className='mb-3'>
                <p className='text-xs mb-1' style={{ color: 'var(--text-tertiary)' }}>
                  {t('recipe.communityAvg')}
                </p>
                <StarRating
                  value={recipe.avgRating ? Math.round(recipe.avgRating) : null}
                  count={recipe.ratingCount ?? 0}
                  interactive={false}
                />
              </div>

              {isAuthenticated && (
                <div className='pt-3 border-t' style={{ borderColor: 'var(--border-primary)' }}>
                  <p className='text-xs mb-2' style={{ color: 'var(--text-tertiary)' }}>
                    {recipe.userRating ? t('recipe.yourRating') : t('recipe.rateThis')}
                  </p>
                  <ratingFetcher.Form
                    ref={ratingFormRef}
                    method='post'
                    action={`/recipes/${recipe.id}/rate`}
                  >
                    <input
                      type='hidden'
                      name='rating'
                      value={recipe.userRating ?? ''}
                    />
                    <StarRating
                      value={recipe.userRating ?? null}
                      interactive={ratingFetcher.state === 'idle'}
                      onRate={(rating) => {
                        const input = ratingFormRef.current?.querySelector(
                          'input[name="rating"]',
                        ) as HTMLInputElement;
                        if (input) {
                          input.value = String(rating);
                        }
                        ratingFormRef.current?.requestSubmit();
                      }}
                    />
                  </ratingFetcher.Form>
                </div>
              )}
            </div>

            {/* Social actions */}
            <div data-testid='social-actions-card' className='card'>
              <div className='flex flex-row gap-3'>
                <LikeButton
                  recipeId={recipe.id}
                  initialLiked={recipe.userLiked}
                  initialCount={recipe.likeCount}
                />
                {isAuthenticated && (
                  <FavouriteButton
                    recipeId={recipe.id}
                    initialFavourited={recipe.userFavourited}
                    initialCount={recipe.favouriteCount ?? 0}
                  />
                )}
              </div>
            </div>

            {/* Fork card */}
            {isAuthenticated && !isOwner && <ForkCard recipeId={recipe.id} />}
          </div>
        </div>

        {/* Comment section (full width below grid) */}
        <div className='mt-6 no-print' data-testid='comment-section-wrapper'>
          <CommentSection
            recipeId={recipe.id}
            recipeAuthorId={recipe.authorId}
            initialComments={initialComments}
          />
        </div>
      </div>
    </article>
  );
}
