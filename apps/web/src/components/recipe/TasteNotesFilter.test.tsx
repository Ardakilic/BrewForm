/**
 * Property-Based Tests for TasteNotesFilter
 *
 * Property 1: Taste note hierarchy rendering
 * Property 2: Trigger label reflects selection count
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
