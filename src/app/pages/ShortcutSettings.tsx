import { Banner, Button, Input, Modal, Select, Spin, Typography } from '@douyinfe/semi-ui';
import { type ComponentRef, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppLocale } from '../i18n';
import {
  HIDE_LAUNCHER_ACTION_ID,
  type LauncherActionDescriptor,
  OPEN_SETTINGS_ACTION_ID,
  resolveLocalizedActionText,
} from '../launcher/actions';
import {
  createShortcutRecordingPreview,
  defaultShortcutConfiguration,
  replaceActionShortcut,
  replaceShortcut,
  SHORTCUT_MODIFIERS,
  ShortcutError,
  type ShortcutErrorCode,
  type ShortcutRecordingPreview,
  type ShortcutService,
  type ShortcutSnapshot,
  type ShortcutTrigger,
  shortcutFromKeyEvent,
} from '../shortcuts';

interface Editor {
  readonly target: string;
  readonly originalTarget?: string;
  readonly draft?: boolean;
  readonly mode: ShortcutTrigger['kind'];
  readonly candidate: ShortcutTrigger | null;
  readonly recording: boolean;
}

export interface ShortcutSettingsProps {
  readonly service: ShortcutService;
  readonly actions: readonly LauncherActionDescriptor[];
}

const isFeatureShortcutTarget = (actionId: string) =>
  actionId !== HIDE_LAUNCHER_ACTION_ID && actionId !== OPEN_SETTINGS_ACTION_ID;

export const ShortcutSettings = ({ service, actions }: ShortcutSettingsProps) => {
  const { t } = useTranslation();
  const { locale } = useAppLocale();
  const [snapshot, setSnapshot] = useState<ShortcutSnapshot>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [recordingStarting, setRecordingStarting] = useState(false);
  const [recordingEventsReady, setRecordingEventsReady] = useState(false);
  const [recordingPreview, setRecordingPreview] = useState<ShortcutRecordingPreview>();
  const previewRef = useRef<ShortcutRecordingPreview | undefined>(undefined);
  const pressedKeys = useMemo(createShortcutRecordingPreview, []);
  const updatePreview = useCallback((preview: ShortcutRecordingPreview | undefined) => {
    previewRef.current = preview;
    setRecordingPreview(preview);
  }, []);
  const [feedback, setFeedback] = useState<ShortcutErrorCode | 'saved'>();
  const [conflictingTarget, setConflictingTarget] = useState<string>();
  const [editor, setEditor] = useState<Editor>();
  const [confirmReset, setConfirmReset] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const alive = useRef(true);
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const leaseRef = useRef<string | undefined>(undefined);
  const recordingAttempt = useRef(0);
  const pendingRef = useRef(false);
  const recordingStartRef = useRef(false);
  const cancelledStartingLeases = useRef(new Set<string>());
  const snapshotRef = useRef<ShortcutSnapshot | undefined>(undefined);
  const snapshotEpoch = useRef(0);
  const returnFocus = useRef<HTMLElement | undefined>(undefined);
  const returnFocusId = useRef<string | undefined>(undefined);
  const recordingInput = useRef<ComponentRef<typeof Input>>(null);
  const rowSelects = useRef(new Map<string, { close: () => void }>());
  const closeSelectMenus = useCallback(() => {
    for (const select of rowSelects.current.values()) select.close();
  }, []);

  const acceptSnapshot = useCallback((value: ShortcutSnapshot, requestEpoch?: number) => {
    const current = snapshotRef.current;
    if (
      current &&
      (value.configuration.revision < current.configuration.revision ||
        (value.configuration.revision === current.configuration.revision &&
          requestEpoch !== undefined &&
          requestEpoch < snapshotEpoch.current))
    )
      return;
    snapshotRef.current = value;
    snapshotEpoch.current += 1;
    setSnapshot(value);
  }, []);

  const restoreFocus = useCallback(() => {
    setFocusRequest((request) => request + 1);
  }, []);
  useEffect(() => {
    if (!focusRequest || pending || editor || confirmReset) return;
    const target = returnFocus.current;
    requestAnimationFrame(() => {
      const current = target?.isConnected
        ? target
        : returnFocusId.current
          ? document.getElementById(returnFocusId.current)
          : undefined;
      current?.focus({ preventScroll: true });
    });
  }, [focusRequest, pending, editor, confirmReset]);

  const releaseRecording = useCallback(() => {
    recordingAttempt.current += 1;
    recordingStartRef.current = false;
    pressedKeys.reset();
    previewRef.current = undefined;
    if (alive.current) {
      setRecordingStarting(false);
      updatePreview(undefined);
    }
    const lease = leaseRef.current;
    leaseRef.current = undefined;
    if (lease) void service.endRecording(lease).catch(() => undefined);
  }, [pressedKeys, service, updatePreview]);

  const cancelEditor = useCallback(() => {
    closeSelectMenus();
    releaseRecording();
    editorRef.current = undefined;
    setEditor(undefined);
    setFeedback(undefined);
    setConflictingTarget(undefined);
    restoreFocus();
  }, [closeSelectMenus, releaseRecording, restoreFocus]);

  const isEditing = editor !== undefined;
  useEffect(() => {
    if (!isEditing) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        event.isComposing ||
        event.keyCode === 229 ||
        pendingRef.current
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      cancelEditor();
    };
    // Capture also covers Semi controls and their portaled menus while editing.
    document.addEventListener('keydown', cancelOnEscape, true);
    return () => document.removeEventListener('keydown', cancelOnEscape, true);
  }, [cancelEditor, isEditing]);

  const reportError = useCallback(
    (error: unknown, requestEpoch?: number) => {
      const safeError = error instanceof ShortcutError ? error : new ShortcutError('unavailable');
      setFeedback(safeError.code);
      setConflictingTarget(safeError.conflicting_target);
      if (safeError.snapshot) acceptSnapshot(safeError.snapshot, requestEpoch);
      if (safeError.code === 'revision_conflict') {
        const epoch = snapshotEpoch.current;
        void service
          .read()
          .then((value) => {
            if (alive.current) acceptSnapshot(value, epoch);
          })
          .catch(() => undefined);
      }
    },
    [acceptSnapshot, service],
  );

  useEffect(() => {
    alive.current = true;
    setRecordingEventsReady(false);
    let disposed = false;
    const cleanup: (() => void)[] = [];
    const install = async () => {
      try {
        // Install before reading so a concurrent confirmed write cannot be missed.
        const unlisten = await service.subscribe((value) => {
          if (!disposed) acceptSnapshot(value);
        });
        if (disposed) {
          unlisten();
          return;
        }
        cleanup.push(unlisten);
        const epoch = snapshotEpoch.current;
        const value = await service.read();
        if (!disposed) acceptSnapshot(value, epoch);
      } catch (error) {
        if (!disposed) reportError(error);
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    void install();
    void service
      .subscribeRecording((event) => {
        if (disposed) return;
        if (event.lease_id !== leaseRef.current) {
          if (event.cancelled && recordingStartRef.current) {
            cancelledStartingLeases.current.add(event.lease_id);
            if (cancelledStartingLeases.current.size > 32) cancelEditor();
          }
          return;
        }
        if (event.cancelled) {
          cancelEditor();
          return;
        }
        const current = editorRef.current;
        if (current?.recording && event.trigger?.kind === current.mode) {
          if (event.trigger.kind !== 'chord') return;
          pressedKeys.reset();
          updatePreview({ modifiers: event.trigger.modifiers, keys: [event.trigger.key] });
          editorRef.current = { ...current, candidate: event.trigger };
          setEditor(editorRef.current);
          setFeedback(undefined);
        }
      })
      .then((unlisten) => {
        if (disposed) unlisten();
        else {
          cleanup.push(unlisten);
          setRecordingEventsReady(true);
        }
      })
      .catch((error: unknown) => {
        if (!disposed) reportError(error);
      });
    return () => {
      disposed = true;
      alive.current = false;
      releaseRecording();
      for (const unlisten of cleanup) unlisten();
    };
  }, [acceptSnapshot, cancelEditor, pressedKeys, releaseRecording, reportError, service, updatePreview]);

  useEffect(() => {
    if (!editor?.recording && !recordingStarting) return;
    const cancel = () => cancelEditor();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') cancel();
    };
    const timer = setInterval(() => {
      const leaseId = leaseRef.current;
      if (!leaseId || document.visibilityState === 'hidden') {
        cancel();
        return;
      }
      void service.renewRecording(leaseId).catch(() => {
        if (alive.current && leaseRef.current === leaseId) {
          releaseRecording();
          setEditor((current) => (current ? { ...current, recording: false } : current));
          setFeedback('recording_unavailable');
        }
      });
    }, 10_000);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [cancelEditor, editor?.recording, recordingStarting, releaseRecording, service]);

  const targetName = (target: string) => {
    if (target === 'launcher') return t('settings.shortcuts.recovery');
    if (!target) return t('settings.shortcuts.newShortcut');
    const action = actions.find(({ action_id }) => action_id === target);
    return action?.enabled
      ? resolveLocalizedActionText(action.title, locale)
      : t('settings.shortcuts.unavailableTarget', { id: target });
  };
  const displayPressedKeys = (preview: ShortcutRecordingPreview) => {
    const keyName = (code: string) => {
      const labels = snapshot?.key_labels;
      const label = preview.modifiers.includes('cmd') ? (labels?.[`cmd:${code}`] ?? labels?.[code]) : labels?.[code];
      if (label) return label;
      const key = code.replace(/^Key|^Digit/, '');
      return /^[A-Z]$|^[0-9]$|^F\d+$/.test(key) ? key : t(`settings.shortcuts.keys.${key}`);
    };
    return [
      ...preview.modifiers.map((modifier) => t(`settings.shortcuts.modifiers.${modifier}`)),
      ...preview.keys.map(keyName),
    ].join(' + ');
  };
  const displayTrigger = (trigger: ShortcutTrigger | null) => {
    if (!trigger) return t('settings.shortcuts.unbound');
    return trigger.kind === 'modifier_double_tap'
      ? t('settings.shortcuts.doubleTapDisplay', { modifier: t(`settings.shortcuts.modifiers.${trigger.modifier}`) })
      : displayPressedKeys({ modifiers: trigger.modifiers, keys: [trigger.key] });
  };

  const previewMatchesCandidate = (candidate: ShortcutTrigger | null, preview: ShortcutRecordingPreview | undefined) =>
    !preview ||
    (candidate?.kind === 'chord' &&
      preview.keys.length === 1 &&
      preview.keys[0] === candidate.key &&
      preview.modifiers.join('+') === candidate.modifiers.join('+'));

  const openEditor = (target: string, trigger: ShortcutTrigger | null, element: HTMLElement) => {
    releaseRecording();
    returnFocus.current = element;
    returnFocusId.current = element.id;
    setFeedback(undefined);
    setConflictingTarget(undefined);
    const next: Editor = {
      target,
      originalTarget: target || undefined,
      draft: !target,
      candidate: trigger,
      mode: trigger?.kind ?? 'chord',
      recording: false,
    };
    editorRef.current = next;
    setEditor(next);
    return next;
  };
  const updateEditor = (next: Editor) => {
    editorRef.current = next;
    setEditor(next);
  };
  const startRecording = async () => {
    const current = editorRef.current;
    if (
      !current ||
      current.mode !== 'chord' ||
      pendingRef.current ||
      recordingStartRef.current ||
      !recordingEventsReady
    )
      return;
    releaseRecording();
    recordingStartRef.current = true;
    cancelledStartingLeases.current.clear();
    setRecordingStarting(true);
    updateEditor({ ...current, candidate: null, recording: false });
    const attempt = recordingAttempt.current;
    setFeedback(undefined);
    let acquiredLease: string | undefined;
    try {
      const lease = await service.beginRecording();
      acquiredLease = lease.lease_id;
      if (!alive.current || attempt !== recordingAttempt.current || editorRef.current?.target !== current.target) {
        await service.endRecording(lease.lease_id);
        return;
      }
      await service.renewRecording(lease.lease_id);
      if (cancelledStartingLeases.current.has(lease.lease_id)) throw new ShortcutError('recording_unavailable');
      if (!alive.current || attempt !== recordingAttempt.current || editorRef.current?.target !== current.target) {
        await service.endRecording(lease.lease_id);
        return;
      }
      leaseRef.current = lease.lease_id;
      updateEditor({ ...current, candidate: null, recording: true });
      requestAnimationFrame(() => recordingInput.current?.focus());
    } catch (error) {
      if (acquiredLease) void service.endRecording(acquiredLease).catch(() => undefined);
      if (alive.current && attempt === recordingAttempt.current) reportError(error);
    } finally {
      if (attempt === recordingAttempt.current) {
        recordingStartRef.current = false;
        if (alive.current) setRecordingStarting(false);
      }
    }
  };

  const save = async (
    configuration: ShortcutSnapshot['configuration'],
    focusId?: string,
    resolveLauncherMigration = false,
  ) => {
    if (!snapshot || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setFeedback(undefined);
    releaseRecording();
    setEditor((current) => (current ? { ...current, recording: false } : current));
    const epoch = snapshotEpoch.current;
    try {
      const value = resolveLauncherMigration
        ? await service.write(configuration.revision, configuration, { resolveLauncherMigration: true })
        : await service.write(configuration.revision, configuration);
      if (!alive.current) return;
      acceptSnapshot(value, epoch);
      editorRef.current = undefined;
      setEditor(undefined);
      if (focusId) {
        returnFocus.current = undefined;
        returnFocusId.current = focusId;
      }
      setConfirmReset(false);
      setFeedback('saved');
      restoreFocus();
    } catch (error) {
      if (alive.current) reportError(error, epoch);
    } finally {
      pendingRef.current = false;
      if (alive.current) setPending(false);
    }
  };
  const saveCandidate = () => {
    const current = editorRef.current;
    const confirmed = snapshotRef.current;
    if (
      !confirmed ||
      !current?.candidate ||
      !current.target ||
      !previewMatchesCandidate(current.candidate, previewRef.current)
    )
      return;
    try {
      const configuration =
        current.target === 'launcher'
          ? replaceShortcut(confirmed.configuration, current.target, current.candidate)
          : replaceActionShortcut(confirmed.configuration, current.originalTarget, current.target, current.candidate);
      void save(
        configuration,
        `shortcut-edit-${current.target}`,
        current.target === 'launcher' && !!confirmed.launcher_migration,
      );
    } catch (error) {
      reportError(error);
    }
  };
  const clear = (target: string) => {
    if (!snapshot) return;
    returnFocus.current = undefined;
    returnFocusId.current = 'shortcut-add';
    try {
      void save(replaceShortcut(snapshot.configuration, target, null));
    } catch (error) {
      reportError(error);
    }
  };

  const restoreSystemShortcut = () => {
    const confirmed = snapshotRef.current;
    if (!confirmed || pendingRef.current) return;
    try {
      void save(
        replaceShortcut(confirmed.configuration, 'launcher', defaultShortcutConfiguration().launcher),
        'shortcut-reset',
        !!confirmed.launcher_migration,
      );
    } catch (error) {
      reportError(error);
    }
  };

  const currentRowEditor = (target: string | undefined, trigger: ShortcutTrigger | null) => {
    const current = editorRef.current;
    if (current && (target === undefined ? current.draft : current.originalTarget === target)) return current;
    const entry = document.getElementById(`shortcut-edit-${target}`) ?? document.getElementById('shortcut-add');
    return openEditor(target ?? '', trigger, entry ?? document.body);
  };

  const renderShortcutRow = (target: string | undefined, trigger: ShortcutTrigger | null, rowNumber = 0) => {
    const launcher = target === 'launcher';
    const current =
      editor && (target === undefined ? editor.draft : editor.originalTarget === target) ? editor : undefined;
    const name = current?.target
      ? targetName(current.target)
      : target
        ? targetName(target)
        : t('settings.shortcuts.newShortcut');
    const mode = current?.mode ?? trigger?.kind;
    const candidate = current ? current.candidate : trigger;
    const rowId = target ?? 'draft';
    const migration = snapshot?.launcher_migration;
    const disabled = pending || (!!editor && !current) || (!launcher && !!migration);
    const options = actions
      .filter((action) => action.enabled && isFeatureShortcutTarget(action.action_id))
      .map((action) => ({
        value: action.action_id,
        label: resolveLocalizedActionText(action.title, locale),
        showTick: false,
        disabled: action.action_id !== target && Object.hasOwn(snapshot?.configuration.actions ?? {}, action.action_id),
      }));
    if (target && !launcher && isFeatureShortcutTarget(target) && !options.some(({ value }) => value === target)) {
      options.unshift({ value: target, label: targetName(target), showTick: false, disabled: false });
    }
    const status = snapshot?.bindings.find((binding) => binding.target === target)?.status;
    return (
      <li key={rowId} className="shortcut-binding" aria-label={t('settings.shortcuts.editor', { target: name })}>
        <div className={launcher ? 'shortcut-launcher-columns' : 'shortcut-action-columns'}>
          {launcher ? (
            <Typography.Text strong className="shortcut-target">
              {t('settings.shortcuts.recovery')}
            </Typography.Text>
          ) : null}
          <span className="sr-only" id={`shortcut-type-label-${rowId}`}>
            {t('settings.shortcuts.typeForTarget', { target: name })}
          </span>
          <Select
            ref={(select) => {
              if (select) rowSelects.current.set(`${rowId}.type`, select);
              else rowSelects.current.delete(`${rowId}.type`);
            }}
            className="shortcut-type-select"
            aria-labelledby={`shortcut-type-label-${rowId}`}
            placeholder={t('settings.shortcuts.chooseType')}
            value={mode}
            disabled={disabled}
            optionList={[
              { value: 'chord', label: t('settings.shortcuts.chordMode'), showTick: false },
              { value: 'modifier_double_tap', label: t('settings.shortcuts.doubleTapMode'), showTick: false },
            ]}
            onChange={(value) => {
              if (value !== 'chord' && value !== 'modifier_double_tap') return;
              const next = currentRowEditor(target, trigger);
              releaseRecording();
              updateEditor({
                ...next,
                mode: value,
                candidate:
                  launcher && migration
                    ? value === 'chord'
                      ? migration.chord
                      : migration.double_tap
                    : next.candidate?.kind === value
                      ? next.candidate
                      : null,
                recording: false,
              });
              setFeedback(undefined);
              setConflictingTarget(undefined);
            }}
          />
          <div className="shortcut-key-cell">
            {mode === 'modifier_double_tap' ? (
              <>
                <span className="sr-only" id={`shortcut-modifier-label-${rowId}`}>
                  {t('settings.shortcuts.modifierForTarget', { target: name })}
                </span>
                <Select
                  ref={(select) => {
                    if (select) rowSelects.current.set(`${rowId}.modifier`, select);
                    else rowSelects.current.delete(`${rowId}.modifier`);
                  }}
                  id={`shortcut-edit-${rowId}`}
                  aria-labelledby={`shortcut-modifier-label-${rowId}`}
                  aria-describedby={!current && status && !migration ? `shortcut-status-${rowId}` : undefined}
                  className="w-full"
                  disabled={disabled}
                  placeholder={t('settings.shortcuts.modifier')}
                  value={candidate?.kind === 'modifier_double_tap' ? candidate.modifier : undefined}
                  optionList={SHORTCUT_MODIFIERS.map((modifier) => ({
                    value: modifier,
                    label: t(`settings.shortcuts.modifiers.${modifier}`),
                    showTick: false,
                  }))}
                  onChange={(value) => {
                    if (!SHORTCUT_MODIFIERS.includes(value as never)) return;
                    const next = currentRowEditor(target, trigger);
                    releaseRecording();
                    updateEditor({
                      ...next,
                      mode: 'modifier_double_tap',
                      candidate: {
                        kind: 'modifier_double_tap',
                        modifier: value as (typeof SHORTCUT_MODIFIERS)[number],
                      },
                      recording: false,
                    });
                    setFeedback(undefined);
                    setConflictingTarget(undefined);
                  }}
                />
              </>
            ) : current ? (
              <Input
                ref={recordingInput}
                id={`shortcut-edit-${rowId}`}
                className="shortcut-recorder"
                readonly
                disabled={disabled || !recordingEventsReady}
                value={
                  current.recording && recordingPreview
                    ? displayPressedKeys(recordingPreview)
                    : displayTrigger(candidate)
                }
                aria-label={t('settings.shortcuts.candidate')}
                aria-busy={recordingStarting}
                data-recording={current.recording}
                onClick={() => {
                  if (!current.recording) void startRecording();
                }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                  const bare = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
                  if (bare && event.key === 'Enter') {
                    event.preventDefault();
                    if (current.candidate && current.target) saveCandidate();
                    else if (!current.recording) void startRecording();
                    return;
                  }
                  if (!current.recording) {
                    if (bare && event.key === ' ') {
                      event.preventDefault();
                      void startRecording();
                    }
                    return;
                  }
                  if (bare && event.key === 'Tab') return;
                  if (
                    event.metaKey &&
                    !event.ctrlKey &&
                    !event.altKey &&
                    !event.shiftKey &&
                    ['w', 'q'].includes(event.key.toLowerCase())
                  ) {
                    releaseRecording();
                    editorRef.current = undefined;
                    setEditor(undefined);
                    return;
                  }
                  if (current.mode !== 'chord') return;
                  const preview = pressedKeys.update(event, true);
                  updatePreview(preview);
                  try {
                    if (preview && preview.keys.length > 1) throw new ShortcutError('invalid_configuration');
                    const next = shortcutFromKeyEvent({ ...event, isComposing: event.nativeEvent.isComposing });
                    if (next) {
                      event.preventDefault();
                      event.stopPropagation();
                      updateEditor({ ...current, candidate: next });
                      setFeedback(undefined);
                      setConflictingTarget(undefined);
                    }
                  } catch (error) {
                    updateEditor({ ...current, candidate: null });
                    reportError(error);
                  }
                }}
                onKeyUp={(event) => {
                  if (!current.recording || event.nativeEvent.isComposing || event.keyCode === 229) return;
                  updatePreview(pressedKeys.update(event, false));
                }}
                onBlur={() => {
                  pressedKeys.reset();
                  updatePreview(undefined);
                }}
              />
            ) : (
              <Button
                id={`shortcut-edit-${rowId}`}
                className="shortcut-key-button"
                aria-label={t('settings.shortcuts.editTarget', { target: name })}
                aria-describedby={status && !migration ? `shortcut-status-${rowId}` : undefined}
                disabled={disabled || !recordingEventsReady || !mode}
                onClick={(event) => {
                  openEditor(target ?? '', trigger, event.currentTarget);
                  void startRecording();
                }}
              >
                {displayTrigger(trigger)}
              </Button>
            )}
            {!current && status && !migration ? (
              <Typography.Text
                id={`shortcut-status-${rowId}`}
                className={status === 'active' ? 'sr-only' : 'shortcut-key-status'}
                type={status === 'active' ? 'tertiary' : 'warning'}
              >
                {t(`settings.shortcuts.status.${status}`)}
              </Typography.Text>
            ) : null}
          </div>
          {!launcher ? (
            <>
              <span className="sr-only" id={`shortcut-action-label-${rowId}`}>
                {t('settings.shortcuts.actionForRow', { index: rowNumber })}
              </span>
              <Select
                ref={(select) => {
                  if (select) rowSelects.current.set(`${rowId}.action`, select);
                  else rowSelects.current.delete(`${rowId}.action`);
                }}
                className="shortcut-action-select"
                aria-labelledby={`shortcut-action-label-${rowId}`}
                placeholder={t('settings.shortcuts.chooseAction')}
                disabled={disabled}
                value={current?.target || target}
                optionList={options}
                renderSelectedItem={(option: { value?: string | number; label?: ReactNode }) =>
                  typeof option.value === 'string' && !isFeatureShortcutTarget(option.value)
                    ? targetName(option.value)
                    : option.label
                }
                onChange={(value) => {
                  if (typeof value !== 'string') return;
                  if (!isFeatureShortcutTarget(value)) return;
                  const next = currentRowEditor(target, trigger);
                  releaseRecording();
                  updateEditor({ ...next, target: value, recording: false });
                  setFeedback(undefined);
                  setConflictingTarget(undefined);
                }}
              />
              <Button
                className="shortcut-delete-button"
                theme="borderless"
                type="tertiary"
                aria-label={t('settings.shortcuts.deleteTarget', { target: name })}
                disabled={disabled}
                onClick={() => (target ? clear(target) : cancelEditor())}
              >
                <span aria-hidden="true">×</span>
              </Button>
            </>
          ) : null}
        </div>
        {current ? (
          <div className="shortcut-inline-edit flex justify-end gap-1">
            <Button
              size="small"
              theme="solid"
              disabled={
                disabled ||
                !current.candidate ||
                !current.target ||
                !previewMatchesCandidate(current.candidate, recordingPreview)
              }
              loading={pending}
              onClick={saveCandidate}
            >
              {t('settings.shortcuts.save')}
            </Button>
            <Button size="small" disabled={pending} onClick={cancelEditor}>
              {t('settings.shortcuts.cancel')}
            </Button>
          </div>
        ) : null}
      </li>
    );
  };

  const message = feedback
    ? t(`settings.shortcuts.feedback.${feedback}`, { target: conflictingTarget ? targetName(conflictingTarget) : '' })
    : '';
  const availableActions = actions.filter((action) => action.enabled && isFeatureShortcutTarget(action.action_id));
  const visibleActionBindings: Array<[string, ShortcutTrigger | null]> = Object.entries(
    snapshot?.configuration.actions ?? {},
  );
  if (
    editor?.originalTarget &&
    editor.originalTarget !== 'launcher' &&
    !visibleActionBindings.some(([target]) => target === editor.originalTarget)
  ) {
    // A confirmed refresh may remove the saved binding while its local candidate
    // is still being reviewed. Keep that editor reachable until save or cancel.
    visibleActionBindings.push([editor.originalTarget, null]);
  }
  const permissionRequired = snapshot?.bindings.some(
    ({ status }) => status === 'permission_required' || status === 'monitor_unavailable',
  );

  return (
    <section
      aria-label={t('settings.sections.shortcuts')}
      className="settings-section shortcut-settings flex flex-col gap-3"
    >
      <section aria-labelledby="settings-shortcuts-heading" className="shortcut-settings-group flex flex-col gap-3">
        <Typography.Title heading={3} id="settings-shortcuts-heading">
          {t('settings.shortcuts.system')}
        </Typography.Title>
        {loading ? <Spin aria-label={t('settings.shortcuts.loading')} /> : null}
        {snapshot?.launcher_migration ? (
          <Banner
            type="warning"
            closeIcon={null}
            fullMode={false}
            description={t('settings.shortcuts.launcherMigration')}
          />
        ) : snapshot?.recovery_degraded ? (
          <Banner
            type="warning"
            closeIcon={null}
            fullMode={false}
            description={t('settings.shortcuts.recoveryDegraded')}
          />
        ) : null}
        {snapshot?.diagnostics.length && !snapshot.launcher_migration ? (
          <Banner type="warning" closeIcon={null} fullMode={false} description={t('settings.shortcuts.diagnostics')} />
        ) : null}
        <div
          aria-live="polite"
          role="status"
          className={!confirmReset && (pending || message) ? 'shortcut-feedback' : 'sr-only'}
        >
          <Typography.Text type={feedback && feedback !== 'saved' ? 'danger' : 'tertiary'}>
            {confirmReset ? '' : pending ? t('settings.shortcuts.saving') : message}
          </Typography.Text>
        </div>
        {!loading && !snapshot ? (
          <Button
            onClick={() => {
              setLoading(true);
              const epoch = snapshotEpoch.current;
              void service
                .read()
                .then((value) => {
                  if (alive.current) acceptSnapshot(value, epoch);
                })
                .catch((error: unknown) => {
                  if (alive.current) reportError(error, epoch);
                })
                .finally(() => {
                  if (alive.current) setLoading(false);
                });
            }}
          >
            {t('settings.shortcuts.retry')}
          </Button>
        ) : null}
        {snapshot ? (
          <>
            <ul className="shortcut-bindings flex flex-col gap-2" aria-label={t('settings.shortcuts.launcherBindings')}>
              {renderShortcutRow('launcher', snapshot.launcher_migration ? null : snapshot.configuration.launcher)}
            </ul>
            {permissionRequired ? (
              <div className="flex flex-col items-start gap-2">
                <Typography.Text>{t('settings.shortcuts.permissionDescription')}</Typography.Text>
                <Button
                  disabled={pending}
                  onClick={() => {
                    const epoch = snapshotEpoch.current;
                    void service
                      .requestMonitorPermission()
                      .then((value) => {
                        if (alive.current) acceptSnapshot(value, epoch);
                      })
                      .catch((error: unknown) => {
                        if (alive.current) reportError(error, epoch);
                      });
                  }}
                >
                  {t('settings.shortcuts.permission')}
                </Button>
              </div>
            ) : null}
            <Button
              id="shortcut-reset"
              className="self-end"
              disabled={pending || !!editor}
              onClick={(event) => {
                returnFocus.current = event.currentTarget;
                returnFocusId.current = event.currentTarget.id;
                setFeedback(undefined);
                setConflictingTarget(undefined);
                setConfirmReset(true);
              }}
            >
              {t('settings.shortcuts.reset')}
            </Button>
          </>
        ) : null}
      </section>
      {snapshot ? (
        <section aria-labelledby="shortcut-actions-heading" className="shortcut-settings-group flex flex-col gap-3">
          <Typography.Title heading={3} id="shortcut-actions-heading" tabIndex={-1}>
            {t('settings.shortcuts.actions')}
          </Typography.Title>
          {!visibleActionBindings.length && !editor?.draft ? (
            <Typography.Text type="tertiary">{t('settings.shortcuts.empty')}</Typography.Text>
          ) : null}
          <ul className="shortcut-bindings flex flex-col" aria-label={t('settings.shortcuts.actionBindings')}>
            {visibleActionBindings.map(([target, trigger], index) => renderShortcutRow(target, trigger, index + 1))}
            {editor?.draft ? renderShortcutRow(undefined, null, visibleActionBindings.length + 1) : null}
          </ul>
          {!availableActions.length ? (
            <Typography.Text type="tertiary">{t('settings.shortcuts.noActions')}</Typography.Text>
          ) : null}
          <Button
            id="shortcut-add"
            className="self-end"
            disabled={pending || !!editor || !!snapshot.launcher_migration}
            onClick={(event) => openEditor('', null, event.currentTarget)}
          >
            {t('settings.shortcuts.add')}
          </Button>
        </section>
      ) : null}
      <Modal
        title={t('settings.shortcuts.reset')}
        visible={confirmReset}
        closeOnEsc={!pending}
        maskClosable={!pending}
        closable={false}
        afterClose={restoreFocus}
        confirmLoading={pending}
        cancelButtonProps={{ disabled: pending, 'aria-label': t('settings.shortcuts.cancel') }}
        okButtonProps={{ 'aria-label': t('settings.shortcuts.resetConfirm') }}
        okText={t('settings.shortcuts.resetConfirm')}
        cancelText={t('settings.shortcuts.cancel')}
        onCancel={() => {
          if (!pending) {
            setConfirmReset(false);
            restoreFocus();
          }
        }}
        onOk={restoreSystemShortcut}
      >
        <Typography.Paragraph>{t('settings.shortcuts.resetDescription')}</Typography.Paragraph>
        {confirmReset && feedback && feedback !== 'saved' ? (
          <Banner type="danger" closeIcon={null} fullMode={false} description={message} />
        ) : null}
      </Modal>
    </section>
  );
};
