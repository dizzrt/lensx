const LENSX_ID_PATTERN = /^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/;

export const isLensxId = (id: string): boolean => LENSX_ID_PATTERN.test(id);

export const validateLensxId = (id: string, label = 'id'): string[] => {
  if (isLensxId(id)) {
    return [];
  }

  return [`${label} "${id}" must be a strict three-part ID: author.module.name`];
};
