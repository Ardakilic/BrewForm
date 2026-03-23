/**
 * BrewForm Recipes List Page
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStyletron } from "baseui";
import {
  Button,
  KIND as BUTTON_KIND,
  SIZE as BUTTON_SIZE,
} from "baseui/button";
import { Card } from "../../components/Card.tsx";
import {
  HeadingMedium,
  HeadingSmall,
  LabelMedium,
  ParagraphMedium,
  ParagraphSmall,
} from "baseui/typography";
import { Input } from "baseui/input";
import { Select } from "baseui/select";
import { HIERARCHY as TAG_HIERARCHY, KIND as TAG_KIND, Tag } from "baseui/tag";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import useSWR from "swr";
import { api } from "../../utils/api.ts";
import LoadingSpinner from "../../components/LoadingSpinner.tsx";
import { useAuth } from "../../contexts/AuthContext.tsx";
import type { RecipeListItem } from "../../types";

const fetcher = async (url: string): Promise<RecipeListItem[]> => {
  const response = await api.get<RecipeListItem[]>(url);
  return response.data as RecipeListItem[];
};

function RecipesPage() {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [brewMethod, setBrewMethod] = useState<{ id: string; label: string }[]>(
    [],
  );
  const [drinkType, setDrinkType] = useState<{ id: string; label: string }[]>(
    [],
  );
  const [tags, setTags] = useState<{ id: string; label: string }[]>([]);

  const brewMethodOptions = [
    { id: "ESPRESSO_MACHINE", label: t("recipe.brewMethods.ESPRESSO_MACHINE") },
    { id: "POUR_OVER_V60", label: t("recipe.brewMethods.POUR_OVER_V60") },
    { id: "POUR_OVER_CHEMEX", label: t("recipe.brewMethods.POUR_OVER_CHEMEX") },
    { id: "AEROPRESS", label: t("recipe.brewMethods.AEROPRESS") },
    { id: "FRENCH_PRESS", label: t("recipe.brewMethods.FRENCH_PRESS") },
    { id: "MOKA_POT", label: t("recipe.brewMethods.MOKA_POT") },
    { id: "COLD_BREW", label: t("recipe.brewMethods.COLD_BREW") },
    { id: "TURKISH_CEZVE", label: t("recipe.brewMethods.TURKISH_CEZVE") },
  ];

  const drinkTypeOptions = [
    { id: "ESPRESSO", label: t("recipe.drinkTypes.ESPRESSO") },
    { id: "RISTRETTO", label: t("recipe.drinkTypes.RISTRETTO") },
    { id: "LUNGO", label: t("recipe.drinkTypes.LUNGO") },
    { id: "AMERICANO", label: t("recipe.drinkTypes.AMERICANO") },
    { id: "LATTE", label: t("recipe.drinkTypes.LATTE") },
    { id: "CAPPUCCINO", label: t("recipe.drinkTypes.CAPPUCCINO") },
    { id: "FLAT_WHITE", label: t("recipe.drinkTypes.FLAT_WHITE") },
    { id: "CORTADO", label: t("recipe.drinkTypes.CORTADO") },
    { id: "MACCHIATO", label: t("recipe.drinkTypes.MACCHIATO") },
    { id: "POUR_OVER", label: t("recipe.drinkTypes.POUR_OVER") },
    { id: "FRENCH_PRESS", label: t("recipe.drinkTypes.FRENCH_PRESS") },
    { id: "COLD_BREW", label: t("recipe.drinkTypes.COLD_BREW") },
  ];

  // Initialize filters from URL params (runs once on mount)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally run only on mount
  useEffect(() => {
    const urlBrewMethods = searchParams.getAll("brewMethod");
    const urlDrinkTypes = searchParams.getAll("drinkType");
    const urlTags = searchParams.getAll("tags");

    if (urlBrewMethods.length > 0) {
      const options = urlBrewMethods
        .map((id) => brewMethodOptions.find((o) => o.id === id))
        .filter((o): o is { id: string; label: string } => o !== undefined);
      if (options.length > 0) setBrewMethod(options);
    }
    if (urlDrinkTypes.length > 0) {
      const options = urlDrinkTypes
        .map((id) => drinkTypeOptions.find((o) => o.id === id))
        .filter((o): o is { id: string; label: string } => o !== undefined);
      if (options.length > 0) setDrinkType(options);
    }
    if (urlTags.length > 0) {
      const selectedTags = urlTags.map((t) => {
        const option = tagOptions.find((o) => o.id === t);
        return option || { id: t, label: t };
      });
      setTags(selectedTags);
    }
  }, []);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    for (const method of brewMethod) {
      params.append("brewMethod", method.id);
    }
    for (const type of drinkType) {
      params.append("drinkType", type.id);
    }
    for (const tag of tags) {
      params.append("tags", tag.id);
    }
    if (search) params.set("search", search);
    setSearchParams(params, { replace: true });
  }, [brewMethod, drinkType, tags, search, setSearchParams]);

  // Build API URL with filters (supports multiple values with OR logic)
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("visibility", "PUBLIC");
    if (brewMethod.length > 0) {
      params.set(
        "brewMethod",
        brewMethod.map((m) => m.id).join(","),
      );
    }
    if (drinkType.length > 0) {
      params.set(
        "drinkType",
        drinkType.map((t) => t.id).join(","),
      );
    }
    if (tags.length > 0) params.set("tags", tags.map((t) => t.id).join(","));
    if (search) params.set("search", search);
    return `/recipes?${params.toString()}`;
  }, [brewMethod, drinkType, tags, search]);

  const { data: recipes, isLoading } = useSWR<RecipeListItem[]>(
    apiUrl,
    fetcher,
  );

  const clearFilters = () => {
    setBrewMethod([]);
    setDrinkType([]);
    setTags([]);
    setSearch("");
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag.id !== tagToRemove));
  };

  const tagOptions = [
    { id: "morning", label: t("recipe.tags.morning") },
    { id: "afternoon", label: t("recipe.tags.afternoon") },
    { id: "evening", label: t("recipe.tags.evening") },
    { id: "fruity", label: t("recipe.tags.fruity") },
    { id: "chocolatey", label: t("recipe.tags.chocolatey") },
    { id: "nutty", label: t("recipe.tags.nutty") },
    { id: "floral", label: t("recipe.tags.floral") },
    { id: "spicy", label: t("recipe.tags.spicy") },
    { id: "sweet", label: t("recipe.tags.sweet") },
    { id: "bold", label: t("recipe.tags.bold") },
    { id: "light", label: t("recipe.tags.light") },
    { id: "creamy", label: t("recipe.tags.creamy") },
    { id: "iced", label: t("recipe.tags.iced") },
    { id: "hot", label: t("recipe.tags.hot") },
    { id: "decaf", label: t("recipe.tags.decaf") },
    { id: "single-origin", label: t("recipe.tags.singleOrigin") },
    { id: "blend", label: t("recipe.tags.blend") },
    { id: "espresso", label: t("recipe.tags.espresso") },
  ];

  const hasFilters = brewMethod.length > 0 || drinkType.length > 0 ||
    tags.length > 0 || search;

  // Remove a specific brew method from selection
  const removeBrewMethod = (idToRemove: string) => {
    setBrewMethod(brewMethod.filter((m) => m.id !== idToRemove));
  };

  // Remove a specific drink type from selection
  const removeDrinkType = (idToRemove: string) => {
    setDrinkType(drinkType.filter((t) => t.id !== idToRemove));
  };

  return (
    <>
      <Helmet>
        <title>{t("pages.recipes.title")}</title>
        <meta name="description" content={t("pages.recipes.description")} />
      </Helmet>

      {/* Hero Header */}
      <div
        className={css({
          background:
            `linear-gradient(135deg, ${theme.colors.backgroundTertiary} 0%, ${theme.colors.backgroundSecondary} 100%)`,
          borderRadius: "16px",
          padding: "32px",
          marginBottom: "32px",
        })}
      >
        <div
          className={css({
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "24px",
          })}
        >
          <div>
            <HeadingMedium
              $style={{
                color: theme.colors.contentPrimary,
                marginBottom: "8px",
              }}
            >
              {t("nav.recipes")}
            </HeadingMedium>
            <ParagraphMedium $style={{ color: theme.colors.contentSecondary }}>
              {t("pages.recipes.description")}
            </ParagraphMedium>
          </div>
          {isAuthenticated && (
            <Link to="/recipes/new">
              <Button kind={BUTTON_KIND.primary} size={BUTTON_SIZE.large}>
                {t("recipe.create")}
              </Button>
            </Link>
          )}
        </div>

        {/* Search and Filters */}
        <div
          className={css({
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
          })}
        >
          <div className={css({ flex: "1", minWidth: "250px" })}>
            <Input
              placeholder={t("common.search")}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              startEnhancer={() => <span>🔍</span>}
              overrides={{
                Root: {
                  style: {
                    backgroundColor: theme.colors.backgroundPrimary,
                    borderRadius: "8px",
                  },
                },
              }}
            />
          </div>
          <div className={css({ minWidth: "220px" })}>
            <Select
              multi
              placeholder={t("recipe.fields.brewMethod")}
              options={brewMethodOptions}
              value={brewMethod}
              onChange={(params) =>
                setBrewMethod(params.value as { id: string; label: string }[])}
              clearable
              overrides={{
                Root: {
                  style: {
                    backgroundColor: theme.colors.backgroundPrimary,
                    borderRadius: "8px",
                  },
                },
                ControlContainer: {
                  style: {
                    backgroundColor: theme.colors.backgroundPrimary,
                  },
                },
                Popover: {
                  props: {
                    overrides: {
                      Body: {
                        style: {
                          zIndex: 120,
                        },
                      },
                    },
                  },
                },
                Dropdown: {
                  style: {
                    backgroundColor: theme.colors.menuFill,
                  },
                },
                DropdownListItem: {
                  style: {
                    backgroundColor: theme.colors.menuFill,
                    color: theme.colors.contentInversePrimary,
                    ":hover": {
                      backgroundColor: theme.colors.menuFillHover,
                    },
                  },
                },
                OptionContent: {
                  style: {
                    color: theme.colors.contentInversePrimary,
                  },
                },
              }}
            />
          </div>
          <div className={css({ minWidth: "220px" })}>
            <Select
              multi
              placeholder={t("recipe.fields.drinkType")}
              options={drinkTypeOptions}
              value={drinkType}
              onChange={(params) =>
                setDrinkType(params.value as { id: string; label: string }[])}
              clearable
              overrides={{
                Root: {
                  style: {
                    backgroundColor: theme.colors.backgroundPrimary,
                    borderRadius: "8px",
                  },
                },
                ControlContainer: {
                  style: {
                    backgroundColor: theme.colors.backgroundPrimary,
                  },
                },
                Popover: {
                  props: {
                    overrides: {
                      Body: {
                        style: {
                          zIndex: 120,
                        },
                      },
                    },
                  },
                },
                Dropdown: {
                  style: {
                    backgroundColor: theme.colors.menuFill,
                  },
                },
                DropdownListItem: {
                  style: {
                    backgroundColor: theme.colors.menuFill,
                    color: theme.colors.contentInversePrimary,
                    ":hover": {
                      backgroundColor: theme.colors.menuFillHover,
                    },
                  },
                },
                OptionContent: {
                  style: {
                    color: theme.colors.contentInversePrimary,
                  },
                },
              }}
            />
          </div>
        </div>

        {/* Tags Section */}
        <div
          className={css({
            marginTop: "20px",
            paddingTop: "16px",
            borderTop: `1px solid ${theme.colors.borderOpaque}`,
          })}
        >
          <LabelMedium
            $style={{
              color: theme.colors.contentSecondary,
              marginBottom: "12px",
              display: "block",
            }}
          >
            {t("recipe.selectTags")}
          </LabelMedium>
          <div
            className={css({
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
            })}
          >
            {tagOptions.map((option) => {
              const isSelected = tags.some((t) => t.id === option.id);
              return (
                <Tag
                  key={option.id}
                  closeable={false}
                  kind={isSelected ? TAG_KIND.primary : TAG_KIND.neutral}
                  hierarchy={isSelected
                    ? TAG_HIERARCHY.primary
                    : TAG_HIERARCHY.secondary}
                  onClick={() => {
                    if (isSelected) {
                      setTags(tags.filter((t) => t.id !== option.id));
                    } else {
                      setTags([...tags, option]);
                    }
                  }}
                  overrides={{
                    Root: {
                      style: {
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        ":hover": {
                          transform: "scale(1.05)",
                        },
                      },
                    },
                  }}
                >
                  {option.label}
                </Tag>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active Filters Summary */}
      {hasFilters && (
        <div
          className={css({
            display: "flex",
            gap: "8px",
            marginBottom: "24px",
            alignItems: "center",
            flexWrap: "wrap",
            padding: "12px 16px",
            backgroundColor: theme.colors.backgroundSecondary,
            borderRadius: "8px",
          })}
        >
          <LabelMedium
            $style={{
              color: theme.colors.contentSecondary,
              marginRight: "8px",
            }}
          >
            {t("recipe.activeFilters")}:
          </LabelMedium>
          {brewMethod.map((method) => (
            <Tag
              key={method.id}
              closeable
              onActionClick={() => removeBrewMethod(method.id)}
              kind={TAG_KIND.blue}
              hierarchy={TAG_HIERARCHY.primary}
            >
              {method.label}
            </Tag>
          ))}
          {drinkType.map((type) => (
            <Tag
              key={type.id}
              closeable
              onActionClick={() => removeDrinkType(type.id)}
              kind={TAG_KIND.purple}
              hierarchy={TAG_HIERARCHY.primary}
            >
              {type.label}
            </Tag>
          ))}
          {tags.map((tag) => (
            <Tag
              key={tag.id}
              closeable
              onActionClick={() => removeTag(tag.id)}
              kind={TAG_KIND.orange}
              hierarchy={TAG_HIERARCHY.primary}
            >
              #{tag.label}
            </Tag>
          ))}
          {search && (
            <Tag
              closeable
              onActionClick={() => setSearch("")}
              kind={TAG_KIND.green}
              hierarchy={TAG_HIERARCHY.primary}
            >
              "{search}"
            </Tag>
          )}
          <Button
            kind={BUTTON_KIND.tertiary}
            size={BUTTON_SIZE.mini}
            onClick={clearFilters}
            overrides={{
              BaseButton: {
                style: {
                  color: theme.colors.contentTertiary,
                  ":hover": {
                    color: theme.colors.contentPrimary,
                  },
                },
              },
            }}
          >
            {t("common.clearAll")}
          </Button>
        </div>
      )}

      {/* Results Count */}
      {!isLoading && recipes && (
        <div
          className={css({
            marginBottom: "16px",
            padding: "8px 16px",
            backgroundColor: theme.colors.backgroundSecondary,
            borderRadius: "8px",
            display: "inline-block",
          })}
        >
          <ParagraphSmall
            $style={{
              color: theme.colors.contentPrimary,
              fontWeight: 500,
              margin: 0,
            }}
          >
            <span
              className={css({
                color: theme.colors.contentTertiary,
                fontWeight: 700,
              })}
            >
              {recipes.length}
            </span>{" "}
            {recipes.length === 1 ? t("recipe.result") : t("recipe.results")}
          </ParagraphSmall>
        </div>
      )}

      {/* Recipes Grid */}
      {isLoading ? <LoadingSpinner /> : recipes?.length
        ? (
          <div
            className={css({
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "20px",
            })}
          >
            {recipes.map((recipe) => (
              <Link
                key={recipe.id}
                to={`/recipes/${recipe.slug}`}
                className={css({
                  textDecoration: "none",
                  height: "100%",
                  display: "block",
                })}
              >
                <Card
                  overrides={{
                    Root: {
                      style: {
                        borderRadius: "12px",
                        transition: "all 0.2s ease",
                        border: `1px solid ${theme.colors.borderOpaque}`,
                        backgroundColor: theme.colors.backgroundSecondary,
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        ":hover": {
                          transform: "translateY(-4px)",
                          boxShadow: theme.lighting.shadow600,
                          borderColor: theme.colors.borderSelected,
                        },
                      },
                    },
                    Contents: {
                      style: {
                        padding: "20px",
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                      },
                    },
                  }}
                >
                  <HeadingSmall
                    $style={{
                      marginBottom: "12px",
                      color: theme.colors.contentPrimary,
                      minHeight: "48px",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {recipe.currentVersion?.title}
                  </HeadingSmall>

                  {/* Card content - all items below title */}
                  <div
                    className={css({
                      display: "flex",
                      flexDirection: "column",
                      flex: 1,
                    })}
                  >
                    <div
                      className={css({
                        display: "flex",
                        gap: "8px",
                        marginBottom: "12px",
                        flexWrap: "wrap",
                      })}
                    >
                      <Tag
                        closeable={false}
                        kind={TAG_KIND.blue}
                        hierarchy={TAG_HIERARCHY.secondary}
                      >
                        {t(
                          `recipe.brewMethods.${recipe.currentVersion?.brewMethod}`,
                        )}
                      </Tag>
                      <Tag
                        closeable={false}
                        kind={TAG_KIND.purple}
                        hierarchy={TAG_HIERARCHY.secondary}
                      >
                        {t(
                          `recipe.drinkTypes.${recipe.currentVersion?.drinkType}`,
                        )}
                      </Tag>
                    </div>
                    <ParagraphSmall
                      $style={{ color: theme.colors.contentSecondary }}
                    >
                      by{" "}
                      <span className={css({ fontWeight: 600 })}>
                        @{recipe.user?.username}
                      </span>
                    </ParagraphSmall>

                    {/* Spacer to push rating and tags to bottom */}
                    <div className={css({ flex: 1, minHeight: "8px" })} />

                    {recipe.currentVersion?.rating && (
                      <div className={css({ marginBottom: "4px" })}>
                        {"⭐".repeat(
                          Math.round(recipe.currentVersion.rating / 2),
                        )}
                        {"☆".repeat(
                          5 - Math.round(recipe.currentVersion.rating / 2),
                        )}
                      </div>
                    )}
                    {recipe.currentVersion?.tags &&
                      recipe.currentVersion.tags.length > 0 && (
                      <div
                        className={css({
                          display: "flex",
                          gap: "6px",
                          flexWrap: "wrap",
                        })}
                      >
                        {recipe.currentVersion.tags.slice(0, 3).map((tag) => (
                          <Tag
                            key={tag}
                            closeable={false}
                            kind={TAG_KIND.neutral}
                            hierarchy={TAG_HIERARCHY.secondary}
                            onClick={(e) => {
                              e.preventDefault();
                              const tagIds = tags.map((t) => t.id);
                              if (!tagIds.includes(tag)) {
                                const existingOption = tagOptions.find((o) =>
                                  o.id === tag
                                );
                                setTags([
                                  ...tags,
                                  existingOption || { id: tag, label: tag },
                                ]);
                              }
                            }}
                            overrides={{
                              Root: {
                                style: {
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  ":hover": {
                                    backgroundColor:
                                      theme.colors.backgroundTertiary,
                                  },
                                },
                              },
                            }}
                          >
                            #{tag}
                          </Tag>
                        ))}
                        {recipe.currentVersion.tags.length > 3 && (
                          <ParagraphSmall
                            $style={{
                              color: theme.colors.contentTertiary,
                              alignSelf: "center",
                            }}
                          >
                            +{recipe.currentVersion.tags.length - 3}
                          </ParagraphSmall>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )
        : (
          <div
            className={css({
              textAlign: "center",
              padding: "64px 24px",
              backgroundColor: theme.colors.backgroundSecondary,
              borderRadius: "16px",
            })}
          >
            <div className={css({ fontSize: "64px", marginBottom: "24px" })}>
              ☕
            </div>
            <HeadingSmall
              $style={{
                marginBottom: "12px",
                color: theme.colors.contentPrimary,
              }}
            >
              {t("recipe.empty.title")}
            </HeadingSmall>
            <ParagraphMedium
              $style={{
                color: theme.colors.contentSecondary,
                maxWidth: "400px",
                margin: "0 auto",
              }}
            >
              {t("recipe.empty.description")}
            </ParagraphMedium>
            {isAuthenticated && (
              <Link
                to="/recipes/new"
                className={css({ display: "inline-block", marginTop: "24px" })}
              >
                <Button kind={BUTTON_KIND.primary}>
                  {t("recipe.createFirst")}
                </Button>
              </Link>
            )}
          </div>
        )}
    </>
  );
}

export default RecipesPage;
