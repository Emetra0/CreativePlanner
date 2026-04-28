import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarOrderState {
  /** Ordered list of hrefs reflecting the user's preferred sidebar order */
  order: string[];
  setOrder: (order: string[]) => void;
}

export const useSidebarOrderStore = create<SidebarOrderState>()(
  persist(
    (set) => ({
      order: [],
      setOrder: (order) => set({ order }),
    }),
    { name: 'creative-planner-sidebar-order' }
  )
);

/**
 * Applies a saved order preference to an array of link objects.
 * Unknown/new links (not in saved order) are appended at the end.
 */
export function applySidebarOrder<T extends { href: string }>(
  links: T[],
  order: string[]
): T[] {
  if (order.length === 0) return links;
  const ranked = links.slice().sort((a, b) => {
    const ia = order.indexOf(a.href);
    const ib = order.indexOf(b.href);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return ranked;
}
