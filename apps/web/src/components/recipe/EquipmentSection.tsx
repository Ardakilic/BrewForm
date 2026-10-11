import { useNavigate } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { getEquipmentIcon } from '../icons/equipment/index.ts';

interface EquipmentItem {
  id: string;
  equipmentId: string;
  name?: string | null;
  type?: string | null;
}

interface EquipmentSectionProps {
  items: EquipmentItem[];
  brewMethod?: string;
  brewerDetails?: string | null;
}

/**
 * Equipment card listing the main brewer and gear used in a recipe;
 * each item navigates to `/recipes` filtered by that equipment.
 * Renders nothing when there is no equipment to show.
 */
export function EquipmentSection({
  items,
  brewMethod: _brewMethod,
  brewerDetails,
}: EquipmentSectionProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const BrewerIcon = getEquipmentIcon('');
  const mainBrewerLabel = t('recipe.mainBrewer');

  if (items.length === 0 && !brewerDetails) {
    return null;
  }

  return (
    <div className="card">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold uppercase tracking-widest text-[color:var(--text-tertiary)]">
          {t('recipe.equipment.title')}
        </span>
        <span className="text-xs text-[color:var(--text-tertiary)]">
          {items.length}{' '}
          {items.length === 1 ? t('recipe.equipment.item') : t('recipe.equipment.items')}
        </span>
      </div>

      {/* Equipment grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {brewerDetails && (
          <button
            type="button"
            onClick={() => {
              if (brewerDetails) {
                navigate(`/recipes?mainBrewer=${encodeURIComponent(brewerDetails)}`);
              }
            }}
            className={`flex items-center gap-3 rounded-lg p-3 text-left transition-colors min-h-11 border border-[color:var(--border-primary)] bg-[color:var(--bg-primary)] w-full ${
              brewerDetails ? 'cursor-pointer' : 'cursor-default'
            }`}
            onMouseEnter={(e) => {
              if (brewerDetails) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-tertiary)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-primary)';
            }}
          >
            <span className="flex-shrink-0 text-[color:var(--text-secondary)]">
              <BrewerIcon size={24} />
            </span>

            <span className="flex flex-col min-w-0">
              <span className="font-semibold text-sm truncate text-[color:var(--text-primary)]">
                {brewerDetails}
              </span>
              <span className="text-xs uppercase tracking-wide text-[color:var(--text-tertiary)]">
                {mainBrewerLabel}
              </span>
            </span>
          </button>
        )}

        {items.map((item) => {
          const Icon = getEquipmentIcon(item.type ?? '');
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => navigate(`/recipes?equipmentId=${item.equipmentId}`)}
              className="flex items-center gap-3 rounded-lg p-3 text-left transition-colors min-h-11 border border-[color:var(--border-primary)] bg-[color:var(--bg-primary)] cursor-pointer w-full"
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-tertiary)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-primary)';
              }}
            >
              <span className="flex-shrink-0 text-[color:var(--text-secondary)]">
                <Icon size={24} />
              </span>

              <span className="flex flex-col min-w-0">
                <span className="font-semibold text-sm truncate text-[color:var(--text-primary)]">
                  {item.name ?? ''}
                </span>
                <span className="text-xs uppercase tracking-wide text-[color:var(--text-tertiary)]">
                  {item.type?.replace(/_/g, ' ') ?? ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
