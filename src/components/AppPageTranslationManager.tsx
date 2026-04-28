import { useEffect, useRef } from 'react';
import { resolveAppLanguage } from '@/lib/appLanguages';
import { translateStaticAppText } from '@/lib/appStaticUiTranslations';
import { useSettingsStore } from '@/store/useSettingsStore';

type NodeState = {
  original: string;
  translated: string;
};

const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label'] as const;

function shouldSkipElement(element: Element | null) {
  if (!element) return true;
  if (element.closest('[data-no-app-translate], [translate="no"]')) return true;
  if (element instanceof HTMLElement && element.isContentEditable) return true;
  return ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(element.tagName);
}

export default function AppPageTranslationManager() {
  const appLanguage = useSettingsStore((state) => state.appLanguage);
  const textStateRef = useRef(new WeakMap<Text, NodeState>());
  const attributeStateRef = useRef(new WeakMap<Element, Map<string, NodeState>>());

  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;

    const resolvedLanguage = resolveAppLanguage(appLanguage);
    const activeLanguage = resolvedLanguage.startsWith('en') ? 'en' : resolvedLanguage;

    let frameId: number | null = null;
    let isApplying = false;

    const translateTextNode = (node: Text) => {
      if (shouldSkipElement(node.parentElement)) return;
      const currentText = node.textContent ?? '';
      const stateMap = textStateRef.current;
      let state = stateMap.get(node);

      if (!state || (currentText !== state.original && currentText !== state.translated)) {
        state = { original: currentText, translated: currentText };
      }

      const nextText = activeLanguage === 'en'
        ? state.original
        : translateStaticAppText(activeLanguage, state.original) ?? state.original;

      if (currentText !== nextText) {
        node.textContent = nextText;
      }

      state.translated = nextText;
      stateMap.set(node, state);
    };

    const translateAttributes = (element: Element) => {
      if (shouldSkipElement(element)) return;

      let attributeState = attributeStateRef.current.get(element);
      if (!attributeState) {
        attributeState = new Map<string, NodeState>();
        attributeStateRef.current.set(element, attributeState);
      }

      for (const attributeName of TRANSLATABLE_ATTRIBUTES) {
        const currentValue = element.getAttribute(attributeName);
        if (currentValue == null) continue;

        let state = attributeState.get(attributeName);
        if (!state || (currentValue !== state.original && currentValue !== state.translated)) {
          state = { original: currentValue, translated: currentValue };
        }

        const nextValue = activeLanguage === 'en'
          ? state.original
          : translateStaticAppText(activeLanguage, state.original) ?? state.original;

        if (currentValue !== nextValue) {
          element.setAttribute(attributeName, nextValue);
        }

        state.translated = nextValue;
        attributeState.set(attributeName, state);
      }
    };

    const applyTranslations = () => {
      isApplying = true;

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let currentNode = walker.nextNode();
      while (currentNode) {
        translateTextNode(currentNode as Text);
        currentNode = walker.nextNode();
      }

      translateAttributes(root);
      root.querySelectorAll('*').forEach((element) => translateAttributes(element));

      isApplying = false;
    };

    const scheduleApply = () => {
      if (frameId != null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        applyTranslations();
      });
    };

    const observer = new MutationObserver(() => {
      if (isApplying) return;
      scheduleApply();
    });

    applyTranslations();
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    });

    return () => {
      observer.disconnect();
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [appLanguage]);

  return null;
}