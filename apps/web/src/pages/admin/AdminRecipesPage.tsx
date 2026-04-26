import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface Recipe {
  id: string;
  title: string;
  slug: string;
  visibility: string;
  author: { username: string };
  likeCount: number;
  commentCount: number;
  createdAt: string;
}

export function AdminRecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ recipes: Recipe[]; total: number }>('/admin/recipes?perPage=50').then((data) => {
      const d = data as Record<string, unknown>;
      setRecipes((d.recipes as Recipe[]) || []);
    }).catch(() => {
    }).finally(() => setLoading(false));
  }, []);

  async function changeVisibility(id: string, visibility: string) {
    try {
      await api.patch(`/admin/recipes/${id}/visibility`, { visibility } as Record<string, unknown>);
      setRecipes((prev) => prev.map((r) => r.id === id ? { ...r, visibility } : r));
    } catch {
    }
  }

  async function deleteRecipe(id: string) {
    if (!globalThis.confirm('Delete this recipe?')) return;
    try {
      await api.delete(`/admin/recipes/${id}`);
      setRecipes((prev) => prev.filter((r) => r.id !== id));
    } catch {
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Recipe Management</h1>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Title</th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Author</th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Visibility</th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Stats</th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recipes.map((recipe) => (
                <tr key={recipe.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{recipe.title}</td>
                  <td className="py-2 px-3" style={{ color: 'var(--text-secondary)' }}>{recipe.author?.username}</td>
                  <td className="py-2 px-3">
                    <select
                      value={recipe.visibility}
                      onChange={(e) => changeVisibility(recipe.id, e.target.value)}
                      className="text-xs rounded px-2 py-1"
                      style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }}
                    >
                      <option value="draft">Draft</option>
                      <option value="private">Private</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="public">Public</option>
                    </select>
                  </td>
                  <td className="py-2 px-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>❤️{recipe.likeCount} 💬{recipe.commentCount}</td>
                  <td className="py-2 px-3">
                    <button type="button" onClick={() => deleteRecipe(recipe.id)} className="text-xs" style={{ color: 'var(--error)' }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}