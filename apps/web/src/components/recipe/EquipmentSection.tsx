import { useNavigate } from 'react-router';
import { getEquipmentIcon } from '../icons/equipment/index.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';

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

export function EquipmentSection({ items, brewMethod, brewerDetails }: EquipmentSectionProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const BrewerIcon = getEquipmentIcon('');
  const mainBrewerLabel = t('recipe.mainBrewer');

  if (items.length === 0 && !brewerDetails) {
    return null;
  }

  return (
    <div className='card'>
      {/* Section header */}
      <div className='flex items-center justify-between mb-4'>
        <span
          className='text-xs font-semibold uppercase tracking-widest'
          style={{ color: 'var(--text-tertiary)' }}
        >
          {t('recipe.equipment.title')}
        </span>
        <span
          className='text-xs'
          style={{ color: 'var(--text-tertiary)' }}
        >
          {items.length} {items.length === 1 ? t('recipe.equipment.item') : t('recipe.equipment.items')}
        </span>
      </div>

      {/* Equipment grid */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
        {brewerDetails && (
          <div
            role='button'
            tabIndex={0}
            onClick={() => {
              if (brewMethod) navigate(`/recipes?brewMethod=${brewMethod}`);
            }}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && brewMethod) {
                e.preventDefault();
                navigate(`/recipes?brewMethod=${brewMethod}`);
              }
            }}
            className='flex items-center gap-3 rounded-lg p-3 text-left transition-colors min-h-11'
            style={{
              border: '1px solid var(--border-primary)',
              backgroundColor: 'var(--bg-primary)',
              cursor: brewMethod ? 'pointer' : 'default',
            }}
            onMouseEnter={(e) => {
              if (brewMethod) {
                (e.currentTarget as HTMLDivElement).style.backgroundColor =
                  'var(--bg-tertiary)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.backgroundColor =
                'var(--bg-primary)';
            }}
          >
            <span
              className='flex-shrink-0'
              style={{ color: 'var(--text-secondary)' }}
            >
              <BrewerIcon size={24} />
            </span>

            <span className='flex flex-col min-w-0'>
              <span
                className='font-semibold text-sm truncate'
                style={{ color: 'var(--text-primary)' }}
              >
                {brewerDetails}
              </span>
              <span
                className='text-xs uppercase tracking-wide'
                style={{ color: 'var(--text-tertiary)' }}
              >
                {mainBrewerLabel === 'recipe.mainBrewer' ? 'Main Brewer' : mainBrewerLabel}
              </span>
            </span>
          </div>
        )}

        {items.map((item) => {
          const Icon = getEquipmentIcon(item.type ?? '');
          return (
            <div
              key={item.id}
              role='button'
              tabIndex={0}
              onClick={() => navigate(`/recipes?equipmentId=${item.equipmentId}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/recipes?equipmentId=${item.equipmentId}`);
                }
              }}
              className='flex items-center gap-3 rounded-lg p-3 text-left transition-colors min-h-11'
              style={{
                border: '1px solid var(--border-primary)',
                backgroundColor: 'var(--bg-primary)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor =
                  'var(--bg-tertiary)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor =
                  'var(--bg-primary)';
              }}
            >
              <span
                className='flex-shrink-0'
                style={{ color: 'var(--text-secondary)' }}
              >
                <Icon size={24} />
              </span>

              <span className='flex flex-col min-w-0'>
                <span
                  className='font-semibold text-sm truncate'
                  style={{ color: 'var(--text-primary)' }}
                >
                  {item.name ?? ''}
                </span>
                <span
                  className='text-xs uppercase tracking-wide'
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {item.type?.replace(/_/g, ' ') ?? ''}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
