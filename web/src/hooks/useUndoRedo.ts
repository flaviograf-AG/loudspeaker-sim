import { useState, useCallback, useEffect } from 'react';

interface UndoRedoState<T> {
  value: T;
  set: (v: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface HistoryState<T> {
  entries: T[];
  index: number;
}

export function useUndoRedo<T>(initial: T, maxHistory = 50): UndoRedoState<T> {
  const [state, setState] = useState<HistoryState<T>>({
    entries: [initial],
    index: 0,
  });

  const value = state.entries[state.index];

  const set = useCallback((v: T) => {
    setState(prev => {
      const newEntries = prev.entries.slice(0, prev.index + 1);
      newEntries.push(v);
      if (newEntries.length > maxHistory) newEntries.shift();
      return {
        entries: newEntries,
        index: Math.min(newEntries.length - 1, maxHistory - 1),
      };
    });
  }, [maxHistory]);

  const undo = useCallback(() => {
    setState(prev => ({
      ...prev,
      index: Math.max(prev.index - 1, 0),
    }));
  }, []);

  const redo = useCallback(() => {
    setState(prev => ({
      ...prev,
      index: Math.min(prev.index + 1, prev.entries.length - 1),
    }));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  return {
    value,
    set,
    undo,
    redo,
    canUndo: state.index > 0,
    canRedo: state.index < state.entries.length - 1,
  };
}
