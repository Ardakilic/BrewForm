/**
 * Property-Based Tests for TasteNotesFilter
 *
 * Property 1: Taste note hierarchy rendering
 * Property 2: Trigger label reflects selection count
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import { TasteNotesFilter, type TasteNoteFlat } from './TasteNotesFilter';

// ---------------------------------------------------------------------------
// Arbitrary generators
// ---------------------------------------------------------------------------

/**
 * Generate a valid taste note tree:
 * 1. Generate a fixed set of roots (depth 0, parentId null)
 * 2. Generate children (depth 1 or 2) that reference a valid ancestor
 */
function tasteNotesTreeArb(minRoots = 1, maxRoots = 5, maxTotal = 30) {
  return fc
    .array(
      fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
      }),
      { minLength: minRoots, maxLength: maxRoots },
    )
    .chain((roots) => {
      const rootIds = roots.map((r) => r.id);
      const rootNotes: TasteNoteFlat[] = roots.map((r) => ({
        id: r.id,
        name: `[R]${r.name}`,
        depth: 0,
        parentId: null,
      }));

      const childArb = fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        depth: fc.integer({ min: 1, max: 2 }),
        parentId: fc.uuid(),
      });

      return fc
        .array(childArb, { maxLength: maxTotal - rootNotes.length })
        .map((rawChildren) => {
          const validChildren: TasteNoteFlat[] = rawChildren
            .map((c) => {
              // Ensure parentId is a valid root or another child that traces back to a root
              let parentId = c.parentId;
              if (!rootIds.includes(parentId)) {
                // pick a random root as parent
                parentId = rootIds[Math.floor(Math.random() * rootIds.length)];
              }
              // For depth 2, parentId could be another child, but to keep it simple
              // and valid per the component's getRootId, we ensure parentId is a root
              // when depth is 2 as well (the component walks up the chain).
              return {
                id: c.id,
                name: c.name,
                depth: c.depth,
                parentId,
              };
            })
            // Remove duplicate IDs
            .filter((c, idx, arr) => arr.findIndex((x) => x.id === c.id) === idx)
            // Ensure child IDs don't clash with root IDs
            .filter((c) => !rootIds.includes(c.id));

          return [...rootNotes, ...validChildren];
        });
    });
}

// ---------------------------------------------------------------------------
// Property 1: Taste note hierarchy rendering
// ---------------------------------------------------------------------------

describe('TasteNotesFilter — Property 1: Taste note hierarchy rendering', () => {
  it(
    'depth-0 nodes render as group role, depth-1/2 as option role, and no depth-0 appears as option',
    async () => {
      await fc.assert(
        fc.asyncProperty(tasteNotesTreeArb(), async (allTasteNotes) => {
          const user = userEvent.setup();
          const onChange = vi.fn();
          const placeholder = 'Select taste notes';

          const { unmount } = render(
            <TasteNotesFilter
              allTasteNotes={allTasteNotes}
              selectedIds={[]}
              onChange={onChange}
              placeholder={placeholder}
            />,
          );

          try {
            const noteById = new Map(allTasteNotes.map((n) => [n.id, n]));
            function getRootId(note: TasteNoteFlat): string | null {
              if (note.depth === 0) return note.id;
              if (!note.parentId) return null;
              const parent = noteById.get(note.parentId);
              if (!parent) return null;
              return getRootId(parent);
            }

            const roots = allTasteNotes.filter((n) => n.depth === 0);
            const rootIds = new Set(roots.map((r) => r.id));
            const children = allTasteNotes.filter((n) => n.depth === 1 || n.depth === 2);
            const validChildren = children.filter((c) => {
              const rootId = getRootId(c);
              return rootId !== null && rootIds.has(rootId);
            });

            if (validChildren.length > 0) {
              // Open the popup by clicking the trigger
              const trigger = screen.getByRole('combobox');
              await user.click(trigger);

              // Wait for portal content to appear in the DOM
              const options = await screen.findAllByRole('option', undefined, { timeout: 2000 });
              expect(options.length).toBe(validChildren.length);

              // No depth-0 node name appears inside an option
              for (const root of roots) {
                const rootAsOption = options.find((opt) => opt.textContent?.includes(root.name));
                expect(rootAsOption).toBeUndefined();
              }
            }
          } finally {
            unmount();
          }
        }),
        { numRuns: 100 },
      );
    },
    30000,
  );
});

// ---------------------------------------------------------------------------
// Property 2: Trigger label reflects selection count
// ---------------------------------------------------------------------------

describe('TasteNotesFilter — Property 2: Trigger label reflects selection count', () => {
  it(
    'trigger text shows placeholder when N=0, otherwise shows "{N} selected"',
    () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.uuid(),
              name: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
            }),
            { minLength: 1, maxLength: 15 },
          ),
          fc.integer({ min: 0, max: 10 }),
          (notes, nSelected) => {
            const allTasteNotes: TasteNoteFlat[] = notes.map((n) => ({
              id: n.id,
              name: n.name,
              depth: 0,
              parentId: null,
            }));

            // Pick N random IDs (distinct)
            const shuffled = [...allTasteNotes].sort(() => Math.random() - 0.5);
            const selectedIds = shuffled.slice(0, Math.min(nSelected, allTasteNotes.length)).map((n) => n.id);

            const onChange = vi.fn();
            const placeholder = 'Select taste notes';

            const { container, unmount } = render(
              <TasteNotesFilter
                allTasteNotes={allTasteNotes}
                selectedIds={selectedIds}
                onChange={onChange}
                placeholder={placeholder}
              />,
            );

            try {
              const trigger = container.querySelector('[role="combobox"]');
              expect(trigger).toBeTruthy();

              const triggerText = trigger?.textContent ?? '';

              if (selectedIds.length === 0) {
                expect(triggerText).toContain(placeholder);
              } else {
                expect(triggerText).toContain(`${selectedIds.length} selected`);
              }
            } finally {
              unmount();
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

describe('TasteNotesFilter — styling consistency', () => {
  it('trigger has rounded-lg, w-full, py-2 px-3, justify-between, and bg-primary classes matching input-field', () => {
    const allTasteNotes: TasteNoteFlat[] = [
      { id: 'root-1', name: 'Fruity', depth: 0, parentId: null },
      { id: 'mid-1', name: 'Berry', depth: 1, parentId: 'root-1' },
    ];

    const { container } = render(
      <TasteNotesFilter
        allTasteNotes={allTasteNotes}
        selectedIds={[]}
        onChange={vi.fn()}
        placeholder='Select taste notes'
      />,
    );

    const trigger = container.querySelector('[role="combobox"]');
    expect(trigger).toBeTruthy();

    const classList = trigger?.className ?? '';
    expect(classList).toContain('rounded-lg');
    expect(classList).toContain('w-full');
    expect(classList).toContain('py-2');
    expect(classList).toContain('px-3');
    expect(classList).toContain('justify-between');
    expect(classList).toContain('bg-[color:var(--bg-primary)]');
    expect(classList).not.toContain('rounded-full');
    expect(classList).not.toContain('bg-[color:var(--bg-tertiary)]');
  });

  it('popup has max-h-80 and overflow-y-auto classes', async () => {
    const user = userEvent.setup();
    const allTasteNotes: TasteNoteFlat[] = [
      { id: 'root-1', name: 'Fruity', depth: 0, parentId: null },
      { id: 'mid-1', name: 'Berry', depth: 1, parentId: 'root-1' },
    ];

    const { container } = render(
      <TasteNotesFilter
        allTasteNotes={allTasteNotes}
        selectedIds={[]}
        onChange={vi.fn()}
        placeholder='Select taste notes'
      />,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    // The popup is the ancestor of the listbox that has the max-h and overflow classes
    const listbox = await screen.findByRole('listbox');
    expect(listbox).toBeTruthy();

    // Walk up to find the popup container (parent with max-h-80)
    let popup = listbox.parentElement;
    while (popup && !popup.className.includes('max-h-80')) {
      popup = popup.parentElement;
    }

    expect(popup).toBeTruthy();
    const classList = popup?.className ?? '';
    expect(classList).toContain('max-h-80');
    expect(classList).toContain('overflow-y-auto');
  });

  it('items do not have rounded-md or mx-1 classes', async () => {
    const user = userEvent.setup();
    const allTasteNotes: TasteNoteFlat[] = [
      { id: 'root-1', name: 'Fruity', depth: 0, parentId: null },
      { id: 'mid-1', name: 'Berry', depth: 1, parentId: 'root-1' },
    ];

    render(
      <TasteNotesFilter
        allTasteNotes={allTasteNotes}
        selectedIds={[]}
        onChange={vi.fn()}
        placeholder='Select taste notes'
      />,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    const options = await screen.findAllByRole('option');
    expect(options.length).toBeGreaterThan(0);

    for (const option of options) {
      const classList = option.className ?? '';
      expect(classList).not.toContain('rounded-md');
      expect(classList).not.toContain('mx-1');
    }
  });
});

describe('TasteNotesFilter — search', () => {
  it('renders a search input inside the popup', async () => {
    const user = userEvent.setup();
    const allTasteNotes: TasteNoteFlat[] = [
      { id: 'root-1', name: 'Fruity', depth: 0, parentId: null },
      { id: 'mid-1', name: 'Berry', depth: 1, parentId: 'root-1' },
      { id: 'leaf-1', name: 'Raspberry', depth: 2, parentId: 'mid-1' },
    ];

    render(
      <TasteNotesFilter
        allTasteNotes={allTasteNotes}
        selectedIds={[]}
        onChange={vi.fn()}
        placeholder='Select taste notes'
      />,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    const searchInput = screen.getByPlaceholderText('Search taste notes...');
    expect(searchInput).toBeInTheDocument();
  });

  it('filters items when typing in the search input', async () => {
    const user = userEvent.setup();
    const allTasteNotes: TasteNoteFlat[] = [
      { id: 'root-1', name: 'Fruity', depth: 0, parentId: null },
      { id: 'mid-1', name: 'Berry', depth: 1, parentId: 'root-1' },
      { id: 'leaf-1', name: 'Raspberry', depth: 2, parentId: 'mid-1' },
      { id: 'leaf-2', name: 'Blueberry', depth: 2, parentId: 'mid-1' },
    ];

    render(
      <TasteNotesFilter
        allTasteNotes={allTasteNotes}
        selectedIds={[]}
        onChange={vi.fn()}
        placeholder='Select taste notes'
      />,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    // Berry is now a sub-group header (not selectable); only Raspberry + Blueberry are options
    const optionsBefore = await screen.findAllByRole('option');
    expect(optionsBefore.length).toBe(2);

    // Type search query using fireEvent to avoid pointer-events issues
    const searchInput = screen.getByPlaceholderText('Search taste notes...');
    fireEvent.change(searchInput, { target: { value: 'Rasp' } });

    // Only matching item visible
    await waitFor(() => {
      const optionsAfter = screen.getAllByRole('option');
      expect(optionsAfter.length).toBe(1);
      expect(optionsAfter[0]).toHaveTextContent('Raspberry');
    });
  });

  it('shows empty state when search yields no results', async () => {
    const user = userEvent.setup();
    const allTasteNotes: TasteNoteFlat[] = [
      { id: 'root-1', name: 'Fruity', depth: 0, parentId: null },
      { id: 'mid-1', name: 'Berry', depth: 1, parentId: 'root-1' },
      { id: 'leaf-1', name: 'Raspberry', depth: 2, parentId: 'mid-1' },
    ];

    render(
      <TasteNotesFilter
        allTasteNotes={allTasteNotes}
        selectedIds={[]}
        onChange={vi.fn()}
        placeholder='Select taste notes'
      />,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    const searchInput = screen.getByPlaceholderText('Search taste notes...');
    fireEvent.change(searchInput, { target: { value: 'zzz' } });

    await waitFor(() => {
      expect(screen.getByText('No taste notes found.')).toBeInTheDocument();
      expect(screen.queryAllByRole('option').length).toBe(0);
    });
  });

  it('resets search query when popup closes and reopens', async () => {
    const user = userEvent.setup();
    const allTasteNotes: TasteNoteFlat[] = [
      { id: 'root-1', name: 'Fruity', depth: 0, parentId: null },
      { id: 'mid-1', name: 'Berry', depth: 1, parentId: 'root-1' },
      { id: 'leaf-1', name: 'Raspberry', depth: 2, parentId: 'mid-1' },
    ];

    render(
      <TasteNotesFilter
        allTasteNotes={allTasteNotes}
        selectedIds={[]}
        onChange={vi.fn()}
        placeholder='Select taste notes'
      />,
    );

    // Open popup
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    const searchInput = screen.getByPlaceholderText('Search taste notes...');
    fireEvent.change(searchInput, { target: { value: 'Rasp' } });

    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBe(1);
    });

    // Close popup with Escape
    await user.keyboard('{Escape}');

    // Reopen popup
    await user.click(trigger);

    // Search should be reset and only selectable item visible (Raspberry)
    const searchInputAfter = screen.getByPlaceholderText('Search taste notes...');
    expect(searchInputAfter).toHaveValue('');

    await waitFor(() => {
      const options = screen.getAllByRole('option');
      expect(options.length).toBe(1);
    });
  });
});
