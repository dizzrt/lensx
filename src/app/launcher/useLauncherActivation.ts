import { useEffect, useRef } from 'react';
import type {
  LauncherActivationErrorListener,
  LauncherActivationListener,
  LauncherActivationSource,
} from './activation';

const reportLauncherActivationError: LauncherActivationErrorListener = (error) => {
  console.error('Failed to listen for launcher activation.', error);
};

export const useLauncherActivation = (
  source: LauncherActivationSource,
  onActivation: LauncherActivationListener,
  onError: LauncherActivationErrorListener = reportLauncherActivationError,
) => {
  const onActivationRef = useRef(onActivation);
  const onErrorRef = useRef(onError);
  onActivationRef.current = onActivation;
  onErrorRef.current = onError;

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void source
      .subscribe(
        (payload) => onActivationRef.current(payload),
        (error) => onErrorRef.current(error),
      )
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      })
      .catch((error: unknown) => {
        onErrorRef.current(error);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [source]);
};
