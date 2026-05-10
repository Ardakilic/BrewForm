import { useNavigate } from 'react-router';
import { getEquipmentIcon } from '../icons/equipment/index.ts';

interface EquipmentItem {
  id: string;
  equipmentId: string;
  name: string;
  type: string;
  compatible?: boolean;
}

interface EquipmentSectionProps {
  items: EquipmentItem[];
  brewMethod?: string | null;
}

function getCompatibilityStatus(items: EquipmentItem[]): 'all compatible' | 'incompatible items' {
  const hasIncompatible = items.some((item) => item.compatible === false);
  return hasIncompatible ? 'incompatible items' : 'all compatible';
}

export function EquipmentSection({ items }: EquipmentSectionProps) {
  const navigate = useNavigate();

  if (items.length === 0) {
    return null;
  }

  const compatibilityStatus = getCompatibilityStatus(items);
  const isAllCompatible = compatibilityStatus === 'all compatible';

  return (
    <div className='card'>
      {/* Section header */}
      <div className='flex items-center justify-between mb-4'>
        <span
          className='text-xs font-semibold uppercase tracking-widest'
          style={{ color: 'var(--text-tertiary)' }}
        >
          EQUIPMENT
        </span>
        <span
          className='text-xs'
          style={{ color: 'var(--text-tertiary)' }}
        >
          {items.length} {items.length === 1 ? 'item' : 'items'} ·{' '}
          <span
            style={{
              color: isAllCompatible ? 'var(--success)' : 'var(--warning)',
            }}
          >
            {compatibilityStatus}
          </span>
        </span>
      </div>

      {/* Equipment grid */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
        {items.map((item) => {
          const Icon = getEquipmentIcon(item.type);
          return (
            <button
              key={item.id}
              type='button'
              onClick={() => navigate(`/recipes?equipmentId=${item.equipmentId}`)}
              className='flex items-center gap-3 rounded-lg p-3 text-left transition-colors min-h-11'
              style={{
                border: '1px solid var(--border-primary)',
                backgroundColor: 'var(--bg-primary)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  'var(--bg-tertiary)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  'var(--bg-primary)';
              }}
            >
              {/* Icon */}
              <span
                className='flex-shrink-0'
                style={{ color: 'var(--text-secondary)' }}
              >
                <Icon size={24} />
              </span>

              {/* Name and type */}
              <span className='flex flex-col min-w-0'>
                <span
                  className='font-semibold text-sm truncate'
                  style={{ color: 'var(--text-primary)' }}
                >
                  {item.name}
                </span>
                <span
                  className='text-xs uppercase tracking-wide'
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {item.type.replace(/_/g, ' ')}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
