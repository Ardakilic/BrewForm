/**
 * TasteNoteAutocomplete Component
 * Multi-select autocomplete for taste notes with debounced search
 * Uses BaseUI Select with async search capability
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useStyletron } from 'baseui';
import { Select, TYPE } from 'baseui/select';
import { Tag, VARIANT } from 'baseui/tag';
import { StyledLink } from 'baseui/link';
import { ParagraphSmall } from 'baseui/typography';
import { useTranslation } from 'react-i18next';
import { api } from '../utils/api';

export interface TasteNote {
  id: string;
  name: string;
  slug: string;
  fullPath: string;
  depth: number;
  colour: string | null;
}

interface TasteNoteAutocompleteProps {
  selectedNotes: TasteNote[];
  onChange: (notes: TasteNote[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxSelections?: number;
}

const SCAA_REFERENCE_URL = 'https://notbadcoffee.com/flavor-wheel-en/';
const MIN_SEARCH_LENGTH = 3;
const DEBOUNCE_MS = 500;

function TasteNoteAutocomplete({
  selectedNotes,
  onChange,
  placeholder,
  disabled = false,
  maxSelections = 20,
}: TasteNoteAutocompleteProps) {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();
  const [options, setOptions] = useState<TasteNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const actualPlaceholder = placeholder || t('tasteNotes.placeholder');

  const searchTasteNotes = useCallback(async (query: string) => {
    if (query.length < MIN_SEARCH_LENGTH) {
      setOptions([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.get<TasteNote[]>('/taste-notes/search', {
        params: { q: query },
      });

      if (response.success && response.data) {
        // Filter out already selected notes
        const selectedIds = new Set(selectedNotes.map((n) => n.id));
        const filteredOptions = response.data.filter((n) => !selectedIds.has(n.id));
        setOptions(filteredOptions);
      }
    } catch (error) {
      console.error('Failed to search taste notes:', error);
      setOptions([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedNotes]);

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);

    // Cancel previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce the search
    if (value.length >= MIN_SEARCH_LENGTH) {
      debounceRef.current = setTimeout(() => {
        searchTasteNotes(value);
      }, DEBOUNCE_MS);
    } else {
      setOptions([]);
    }
  }, [searchTasteNotes]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleChange = useCallback(
    (params: { value: readonly { id?: string | number }[] }) => {
      const newValue = params.value as TasteNote[];
      if (newValue.length <= maxSelections) {
        onChange(newValue);
      }
    },
    [onChange, maxSelections]
  );

  const handleRemove = useCallback(
    (noteId: string) => {
      onChange(selectedNotes.filter((n) => n.id !== noteId));
    },
    [selectedNotes, onChange]
  );

  const getOptionLabel = (args: { option?: Record<string, unknown> }) => {
    const option = args?.option as TasteNote | undefined;
    return option?.fullPath || '';
  };

  return (
    <div>
      <Select
        options={options}
        value={selectedNotes}
        onChange={handleChange}
        onInputChange={(e) => handleInputChange(e.currentTarget.value)}
        placeholder={actualPlaceholder}
        type={TYPE.search}
        multi
        filterOptions={(opts) => opts}
        isLoading={isLoading}
        disabled={disabled || selectedNotes.length >= maxSelections}
        getOptionLabel={getOptionLabel}
        getValueLabel={getOptionLabel}
        labelKey="fullPath"
        valueKey="id"
        noResultsMsg={
          inputValue.length < MIN_SEARCH_LENGTH
            ? t('tasteNotes.minChars', { count: MIN_SEARCH_LENGTH })
            : t('tasteNotes.noResults')
        }
        overrides={{
          ControlContainer: {
            style: {
              minHeight: '48px',
            },
          },
          DropdownListItem: {
            style: ({ $isHighlighted }: { $isHighlighted: boolean }) => ({
              backgroundColor: $isHighlighted
                ? theme.colors.backgroundSecondary
                : 'transparent',
            }),
          },
          ValueContainer: {
            style: {
              flexWrap: 'wrap',
              gap: '4px',
              paddingTop: '4px',
              paddingBottom: '4px',
            },
          },
        }}
      />

      {selectedNotes.length > 0 && (
        <div
          className={css({
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginTop: '12px',
          })}
        >
          {selectedNotes.map((note) => (
            <Tag
              key={note.id}
              variant={VARIANT.solid}
              onActionClick={() => handleRemove(note.id)}
              overrides={{
                Root: {
                  style: {
                    backgroundColor: note.colour || theme.colors.accent,
                    marginRight: '0',
                    marginBottom: '0',
                  },
                },
                Text: {
                  style: {
                    color: theme.colors.contentOnColor,
                  },
                },
              }}
            >
              {note.fullPath}
            </Tag>
          ))}
        </div>
      )}

      <div
        className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '8px',
        })}
      >
        <ParagraphSmall color={theme.colors.contentSecondary} marginTop="0" marginBottom="0">
          {t('tasteNotes.selected', { count: selectedNotes.length, max: maxSelections })}
        </ParagraphSmall>
        <StyledLink
          href={SCAA_REFERENCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          $style={{
            fontSize: theme.typography.ParagraphSmall.fontSize,
          }}
        >
          {t('tasteNotes.scaaReference')} ↗
        </StyledLink>
      </div>
    </div>
  );
}

export default TasteNoteAutocomplete;
