const ID_PATTERN = /^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/;

export const isLensxId = (id: string): boolean => ID_PATTERN.test(id);

export const assertLensxId = (id: string, label = 'id'): void => {
  if (!isLensxId(id)) {
    throw new Error(`${label} must be a strict three-part ID: author.module.name`);
  }
};
