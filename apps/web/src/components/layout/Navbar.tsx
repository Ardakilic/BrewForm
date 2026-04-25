import { Link } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <header style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)' }}>
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link to="/" className="text-xl font-bold" style={{ color: 'var(--accent-primary)' }}>
          ☕ BrewForm
        </Link>

        <div className="flex items-center gap-4">
          <Link to="/recipes" className="text-sm" style={{ color: 'var(--text-secondary)' }}>Recipes</Link>

          {isAuthenticated && (
            <>
              <Link to="/recipes/new" className="text-sm" style={{ color: 'var(--accent-primary)' }}>New Recipe</Link>
              <Link to="/setups" className="text-sm" style={{ color: 'var(--text-secondary)' }}>My Setups</Link>
              <Link to={`/u/${user?.username}`} className="text-sm" style={{ color: 'var(--text-secondary)' }}>Profile</Link>
            </>
          )}

          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'coffee')}
            className="text-sm rounded"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="coffee">Coffee</option>
          </select>

          {isAuthenticated ? (
            <button type="button" onClick={logout} className="btn-secondary text-sm">Log Out</button>
          ) : (
            <>
              <Link to="/login" className="text-sm" style={{ color: 'var(--text-secondary)' }}>Log In</Link>
              <Link to="/register" className="btn-primary text-sm">Sign Up</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}