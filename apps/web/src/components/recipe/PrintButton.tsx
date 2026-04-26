export function PrintButton({ slug }: { slug: string }) {
  return (
    <button
      type="button"
      onClick={() => globalThis.open(`/recipes/${slug}/print`, '_blank')}
      className="btn-secondary text-sm"
    >
      🖨️ Print
    </button>
  );
}

export function FocusModeButton({ isFocusMode, onToggle }: { isFocusMode: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="btn-secondary text-sm"
    >
      {isFocusMode ? '✕ Exit Focus' : '📖 Focus Mode'}
    </button>
  );
}