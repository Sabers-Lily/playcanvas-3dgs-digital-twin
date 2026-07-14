export const CUSTOM_FIELD_TYPES = ['text', 'number', 'color', 'boolean', 'textarea'];
export const DEFAULT_CUSTOM_FIELD_TYPE = 'text';
export const MAX_CUSTOM_FIELDS = 30;
export const MAX_CUSTOM_FIELD_NAME_LENGTH = 50;
export const MAX_CUSTOM_FIELD_TEXT_LENGTH = 500;
export const MAX_CUSTOM_FIELD_TEXTAREA_LENGTH = 5000;

export function isCustomFieldType(type) {
  return CUSTOM_FIELD_TYPES.includes(type);
}

export function normalizeCustomFieldType(type) {
  return isCustomFieldType(type) ? type : DEFAULT_CUSTOM_FIELD_TYPE;
}

export function createDefaultCustomFieldValue(type) {
  switch (normalizeCustomFieldType(type)) {
    case 'number':
      return '';
    case 'color':
      return '#FFFFFF';
    case 'boolean':
      return false;
    case 'textarea':
    case 'text':
    default:
      return '';
  }
}

export function normalizeCustomFieldValue(value, type) {
  switch (normalizeCustomFieldType(type)) {
    case 'number':
      if (value === '' || value === null || value === undefined) {
        return '';
      }
      return Number.isFinite(Number(value)) ? Number(value) : '';
    case 'color':
      return isValidCustomFieldColor(value) ? String(value).toUpperCase() : '#FFFFFF';
    case 'boolean':
      return Boolean(value);
    case 'textarea':
      return String(value ?? '').slice(0, MAX_CUSTOM_FIELD_TEXTAREA_LENGTH);
    case 'text':
    default:
      return String(value ?? '').slice(0, MAX_CUSTOM_FIELD_TEXT_LENGTH);
  }
}

export function isValidCustomFieldColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/iu.test(value);
}

export function normalizeCustomFields(fields) {
  if (!Array.isArray(fields)) {
    return [];
  }

  const usedIds = new Set();
  return fields
    .slice(0, MAX_CUSTOM_FIELDS)
    .map((field, index) => {
      const type = normalizeCustomFieldType(field?.type);
      const idBase = String(field?.id || `field_${index + 1}`).trim() || `field_${index + 1}`;
      let id = idBase;
      let suffix = 1;
      while (usedIds.has(id)) {
        id = `${idBase}_${suffix}`;
        suffix += 1;
      }
      usedIds.add(id);

      return {
        id,
        name: String(field?.name ?? '').trim().slice(0, MAX_CUSTOM_FIELD_NAME_LENGTH),
        type,
        value: normalizeCustomFieldValue(field?.value, type)
      };
    });
}
