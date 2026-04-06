import { useState, useCallback, useEffect } from 'react';

interface UndoRedoState<T> {
  value: T;
  set: (v: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useUndoRedo<T>(initial: T, maxHistory = 50): UndoRedoState<T> {
  const [history, setHistory] = useState<T[]>([initial]);
  const [index, setIndex] = useState(0);

  const value = history[index];

  const set = useCallback((v: T) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, index + 1);
      newHistory.push(v);
      if (newHistory.length > maxHistory) newHistory.shift();
      return newHistory;
    });
    setIndex(prev => Math.min(prev + 1, maxHistory - 1));
  }, [index, maxHistory]);

  const undo = useCallback(() => {
    setIndex(prev => Math.max(prev - 1, 0));
  }, []);

  const redo = useCallback(() => {
    setIndex(prev => Math.min(prev + 1, history.length - 1));
  }, [history.length]);

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
    canUndo: index > 0,
    canRedo: index < history.length - 1,
  };
}
