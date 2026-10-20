import { useCallback, useEffect, useRef, useState } from 'react';

/** One presentation surface owns arbitration, including both Home collections. */
export const useActionTileTooltip = (keyboardCandidateId?: string, dismissOnEscape = false) => {
  const [pointerId, setPointerId] = useState<string>();
  const [focusId, setFocusId] = useState<string>();
  const [dismissedId, setDismissedId] = useState<string>();
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelLeave = useCallback(() => {
    clearTimeout(leaveTimer.current);
    leaveTimer.current = undefined;
  }, []);
  useEffect(() => cancelLeave, [cancelLeave]);

  const enter = useCallback(
    (id: string) => {
      cancelLeave();
      setPointerId(id);
      setDismissedId(undefined);
    },
    [cancelLeave],
  );
  const leave = useCallback(
    (id: string) => {
      cancelLeave();
      // Bridge the gap between the trigger and its body-mounted overlay.
      leaveTimer.current = setTimeout(() => {
        setPointerId((current) => (current === id ? undefined : current));
        leaveTimer.current = undefined;
      }, 100);
    },
    [cancelLeave],
  );
  const focus = useCallback((id: string) => {
    setFocusId(id);
    setDismissedId(undefined);
  }, []);
  const blur = useCallback((id: string) => {
    setFocusId((current) => (current === id ? undefined : current));
  }, []);
  const release = useCallback((id: string) => {
    setPointerId((current) => (current === id ? undefined : current));
    setFocusId((current) => (current === id ? undefined : current));
    setDismissedId((current) => (current === id ? undefined : current));
  }, []);
  const candidateId = pointerId ?? focusId ?? keyboardCandidateId;
  useEffect(() => {
    if (!dismissOnEscape || !candidateId) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing && event.keyCode !== 229) {
        setDismissedId(candidateId);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [candidateId, dismissOnEscape]);
  return {
    activeId: candidateId === dismissedId ? undefined : candidateId,
    enter,
    leave,
    focus,
    blur,
    release,
    dismiss: () => setDismissedId(candidateId),
  };
};

export type ActionTileTooltipController = ReturnType<typeof useActionTileTooltip>;
