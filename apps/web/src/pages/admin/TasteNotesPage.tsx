/**
 * BrewForm Admin Taste Notes Page
 */

import { useState } from "react";
import { useStyletron } from "baseui";
import { Button, KIND, SIZE } from "baseui/button";
import { KIND as NotificationKind, Notification } from "baseui/notification";
import { HeadingLarge, LabelMedium, ParagraphMedium } from "baseui/typography";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import { api } from "../../utils/api.ts";

function AdminTasteNotesPage() {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();
  const [invalidating, setInvalidating] = useState(false);
  const [result, setResult] = useState<
    { kind: "positive" | "negative"; message: string } | null
  >(
    null,
  );

  async function handleInvalidateCache() {
    setInvalidating(true);
    setResult(null);
    try {
      const res = await api.post<{ invalidated: number }>(
        "/taste-notes/cache/invalidate",
      );
      if (res.success) {
        setResult({
          kind: "positive",
          message: `Cache invalidated (${
            res.data?.invalidated ?? 0
          } entries cleared). Next request will re-fetch from the database.`,
        });
      } else {
        setResult({
          kind: "negative",
          message: res.error?.message ?? "Failed to invalidate cache",
        });
      }
    } catch {
      setResult({
        kind: "negative",
        message: "Network error. Could not reach API.",
      });
    } finally {
      setInvalidating(false);
    }
  }

  return (
    <>
      <Helmet>
        <title>{t("admin.tasteNotes.title")}</title>
      </Helmet>

      <HeadingLarge marginBottom="24px">
        {t("admin.tasteNotes.heading")}
      </HeadingLarge>

      {/* Cache invalidation card */}
      <div
        className={css({
          backgroundColor: theme.colors.backgroundSecondary,
          borderRadius: theme.borders.radius300,
          padding: theme.sizing.scale700,
          marginBottom: theme.sizing.scale700,
          border: `1px solid ${theme.colors.borderOpaque}`,
        })}
      >
        <LabelMedium marginBottom="8px">Taste Notes Cache</LabelMedium>
        <ParagraphMedium color={theme.colors.contentSecondary} marginTop="0">
          Taste notes are cached for 24 hours. Use this button to force a
          refresh after importing new data or making manual database changes.
        </ParagraphMedium>

        {result && (
          <Notification
            kind={result.kind === "positive"
              ? NotificationKind.positive
              : NotificationKind.negative}
            overrides={{
              Body: {
                style: { width: "auto", marginBottom: theme.sizing.scale500 },
              },
            }}
          >
            {result.message}
          </Notification>
        )}

        <Button
          kind={KIND.secondary}
          size={SIZE.compact}
          onClick={handleInvalidateCache}
          isLoading={invalidating}
        >
          Invalidate Cache
        </Button>
      </div>

      <ParagraphMedium
        color={theme.colors.contentSecondary}
        marginTop="24px"
      >
        {t("admin.tasteNotes.comingSoon")}
      </ParagraphMedium>

      <ParagraphMedium color={theme.colors.contentSecondary}>
        {t("admin.tasteNotes.plannedFeatures")}
      </ParagraphMedium>
      <ul style={{ color: theme.colors.contentSecondary, marginLeft: "20px" }}>
        <li>{t("admin.tasteNotes.features.view")}</li>
        <li>{t("admin.tasteNotes.features.add")}</li>
        <li>{t("admin.tasteNotes.features.edit")}</li>
        <li>{t("admin.tasteNotes.features.delete")}</li>
        <li>{t("admin.tasteNotes.features.reimport")}</li>
      </ul>
    </>
  );
}

export default AdminTasteNotesPage;
