import { editText, type PlainTextEditTarget } from '../helpers/modeled-web-editing';

/** Unprivileged document content only; never installed in the product Host. */
export const createOrdinaryPluginEditingFixture = (
  kind: 'input' | 'textarea' | 'contenteditable',
  text = 'alpha beta',
) => {
  const container = document.createElement('section');
  container.setAttribute('aria-label', 'Ordinary external plugin test document');
  const target: PlainTextEditTarget = document.createElement(kind === 'contenteditable' ? 'div' : kind);
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) target.value = text;
  else {
    target.contentEditable = 'true';
    target.tabIndex = 0;
    target.textContent = text;
  }
  target.setAttribute('aria-label', 'External plain text editor');
  container.append(target);
  document.body.append(container);
  target.focus();
  return {
    container,
    target,
    text: () => editText(target),
    dispose: () => container.remove(),
    readOnly(value: boolean) {
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) target.readOnly = value;
      else target.contentEditable = value ? 'false' : 'true';
    },
  };
};
