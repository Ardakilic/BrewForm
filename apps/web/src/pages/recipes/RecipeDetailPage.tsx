/**
 * BrewForm Recipe Detail Page
 */

import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useStyletron } from 'baseui';
import { Button } from 'baseui/button';
import { Card } from 'baseui/card';
import { HeadingLarge, HeadingSmall, HeadingXSmall, ParagraphMedium, ParagraphSmall, LabelMedium } from 'baseui/typography';
import { Tag, KIND as TAG_KIND } from 'baseui/tag';
import { Textarea } from 'baseui/textarea';
import { useSnackbar, DURATION } from 'baseui/snackbar';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import useSWR, { mutate } from 'swr';
import { api } from '../../utils/api';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';
import type { Recipe, Comment } from '../../types';

const fetcher = async (url: string): Promise<Recipe> => {
  const response = await api.get<Recipe>(url);
  return response.data as Recipe;
};

const commentsFetcher = async (url: string): Promise<Comment[]> => {
  const response = await api.get<Comment[]>(url);
  return response.data as Comment[];
};

interface RecipeFieldProps {
  label: string;
  value: string | number | null | undefined;
  suffix?: string;
  theme: ReturnType<typeof useStyletron>[1];
}

function RecipeField({ label, value, suffix = '', theme }: RecipeFieldProps) {
  if (!value) return null;
  return (
    <>
      <LabelMedium color={theme.colors.contentSecondary} marginBottom="4px">
        {label}
      </LabelMedium>
      <ParagraphMedium marginBottom="16px">{value}{suffix}</ParagraphMedium>
    </>
  );
}

interface ClickableFieldProps {
  label: string;
  value: string | null | undefined;
  linkTo: string;
  theme: ReturnType<typeof useStyletron>[1];
}

function ClickableField({ label, value, linkTo, theme }: ClickableFieldProps) {
  const [css] = useStyletron();
  if (!value) return null;
  return (
    <>
      <LabelMedium color={theme.colors.contentSecondary} marginBottom="4px">
        {label}
      </LabelMedium>
      <Link to={linkTo} className={css({ textDecoration: 'none' })}>
        <ParagraphMedium
          marginBottom="16px"
          className={css({
            color: '#6F4E37',
            ':hover': { textDecoration: 'underline' },
          })}
        >
          {value}
        </ParagraphMedium>
      </Link>
    </>
  );
}

interface EquipmentFieldProps {
  label: string;
  equipment: { brand?: string; model: string } | null | undefined;
  theme: ReturnType<typeof useStyletron>[1];
}

function EquipmentField({ label, equipment, theme }: EquipmentFieldProps) {
  if (!equipment) return null;
  const displayName = equipment.brand ? `${equipment.brand} ${equipment.model}` : equipment.model;
  return (
    <>
      <LabelMedium color={theme.colors.contentSecondary} marginBottom="4px">
        {label}
      </LabelMedium>
      <ParagraphMedium marginBottom="16px">{displayName}</ParagraphMedium>
    </>
  );
}

interface CommentItemProps {
  comment: Comment;
  onReply: (parentId: string) => void;
}

function CommentItem({ comment, onReply }: CommentItemProps) {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div
      className={css({
        padding: '16px',
        borderBottom: `1px solid ${theme.colors.borderOpaque}`,
      })}
    >
      <div className={css({ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' })}>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '8px' })}>
          <Link
            to={`/user/${comment.user.username}`}
            className={css({ color: '#6F4E37', textDecoration: 'none', fontWeight: 600 })}
          >
            {comment.user.displayName || comment.user.username}
          </Link>
          {comment.isAuthor && (
            <Tag closeable={false} kind={TAG_KIND.accent} overrides={{ Root: { style: { marginLeft: '4px' } } }}>
              Author
            </Tag>
          )}
        </div>
        <ParagraphSmall color={theme.colors.contentTertiary}>
          {formatDate(comment.createdAt)}
          {comment.isEdited && ' (edited)'}
        </ParagraphSmall>
      </div>
      <ParagraphMedium>{comment.content}</ParagraphMedium>
      <Button
        kind="tertiary"
        size="mini"
        onClick={() => onReply(comment.id)}
        overrides={{ Root: { style: { marginTop: '8px' } } }}
      >
        {t('common.reply')}
      </Button>

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className={css({ marginLeft: '24px', marginTop: '16px' })}>
          {comment.replies.map((reply) => (
            <div
              key={reply.id}
              className={css({
                padding: '12px',
                backgroundColor: theme.colors.backgroundSecondary,
                borderRadius: '8px',
                marginBottom: '8px',
              })}
            >
              <div className={css({ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' })}>
                <div className={css({ display: 'flex', alignItems: 'center', gap: '8px' })}>
                  <Link
                    to={`/user/${reply.user.username}`}
                    className={css({ color: '#6F4E37', textDecoration: 'none', fontWeight: 600, fontSize: '14px' })}
                  >
                    {reply.user.displayName || reply.user.username}
                  </Link>
                  {reply.isAuthor && (
                    <Tag closeable={false} kind={TAG_KIND.accent} overrides={{ Root: { style: { transform: 'scale(0.85)' } } }}>
                      Author
                    </Tag>
                  )}
                </div>
                <ParagraphSmall color={theme.colors.contentTertiary}>
                  {formatDate(reply.createdAt)}
                </ParagraphSmall>
              </div>
              <ParagraphSmall>{reply.content}</ParagraphSmall>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: page component with multiple sections
function RecipeDetailPage() {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { enqueue } = useSnackbar();
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: recipe, isLoading, error } = useSWR<Recipe>(
    slug ? `/recipes/${slug}` : null,
    fetcher
  );

  const { data: comments, isLoading: commentsLoading } = useSWR<Comment[]>(
    recipe ? `/social/recipes/${recipe.id}/comments` : null,
    commentsFetcher
  );

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      enqueue({ message: t('recipe.linkCopied'), startEnhancer: () => '📋' }, DURATION.short);
    } catch {
      enqueue({ message: t('common.error'), startEnhancer: () => '❌' }, DURATION.short);
    }
  };

  const handleFork = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    try {
      const response = await api.post(`/recipes/${recipe?.id}/fork`, {});
      if (response.data) {
        enqueue({ message: t('recipe.forked'), startEnhancer: () => '🍴' }, DURATION.short);
        navigate(`/recipes/${(response.data as Recipe).slug}`);
      }
    } catch {
      enqueue({ message: t('common.error'), startEnhancer: () => '❌' }, DURATION.short);
    }
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !recipe) return;

    setIsSubmitting(true);
    try {
      await api.post(`/social/recipes/${recipe.id}/comments`, {
        content: commentText,
        parentId: replyTo || undefined,
      });
      setCommentText('');
      setReplyTo(null);
      mutate(`/social/recipes/${recipe.id}/comments`);
      enqueue({ message: t('recipe.commentAdded'), startEnhancer: () => '💬' }, DURATION.short);
    } catch {
      enqueue({ message: t('common.error'), startEnhancer: () => '❌' }, DURATION.short);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (error || !recipe) {
    return (
      <div className={css({ textAlign: 'center', padding: '48px' })}>
        <HeadingSmall>{t('common.noResults')}</HeadingSmall>
      </div>
    );
  }

  const version = recipe.currentVersion;
  const isOwner = user?.id === recipe.userId;

  const hasEquipment = version?.grinder || version?.brewer || version?.portafilter ||
    version?.basket || version?.puckScreen || version?.paperFilter || version?.tamper;

  return (
    <>
      <Helmet>
        <title>{version?.title} - BrewForm</title>
        <meta name="description" content={version?.description || `${version?.brewMethod} recipe`} />
      </Helmet>

      <div className={css({ maxWidth: '800px', margin: '0 auto' })}>
        {/* Header */}
        <div
          className={css({
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '24px',
          })}
        >
          <div>
            <HeadingLarge>{version?.title}</HeadingLarge>
            <ParagraphMedium color={theme.colors.contentSecondary}>
              by{' '}
              <Link
                to={`/user/${recipe.user?.username}`}
                className={css({ color: '#6F4E37', textDecoration: 'none', ':hover': { textDecoration: 'underline' } })}
              >
                @{recipe.user?.username}
              </Link>
            </ParagraphMedium>
          </div>
          <div className={css({ display: 'flex', gap: '8px' })}>
            {isOwner && (
              <Link to={`/recipes/${slug}/edit`}>
                <Button kind="secondary" size="compact">
                  {t('common.edit')}
                </Button>
              </Link>
            )}
            <Button kind="secondary" size="compact" onClick={handleShare}>
              {t('recipe.share')}
            </Button>
            <Button kind="secondary" size="compact" onClick={handleFork}>
              {t('recipe.fork')}
            </Button>
          </div>
        </div>

        {/* Forked From Banner */}
        {recipe.forkedFrom && (
          <Card overrides={{ Root: { style: { marginBottom: '24px', backgroundColor: theme.colors.backgroundSecondary } } }}>
            <ParagraphMedium>
              🍴 {t('recipe.forkedFrom')}{' '}
              <Link
                to={`/recipes/${recipe.forkedFrom.slug}`}
                className={css({ color: '#6F4E37', fontWeight: 600 })}
              >
                {recipe.forkedFrom.currentVersion?.title || 'Original Recipe'}
              </Link>{' '}
              by{' '}
              <Link to={`/user/${recipe.forkedFrom.user?.username}`} className={css({ color: '#6F4E37' })}>
                @{recipe.forkedFrom.user?.username}
              </Link>
            </ParagraphMedium>
          </Card>
        )}

        {/* Main Info Card */}
        <Card>
          <div className={css({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' })}>
            {/* Left Column */}
            <div>
              <ClickableField
                label={t('recipe.fields.brewMethod')}
                value={version?.brewMethod}
                linkTo={`/recipes?brewMethod=${version?.brewMethod}`}
                theme={theme}
              />
              <ClickableField
                label={t('recipe.fields.drinkType')}
                value={version?.drinkType}
                linkTo={`/recipes?drinkType=${version?.drinkType}`}
                theme={theme}
              />
              <RecipeField label={t('recipe.fields.coffee')} value={version?.coffeeName} theme={theme} />
              <RecipeField label={t('recipe.fields.grindSize')} value={version?.grindSize} theme={theme} />
            </div>

            {/* Right Column - Brew Parameters */}
            <div>
              <RecipeField label={t('recipe.fields.dose')} value={version?.doseGrams} suffix="g" theme={theme} />
              <RecipeField label={t('recipe.fields.yield')} value={version?.yieldGrams} suffix="g" theme={theme} />
              <RecipeField label={t('recipe.fields.time')} value={version?.brewTimeSec} suffix="s" theme={theme} />
              <RecipeField label={t('recipe.fields.temperature')} value={version?.tempCelsius} suffix="°C" theme={theme} />
              <RecipeField label={t('recipe.fields.pressure')} value={version?.pressure} suffix=" bar" theme={theme} />
              <RecipeField label={t('recipe.fields.ratio')} value={version?.brewRatio ? `1:${version.brewRatio.toFixed(1)}` : null} theme={theme} />
            </div>
          </div>

          {/* Description */}
          {version?.description && (
            <div className={css({ marginTop: '24px' })}>
              <LabelMedium color={theme.colors.contentSecondary} marginBottom="8px">
                {t('recipe.fields.description')}
              </LabelMedium>
              <ParagraphMedium>{version.description}</ParagraphMedium>
            </div>
          )}

          {/* Tasting Notes */}
          {version?.tastingNotes && (
            <div className={css({ marginTop: '24px' })}>
              <LabelMedium color={theme.colors.contentSecondary} marginBottom="8px">
                {t('recipe.fields.tastingNotes')}
              </LabelMedium>
              <ParagraphMedium>{version.tastingNotes}</ParagraphMedium>
            </div>
          )}

          {/* Rating */}
          {version?.rating && (
            <div className={css({ marginTop: '24px' })}>
              <LabelMedium color={theme.colors.contentSecondary} marginBottom="8px">
                {t('recipe.fields.rating')}
              </LabelMedium>
              <ParagraphMedium>
                {version.rating}/10 {'⭐'.repeat(Math.round(version.rating / 2))}
              </ParagraphMedium>
            </div>
          )}

          {/* Tags */}
          {version?.tags && version.tags.length > 0 && (
            <div className={css({ marginTop: '24px' })}>
              <LabelMedium color={theme.colors.contentSecondary} marginBottom="8px">
                {t('recipe.fields.tags')}
              </LabelMedium>
              <div className={css({ display: 'flex', gap: '8px', flexWrap: 'wrap' })}>
                {version.tags.map((tag) => (
                  <Link key={tag} to={`/recipes?tags=${tag}`} className={css({ textDecoration: 'none', cursor: 'pointer' })}>
                    <Tag closeable={false} kind={TAG_KIND.primary} overrides={{ Root: { style: { cursor: 'pointer' } } }}>
                      {tag}
                    </Tag>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Equipment Card */}
        {hasEquipment && (
          <Card overrides={{ Root: { style: { marginTop: '24px' } } }}>
            <HeadingXSmall marginBottom="16px">{t('recipe.equipment')}</HeadingXSmall>
            <div className={css({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' })}>
              <div>
                <EquipmentField label={t('recipe.fields.grinder')} equipment={version?.grinder} theme={theme} />
                <EquipmentField label={t('recipe.fields.brewer')} equipment={version?.brewer} theme={theme} />
                <EquipmentField label={t('recipe.fields.portafilter')} equipment={version?.portafilter} theme={theme} />
                <EquipmentField label={t('recipe.fields.basket')} equipment={version?.basket} theme={theme} />
              </div>
              <div>
                <EquipmentField label={t('recipe.fields.tamper')} equipment={version?.tamper} theme={theme} />
                <EquipmentField label={t('recipe.fields.puckScreen')} equipment={version?.puckScreen} theme={theme} />
                <EquipmentField label={t('recipe.fields.paperFilter')} equipment={version?.paperFilter} theme={theme} />
              </div>
            </div>
          </Card>
        )}

        {/* Comments Section */}
        <Card overrides={{ Root: { style: { marginTop: '24px' } } }}>
          <HeadingXSmall marginBottom="16px">
            {t('recipe.comments')} ({recipe.commentCount || 0})
          </HeadingXSmall>

          {/* Comment Form */}
          {isAuthenticated ? (
            <div className={css({ marginBottom: '24px' })}>
              {replyTo && (
                <div className={css({ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' })}>
                  <ParagraphSmall color={theme.colors.contentSecondary}>
                    {t('recipe.replyingTo')}
                  </ParagraphSmall>
                  <Button kind="tertiary" size="mini" onClick={() => setReplyTo(null)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              )}
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.currentTarget.value)}
                placeholder={t('recipe.addComment')}
                overrides={{ Root: { style: { marginBottom: '8px' } } }}
              />
              <Button
                size="compact"
                onClick={handleSubmitComment}
                isLoading={isSubmitting}
                disabled={!commentText.trim()}
              >
                {replyTo ? t('common.reply') : t('recipe.postComment')}
              </Button>
            </div>
          ) : (
            <div className={css({ marginBottom: '24px', padding: '16px', backgroundColor: theme.colors.backgroundSecondary, borderRadius: '8px' })}>
              <ParagraphMedium>
                <Link to="/login" className={css({ color: '#6F4E37' })}>
                  {t('nav.login')}
                </Link>{' '}
                {t('recipe.toComment')}
              </ParagraphMedium>
            </div>
          )}

          {/* Comments List */}
          {commentsLoading ? (
            <LoadingSpinner />
          ) : comments && comments.length > 0 ? (
            <div>
              {comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  onReply={setReplyTo}
                />
              ))}
            </div>
          ) : (
            <ParagraphMedium color={theme.colors.contentSecondary}>
              {t('recipe.noComments')}
            </ParagraphMedium>
          )}
        </Card>
      </div>
    </>
  );
}

export default RecipeDetailPage;
