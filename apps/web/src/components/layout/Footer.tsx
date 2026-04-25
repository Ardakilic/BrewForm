import { Link } from 'react-router';

export function Footer() {
  return (
    <footer style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border-primary)' }}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--accent-primary)' }}>☕ BrewForm</h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Coffee brewing recipes and tasting notes.
            </p>
          </div>
          <div>
            <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Explore</h4>
            <div className="mt-2 flex flex-col gap-1">
              <Link to="/recipes" className="text-sm" style={{ color: 'var(--text-secondary)' }}>Recipes</Link>
              <Link to="/recipes?sort=popular" className="text-sm" style={{ color: 'var(--text-secondary)' }}>Popular</Link>
              <Link to="/taste-notes" className="text-sm" style={{ color: 'var(--text-secondary)' }}>Taste Notes</Link>
            </div>
          </div>
          <div>
            <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Legal</h4>
            <div className="mt-2 flex flex-col gap-1">
              <Link to="/privacy" className="text-sm" style={{ color: 'var(--text-secondary)' }}>Privacy Policy</Link>
              <Link to="/terms" className="text-sm" style={{ color: 'var(--text-secondary)' }}>Terms of Service</Link>
            </div>
          </div>
        </div>
        <div className="mt-6 border-t pt-4 text-center text-xs" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-tertiary)' }}>
          &copy; {new Date().getFullYear()} BrewForm. All rights reserved.
        </div>
      </div>
    </footer>
  );
}