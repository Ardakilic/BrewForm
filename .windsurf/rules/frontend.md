---
trigger: glob
globs: apps/web/**/*.{ts,tsx}
---

<component_structure>
```
apps/web/src/
├── components/   # Reusable UI components
├── contexts/     # React contexts (auth, theme)
├── hooks/        # Custom hooks
├── pages/        # Route components
├── utils/        # Frontend utilities
├── types/        # TypeScript definitions
└── i18n/         # Internationalization
```
</component_structure>

<react_patterns>
- Use functional components with hooks
- Implement proper TypeScript prop interfaces
- Use React.memo for expensive renders
- Add displayName to memoized components
- Use useCallback/useMemo appropriately
</react_patterns>

<baseui_usage>
```typescript
import { Button, SIZE, KIND } from 'baseui/button'
import { Input } from 'baseui/input'
import { useStyletron } from 'styletron-react'

// Use Styletron for custom styles
const [css, theme] = useStyletron()
const styles = css({
  backgroundColor: theme.colors.backgroundPrimary,
  padding: theme.sizing.scale600
})
```
</baseui_usage>

<state_management>
- Use SWR for server state fetching
- Use React Context for global state (auth, theme)
- Implement loading and error states
- Use optimistic updates where appropriate
</state_management>

<swr_patterns>
```typescript
const { data, error, mutate } = useSWR(
  ['recipes', options],
  () => apiClient.getRecipes(options),
  { revalidateOnFocus: false }
)
```
</swr_patterns>

<form_handling>
- Use react-hook-form with @hookform/resolvers
- Validate with Zod schemas
- Show proper error messages
- Implement loading states on submit
</form_handling>

<routing>
- Use React Router v7 patterns
- Implement lazy loading with React.lazy
- Use Suspense with loading fallbacks
- Handle route errors with errorElement
</routing>

<i18n>
- Use react-i18next for translations
- Keep translation keys organized
- Use `useTranslation` hook in components
</i18n>

<accessibility>
- Use proper ARIA attributes
- Implement keyboard navigation
- Add aria-labels to interactive elements
- Test with screen readers
</accessibility>
