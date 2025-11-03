import { RefObject, useCallback } from 'react';

type Pane = 'base' | 'comparison';

export const useCompareChangeNavigation = (
  baseScrollRef: RefObject<HTMLDivElement | null>,
  comparisonScrollRef: RefObject<HTMLDivElement | null>
) => {
  return useCallback(
    (changeValue: string, pane: Pane, pageNumber?: number) => {
      const targetRef = pane === 'base' ? baseScrollRef : comparisonScrollRef;
      const container = targetRef.current;
      if (!container) {
        return;
      }

      const findNodes = (): HTMLElement[] => {
        return Array.from(
          container.querySelectorAll(`[data-change-id="${changeValue}"]`)
        ) as HTMLElement[];
      };

      const scrollToPageIfNeeded = () => {
        if (!pageNumber) return false;
        const pageEl = container.querySelector(
          `.compare-diff-page[data-page-number="${pageNumber}"]`
        ) as HTMLElement | null;
        if (!pageEl) return false;
        const top = Math.max(0, pageEl.offsetTop - 4);
        container.dataset.programmatic = '1';
        container.scrollTop = Math.max(0, top);
        // also move peer immediately to the same page top to keep alignment
        const peerRef = pane === 'base' ? comparisonScrollRef : baseScrollRef;
        const peer = peerRef.current;
        if (peer) {
          const peerPageEl = peer.querySelector(
            `.compare-diff-page[data-page-number="${pageNumber}"]`
          ) as HTMLElement | null;
          if (peerPageEl) {
            const peerTop = Math.max(0, peerPageEl.offsetTop - 4);
            peer.dataset.programmatic = '1';
            peer.scrollTop = peerTop;
          }
        }
        requestAnimationFrame(() => {
          delete (container as any).dataset.programmatic;
          if (peerRef.current) delete (peerRef.current as any).dataset.programmatic;
        });
        return true;
      };

      let nodes = findNodes();
      if (nodes.length === 0) {
        scrollToPageIfNeeded();
      }

      let attempts = 0;
      const ensureAndScroll = () => {
        nodes = findNodes();
        if (nodes.length === 0 && attempts < 12) {
          attempts += 1;
          scrollToPageIfNeeded();
          window.requestAnimationFrame(ensureAndScroll);
          return;
        }
        if (nodes.length === 0) {
          // Fallback: ensure we at least scroll both panes to the page if available
          if (pageNumber) {
            // Main container already handled via scrollToPageIfNeeded; replicate for peer
            const peerRef = pane === 'base' ? comparisonScrollRef : baseScrollRef;
            const peer = peerRef.current;
            if (peer) {
              const peerPageEl = peer.querySelector(
                `.compare-diff-page[data-page-number="${pageNumber}"]`
              ) as HTMLElement | null;
              if (peerPageEl) {
                peer.dataset.programmatic = '1';
                peer.scrollTop = Math.max(0, peerPageEl.offsetTop);
                requestAnimationFrame(() => { if (peerRef.current) delete (peerRef.current as any).dataset.programmatic; });
              }
            }
          }
          return;
        }

        const containerRect = container.getBoundingClientRect();
        let minTop = Number.POSITIVE_INFINITY;
        let minLeft = Number.POSITIVE_INFINITY;
        let maxBottom = Number.NEGATIVE_INFINITY;
        let maxRight = Number.NEGATIVE_INFINITY;

        nodes.forEach((element) => {
          const rect = element.getBoundingClientRect();
          minTop = Math.min(minTop, rect.top);
          minLeft = Math.min(minLeft, rect.left);
          maxBottom = Math.max(maxBottom, rect.bottom);
          maxRight = Math.max(maxRight, rect.right);
        });

        const boxHeight = Math.max(1, maxBottom - minTop);
        const boxWidth = Math.max(1, maxRight - minLeft);
        const absoluteTop = minTop - containerRect.top + container.scrollTop;
        const absoluteLeft = minLeft - containerRect.left + container.scrollLeft;
        const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
        let desiredTop = Math.max(0, Math.min(maxTop, absoluteTop - (container.clientHeight - boxHeight) / 2));

        // Clamp the desired top so the viewport stays within the target page bounds
        const anchor = nodes[0];
        const pageEl = anchor.closest('.compare-diff-page') as HTMLElement | null;
        if (pageEl) {
          const pageTop = pageEl.offsetTop;
          const pageBottom = pageTop + pageEl.clientHeight;
          const minAllowed = Math.max(0, Math.min(maxTop, pageTop));
          const maxAllowed = Math.max(0, Math.min(maxTop, pageBottom - container.clientHeight));
          desiredTop = Math.max(minAllowed, Math.min(maxAllowed, desiredTop));
        }
        const desiredLeft = Math.max(0, absoluteLeft - (container.clientWidth - boxWidth) / 2);

        container.dataset.programmatic = '1';
        container.scrollTop = desiredTop;
        container.scrollLeft = desiredLeft;
        requestAnimationFrame(() => { delete (container as any).dataset.programmatic; });

        // Also scroll the peer container to the corresponding location in the
        // other PDF (same page and approximate vertical position within page),
        // not just the same list/scroll position.
        const peerRef = pane === 'base' ? comparisonScrollRef : baseScrollRef;
        const peer = peerRef.current;
        if (peer) {
          // Use the first node as the anchor
          const anchor = nodes[0];
          const pageEl = anchor.closest('.compare-diff-page') as HTMLElement | null;
          const pageNumAttr = pageEl?.getAttribute('data-page-number');
          const topPercent = parseFloat((anchor as HTMLElement).style.top || '0');
          if (pageNumAttr) {
            const peerPageEl = peer.querySelector(
              `.compare-diff-page[data-page-number="${pageNumAttr}"]`
            ) as HTMLElement | null;
            const peerInner = peerPageEl?.querySelector('.compare-diff-page__inner') as HTMLElement | null;
            if (peerPageEl && peerInner) {
              const innerRect = peerInner.getBoundingClientRect();
              const innerHeight = Math.max(1, innerRect.height);
              const absoluteTopInPage = (topPercent / 100) * innerHeight;
              const peerMaxTop = Math.max(0, peer.scrollHeight - peer.clientHeight);
              const peerDesiredTop = Math.max(
                0,
                Math.min(peerMaxTop, peerPageEl.offsetTop + absoluteTopInPage - peer.clientHeight / 2)
              );
              peer.dataset.programmatic = '1';
              peer.scrollTop = peerDesiredTop;
              requestAnimationFrame(() => { if (peerRef.current) delete (peerRef.current as any).dataset.programmatic; });
            } else if (peerPageEl) {
              // Fallback: Scroll to page top (clamped)
              peer.dataset.programmatic = '1';
              peer.scrollTop = Math.max(0, peerPageEl.offsetTop - 4);
              requestAnimationFrame(() => { if (peerRef.current) delete (peerRef.current as any).dataset.programmatic; });
            }
          }
        }

        const groupsByInner = new Map<HTMLElement, HTMLElement[]>();
        nodes.forEach((element) => {
          const inner = element.closest('.compare-diff-page__inner') as HTMLElement | null;
          if (!inner) return;
          const list = groupsByInner.get(inner) ?? [];
          list.push(element);
          groupsByInner.set(inner, list);
        });

        groupsByInner.forEach((elements, inner) => {
          let minL = 100;
          let minT = 100;
          let maxR = 0;
          let maxB = 0;
          elements.forEach((element) => {
            const leftPercent = parseFloat(element.style.left) || 0;
            const topPercent = parseFloat(element.style.top) || 0;
            const widthPercent = parseFloat(element.style.width) || 0;
            const heightPercent = parseFloat(element.style.height) || 0;
            minL = Math.min(minL, leftPercent);
            minT = Math.min(minT, topPercent);
            maxR = Math.max(maxR, leftPercent + widthPercent);
            maxB = Math.max(maxB, topPercent + heightPercent);
          });
          const overlay = document.createElement('span');
          overlay.className = 'compare-diff-flash-overlay';
          overlay.style.position = 'absolute';
          overlay.style.left = `${minL}%`;
          overlay.style.top = `${minT}%`;
          overlay.style.width = `${Math.max(0.1, maxR - minL)}%`;
          overlay.style.height = `${Math.max(0.1, maxB - minT)}%`;
          inner.appendChild(overlay);
          window.setTimeout(() => overlay.remove(), 1600);
        });

        nodes.forEach((element) => {
          element.classList.remove('compare-diff-highlight--flash');
        });
        void container.clientWidth; // Force reflow
        nodes.forEach((element) => {
          element.classList.add('compare-diff-highlight--flash');
          window.setTimeout(() => element.classList.remove('compare-diff-highlight--flash'), 1600);
        });
      };

      ensureAndScroll();
    },
    [baseScrollRef, comparisonScrollRef]
  );
};

export type UseCompareChangeNavigationReturn = ReturnType<typeof useCompareChangeNavigation>;
