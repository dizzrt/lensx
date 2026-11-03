const rule = (styles: string, selector: string): string => {
  const standalone = styles.indexOf(`${selector} {`);
  const start = standalone < 0 ? styles.indexOf(`${selector},`) : standalone;
  const end = styles.indexOf('\n}', start);
  if (start < 0 || end < 0) throw new Error(`Launcher outline styles omit ${selector}.`);
  return styles.slice(start, end);
};

/** Source consistency only; native policy tests and compilation establish separate evidence. */
export const assertLauncherRoundedCornersContract = (styles: string, nativePolicy: string): void => {
  const surface = rule(styles, '.launcher-surface');
  const cssRadius = /border-radius:\s*([\d.]+)px\s*;/u.exec(surface)?.[1];
  const nativeRadius = /const LAUNCHER_CORNER_RADIUS_LOGICAL_POINTS:\s*f64\s*=\s*([\d.]+)\s*;/u.exec(nativePolicy)?.[1];
  if (Number(cssRadius) !== 18 || Number(nativeRadius) !== Number(cssRadius)) {
    throw new Error('Launcher CSS and native logical radius must both remain 18.');
  }
  if (!/overflow:\s*hidden\s*;/u.test(surface) || !/background:\s*var\(--semi-color-bg-0\)\s*;/u.test(surface)) {
    throw new Error('Launcher DOM clipping and theme background must be preserved.');
  }
  if (/(?:box-shadow|filter)\s*:/u.test(surface)) {
    throw new Error('Launcher outer surface must not add a CSS shadow.');
  }
  for (const selector of ['html', 'body']) {
    if (!/background:\s*transparent\s*;/u.test(rule(styles, selector))) {
      throw new Error('Launcher root backgrounds must remain transparent.');
    }
  }
  const pluginBody = rule(styles, '.launcher-body[data-page-layout="plugin-edge-to-edge"]');
  for (const property of ['padding-inline', 'padding-bottom', 'gap']) {
    if (!new RegExp(`${property}:\\s*0\\s*;`, 'u').test(pluginBody)) {
      throw new Error(`Plugin body must retain zero ${property}.`);
    }
  }
  for (const selector of ['.plugin-runtime-container', '.plugin-runtime-slot']) {
    if (/border-radius\s*:/u.test(rule(styles, selector))) {
      throw new Error('Plugin slot must not gain an inner card radius.');
    }
  }
};
