---
trigger: auto
category: rules
---

This rule governs all frontend development practices, React patterns, and UI/UX guidelines for the BrewForm platform.

## React Development Standards

### Component Architecture
```
apps/web/src/
├── components/          # Reusable UI components
│   ├── common/         # Generic components (Button, Input, etc.)
│   ├── forms/          # Form-specific components
│   └── layout/         # Layout components
├── contexts/           # React contexts (auth, theme)
├── hooks/              # Custom hooks
├── pages/              # Route components
├── utils/              # Frontend utilities
├── types/              # TypeScript definitions
└── styles/             # Global styles and themes
```

### Component Best Practices
- Use functional components with hooks
- Implement proper TypeScript prop types
- Use React.memo for performance optimization
- Follow single responsibility principle
- Keep components focused and reusable
- Use descriptive component names

### Component Structure
```typescript
// Component template
import React, { memo, useCallback, useMemo } from 'react'
import { Button } from 'baseui/button'
import { useStyletron } from 'styletron-react'

interface RecipeCardProps {
  recipe: Recipe
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  className?: string
}

export const RecipeCard: React.FC<RecipeCardProps> = memo(({
  recipe,
  onEdit,
  onDelete,
  className
}) => {
  const [css, theme] = useStyletron()
  
  const handleEdit = useCallback(() => {
    onEdit?.(recipe.id)
  }, [recipe.id, onEdit])
  
  const cardStyles = useMemo(() => css({
    backgroundColor: theme.colors.backgroundPrimary,
    border: `1px solid ${theme.colors.borderOpaque}`,
    borderRadius: theme.sizing.scale500,
    padding: theme.sizing.scale600,
    marginBottom: theme.sizing.scale400
  }), [css, theme])
  
  return (
    <div className={`${cardStyles} ${className || ''}`}>
      {/* Component content */}
    </div>
  )
})

RecipeCard.displayName = 'RecipeCard'
```

## BaseUI Integration

### Theme Configuration
```typescript
// Theme customization
import { createTheme, lightThemePrimitives } from 'baseui'

export const brewformTheme = createTheme(lightThemePrimitives, {
  colors: {
    primary: '#6F4E37', // Coffee brown
    backgroundPrimary: '#FAFAFA',
    backgroundSecondary: '#F5F5F5',
    textPrimary: '#2D2D2D',
    textSecondary: '#666666'
  },
  typography: {
    font300: {
      fontSize: '14px',
      fontWeight: '300',
      lineHeight: '20px'
    },
    font400: {
      fontSize: '16px',
      fontWeight: '400',
      lineHeight: '24px'
    }
  }
})
```

### Component Usage Patterns
```typescript
// BaseUI component patterns
import { 
  Button, 
  SIZE as ButtonSize,
  KIND as ButtonKind
} from 'baseui/button'
import { 
  Input, 
  SIZE as InputSize 
} from 'baseui/input'
import { 
  Card, 
  StyledBody 
} from 'baseui/card'

// Consistent component usage
export const RecipeForm: React.FC = () => {
  return (
    <Card>
      <StyledBody>
        <Input
          size={InputSize.compact}
          placeholder="Recipe title"
          overrides={{
            InputContainer: {
              style: { marginBottom: '16px' }
            }
          }}
        />
        <Button
          size={ButtonSize.compact}
          kind={ButtonKind.primary}
          onClick={handleSubmit}
        >
          Save Recipe
        </Button>
      </StyledBody>
    </Card>
  )
}
```

## State Management

### SWR for Data Fetching
```typescript
// Custom SWR hooks
import useSWR from 'swr'
import { apiClient } from '../utils/api-client'

export const useRecipes = (options: RecipeListOptions = {}) => {
  const { data, error, mutate } = useSWR(
    ['recipes', options],
    () => apiClient.getRecipes(options),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 5000
    }
  )
  
  return {
    recipes: data?.data || [],
    isLoading: !error && !data,
    error,
    mutate
  }
}

export const useRecipe = (id: string) => {
  const { data, error, mutate } = useSWR(
    ['recipe', id],
    () => apiClient.getRecipe(id),
    {
      revalidateOnFocus: false
    }
  )
  
  return {
    recipe: data?.data,
    isLoading: !error && !data,
    error,
    mutate
  }
}
```

### React Context Patterns
```typescript
// Authentication context
interface AuthContextType {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  register: (data: RegisterData) => Promise<void>
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  const login = useCallback(async (email: string, password: string) => {
    // Login logic
  }, [])
  
  const logout = useCallback(() => {
    // Logout logic
  }, [])
  
  const value = useMemo(() => ({
    user,
    isLoading,
    login,
    logout
  }), [user, isLoading, login, logout])
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
```

## Custom Hooks

### Data Management Hooks
```typescript
// Form management hook
export const useFormState = <T extends Record<string, any>>(
  initialValues: T
) => {
  const [values, setValues] = useState<T>(initialValues)
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const setValue = useCallback((field: keyof T, value: T[keyof T]) => {
    setValues(prev => ({ ...prev, [field]: value }))
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }, [errors])
  
  const setError = useCallback((field: keyof T, error: string) => {
    setErrors(prev => ({ ...prev, [field]: error }))
  }, [])
  
  const reset = useCallback(() => {
    setValues(initialValues)
    setErrors({})
    setIsSubmitting(false)
  }, [initialValues])
  
  return {
    values,
    errors,
    isSubmitting,
    setValue,
    setError,
    setIsSubmitting,
    reset
  }
}

// Local storage hook
export const useLocalStorage = <T>(
  key: string,
  initialValue: T
) => {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      return initialValue
    }
  })
  
  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value
      setStoredValue(valueToStore)
      window.localStorage.setItem(key, JSON.stringify(valueToStore))
    } catch (error) {
      console.error('Error saving to localStorage:', error)
    }
  }, [key, storedValue])
  
  return [storedValue, setValue] as const
}
```

## Routing and Navigation

### React Router v7 Setup
```typescript
// Route configuration
import { createBrowserRouter, RouterProvider } from 'react-router-dom'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <ErrorBoundary />,
    children: [
      {
        index: true,
        element: <HomePage />
      },
      {
        path: 'recipes',
        children: [
          {
            index: true,
            element: <RecipeListPage />
          },
          {
            path: 'new',
            element: <CreateRecipePage />
          },
          {
            path: ':id',
            element: <RecipeDetailPage />
          },
          {
            path: ':id/edit',
            element: <EditRecipePage />
          }
        ]
      },
      {
        path: 'profile',
        element: <ProfilePage />
      }
    ]
  }
])

export const App: React.FC = () => {
  return (
    <RouterProvider router={router} />
  )
}
```

### Navigation Patterns
```typescript
// Navigation component
import { Link, useLocation, useNavigate } from 'react-router-dom'

export const Navigation: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  
  const isActive = (path: string) => location.pathname === path
  
  return (
    <nav>
      <Link 
        to="/recipes" 
        className={isActive('/recipes') ? 'active' : ''}
      >
        Recipes
      </Link>
      <Link 
        to="/profile" 
        className={isActive('/profile') ? 'active' : ''}
      >
        Profile
      </Link>
    </nav>
  )
}
```

## Form Handling

### Form Validation with Zod
```typescript
// Form validation schema
import { z } from 'zod'

export const recipeSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().max(1000, 'Description too long').optional(),
  coffeeBeanId: z.string().min(1, 'Coffee bean is required'),
  equipmentId: z.string().min(1, 'Equipment is required'),
  brewingMethod: z.enum(['espresso', 'pour-over', 'french-press']),
  parameters: z.object({
    dose: z.number().min(0.1, 'Dose must be positive'),
    yield: z.number().min(0.1, 'Yield must be positive'),
    time: z.number().min(1, 'Time must be positive'),
    temperature: z.number().min(50).max(100),
    grindSize: z.string().optional()
  })
})

type RecipeFormData = z.infer<typeof recipeSchema>
```

### Form Component
```typescript
// Form component with validation
export const RecipeForm: React.FC<{ initialData?: RecipeFormData }> = ({ initialData }) => {
  const { values, errors, setValue, setError, isSubmitting, setIsSubmitting } = useFormState(initialData || defaultValues)
  
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    try {
      const validatedData = recipeSchema.parse(values)
      await apiClient.createRecipe(validatedData)
      // Navigate or show success message
    } catch (error) {
      if (error instanceof z.ZodError) {
        error.errors.forEach(err => {
          setError(err.path.join('.') as keyof RecipeFormData, err.message)
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [values, setValue, setError, setIsSubmitting])
  
  return (
    <form onSubmit={handleSubmit}>
      <Input
        value={values.title}
        onChange={e => setValue('title', e.target.value)}
        placeholder="Recipe title"
        error={errors.title}
      />
      {/* Other form fields */}
      <Button 
        type="submit" 
        isLoading={isSubmitting}
        disabled={isSubmitting}
      >
        Save Recipe
      </Button>
    </form>
  )
}
```

## Performance Optimization

### Code Splitting
```typescript
// Lazy loading components
import { lazy, Suspense } from 'react'

const RecipeDetailPage = lazy(() => import('../pages/RecipeDetailPage'))
const ProfilePage = lazy(() => import('../pages/ProfilePage'))

// Usage with Suspense
const router = createBrowserRouter([
  {
    path: '/recipes/:id',
    element: (
      <Suspense fallback={<LoadingSpinner />}>
        <RecipeDetailPage />
      </Suspense>
    )
  }
])
```

### Memoization Strategies
```typescript
// Expensive calculations
export const RecipeList: React.FC<{ recipes: Recipe[] }> = ({ recipes }) => {
  const sortedRecipes = useMemo(() => {
    return recipes.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }, [recipes])
  
  const filteredRecipes = useMemo(() => {
    return sortedRecipes.filter(recipe => recipe.isPublic)
  }, [sortedRecipes])
  
  return (
    <div>
      {filteredRecipes.map(recipe => (
        <RecipeCard key={recipe.id} recipe={recipe} />
      ))}
    </div>
  )
}
```

## Internationalization

### i18n Setup
```typescript
// i18n configuration
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: require('./locales/en.json') },
      es: { translation: require('./locales/es.json') }
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false }
  })

// Usage in components
import { useTranslation } from 'react-i18next'

export const RecipeForm: React.FC = () => {
  const { t } = useTranslation()
  
  return (
    <form>
      <Input placeholder={t('recipe.title.placeholder')} />
      <Button>{t('common.save')}</Button>
    </form>
  )
}
```

## Testing Frontend Components

### Component Testing with Vitest
```typescript
// Component test example
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RecipeCard } from '../RecipeCard'

describe('RecipeCard', () => {
  const mockRecipe = {
    id: '1',
    title: 'Test Recipe',
    description: 'Test description'
  }
  
  it('renders recipe information correctly', () => {
    render(<RecipeCard recipe={mockRecipe} />)
    
    expect(screen.getByText('Test Recipe')).toBeInTheDocument()
    expect(screen.getByText('Test description')).toBeInTheDocument()
  })
  
  it('calls onEdit when edit button is clicked', async () => {
    const onEdit = vi.fn()
    render(<RecipeCard recipe={mockRecipe} onEdit={onEdit} />)
    
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    
    await waitFor(() => {
      expect(onEdit).toHaveBeenCalledWith('1')
    })
  })
})
```

### Hook Testing
```typescript
// Custom hook testing
import { renderHook, act } from '@testing-library/react'
import { useFormState } from '../useFormState'

describe('useFormState', () => {
  it('initializes with default values', () => {
    const { result } = renderHook(() => 
      useFormState({ name: '', email: '' })
    )
    
    expect(result.current.values).toEqual({ name: '', email: '' })
  })
  
  it('updates values correctly', () => {
    const { result } = renderHook(() => 
      useFormState({ name: '', email: '' })
    )
    
    act(() => {
      result.current.setValue('name', 'John Doe')
    })
    
    expect(result.current.values.name).toBe('John Doe')
  })
})
```

## Accessibility Guidelines

### ARIA Practices
```typescript
// Accessible form components
export const AccessibleInput: React.FC<{
  label: string
  error?: string
  required?: boolean
}> = ({ label, error, required, ...props }) => {
  const errorId = useId()
  
  return (
    <div>
      <label htmlFor={props.id}>
        {label}
        {required && <span aria-label="required">*</span>}
      </label>
      <input
        {...props}
        aria-required={required}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={!!error}
      />
      {error && (
        <span id={errorId} role="alert" className="error">
          {error}
        </span>
      )}
    </div>
  )
}
```

### Keyboard Navigation
```typescript
// Keyboard-friendly components
export const KeyboardMenu: React.FC<{ items: MenuItem[] }> = ({ items }) => {
  const [focusedIndex, setFocusedIndex] = useState(-1)
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex(prev => (prev + 1) % items.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex(prev => prev <= 0 ? items.length - 1 : prev - 1)
        break
      case 'Enter':
        if (focusedIndex >= 0) {
          items[focusedIndex].onClick()
        }
        break
    }
  }, [items, focusedIndex])
  
  return (
    <ul role="menu" onKeyDown={handleKeyDown}>
      {items.map((item, index) => (
        <li
          key={index}
          role="menuitem"
          tabIndex={index === focusedIndex ? 0 : -1}
          onClick={item.onClick}
        >
          {item.label}
        </li>
      ))}
    </ul>
  )
}
```
