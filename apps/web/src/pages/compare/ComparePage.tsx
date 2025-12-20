/**
 * BrewForm Recipe Comparison Page
 */

import { useParams } from 'react-router-dom';
import { useStyletron } from 'baseui';
import { Card } from 'baseui/card';
import { HeadingLarge, HeadingSmall, ParagraphMedium, LabelMedium } from 'baseui/typography';
import { Helmet } from 'react-helmet-async';
import useSWR from 'swr';
import { api } from '../../utils/api';
import LoadingSpinner from '../../components/LoadingSpinner';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

function ComparePage() {
  const [css, theme] = useStyletron();
  const { token } = useParams<{ token: string }>();

  const { data: comparison, isLoading, error } = useSWR(
    token ? `/social/comparisons/${token}` : null,
    fetcher
  );

  if (isLoading) return <LoadingSpinner />;
  if (error || !comparison) {
    return (
      <div className={css({ textAlign: 'center', padding: '48px' })}>
        <HeadingSmall>Comparison not found</HeadingSmall>
        <ParagraphMedium color={theme.colors.contentSecondary}>
          This comparison link may be invalid or expired.
        </ParagraphMedium>
      </div>
    );
  }

  const recipeA = comparison.recipeA;
  const recipeB = comparison.recipeB;
  const versionA = recipeA?.currentVersion;
  const versionB = recipeB?.currentVersion;

  return (
    <>
      <Helmet>
        <title>Compare Recipes - BrewForm</title>
      </Helmet>

      <HeadingLarge marginBottom="24px" className={css({ textAlign: 'center' })}>
        Recipe Comparison
      </HeadingLarge>

      <div className={css({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' })}>
        {/* Recipe A */}
        <Card>
          <HeadingSmall marginBottom="16px">{versionA?.title}</HeadingSmall>
          <ParagraphMedium color={theme.colors.contentSecondary} marginBottom="16px">
            by @{recipeA?.user?.username}
          </ParagraphMedium>

          <LabelMedium color={theme.colors.contentSecondary}>Brew Method</LabelMedium>
          <ParagraphMedium marginBottom="12px">{versionA?.brewMethod}</ParagraphMedium>

          <LabelMedium color={theme.colors.contentSecondary}>Dose</LabelMedium>
          <ParagraphMedium marginBottom="12px">{versionA?.doseGrams}g</ParagraphMedium>

          <LabelMedium color={theme.colors.contentSecondary}>Yield</LabelMedium>
          <ParagraphMedium marginBottom="12px">{versionA?.yieldGrams}g</ParagraphMedium>

          <LabelMedium color={theme.colors.contentSecondary}>Time</LabelMedium>
          <ParagraphMedium marginBottom="12px">{versionA?.brewTimeSec}s</ParagraphMedium>

          <LabelMedium color={theme.colors.contentSecondary}>Ratio</LabelMedium>
          <ParagraphMedium marginBottom="12px">
            1:{versionA?.brewRatio?.toFixed(1)}
          </ParagraphMedium>

          {versionA?.rating && (
            <>
              <LabelMedium color={theme.colors.contentSecondary}>Rating</LabelMedium>
              <ParagraphMedium>{versionA.rating}/10</ParagraphMedium>
            </>
          )}
        </Card>

        {/* Recipe B */}
        <Card>
          <HeadingSmall marginBottom="16px">{versionB?.title}</HeadingSmall>
          <ParagraphMedium color={theme.colors.contentSecondary} marginBottom="16px">
            by @{recipeB?.user?.username}
          </ParagraphMedium>

          <LabelMedium color={theme.colors.contentSecondary}>Brew Method</LabelMedium>
          <ParagraphMedium marginBottom="12px">{versionB?.brewMethod}</ParagraphMedium>

          <LabelMedium color={theme.colors.contentSecondary}>Dose</LabelMedium>
          <ParagraphMedium marginBottom="12px">{versionB?.doseGrams}g</ParagraphMedium>

          <LabelMedium color={theme.colors.contentSecondary}>Yield</LabelMedium>
          <ParagraphMedium marginBottom="12px">{versionB?.yieldGrams}g</ParagraphMedium>

          <LabelMedium color={theme.colors.contentSecondary}>Time</LabelMedium>
          <ParagraphMedium marginBottom="12px">{versionB?.brewTimeSec}s</ParagraphMedium>

          <LabelMedium color={theme.colors.contentSecondary}>Ratio</LabelMedium>
          <ParagraphMedium marginBottom="12px">
            1:{versionB?.brewRatio?.toFixed(1)}
          </ParagraphMedium>

          {versionB?.rating && (
            <>
              <LabelMedium color={theme.colors.contentSecondary}>Rating</LabelMedium>
              <ParagraphMedium>{versionB.rating}/10</ParagraphMedium>
            </>
          )}
        </Card>
      </div>
    </>
  );
}

export default ComparePage;
