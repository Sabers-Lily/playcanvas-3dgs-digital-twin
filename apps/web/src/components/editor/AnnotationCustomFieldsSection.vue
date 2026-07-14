<script setup>
import { computed, reactive, watch } from 'vue';
import InspectorSection from './InspectorSection.vue';
import {
  CUSTOM_FIELD_TYPES,
  isValidCustomFieldColor,
  MAX_CUSTOM_FIELD_NAME_LENGTH,
  MAX_CUSTOM_FIELD_TEXT_LENGTH,
  MAX_CUSTOM_FIELD_TEXTAREA_LENGTH,
  normalizeCustomFieldType
} from '../../../../../packages/shared/src/customFields.js';

const props = defineProps({
  objectId: {
    type: String,
    required: true
  },
  fields: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['action']);

const fieldTypeLabels = {
  text: '文本',
  number: '数值',
  color: '颜色',
  boolean: '是/否',
  textarea: '多行文本'
};

const drafts = reactive({});

const normalizedFields = computed(() => (
  Array.isArray(props.fields)
    ? props.fields.map((field) => ({
        ...field,
        type: normalizeCustomFieldType(field?.type)
      }))
    : []
));

function getDefaultDraft(field) {
  return {
    name: field.name ?? '',
    value: field.value ?? '',
    colorText: field.type === 'color' ? String(field.value || '#FFFFFF').toUpperCase() : '',
    nameError: '',
    valueError: ''
  };
}

function syncDrafts() {
  const activeIds = new Set(normalizedFields.value.map((field) => field.id));

  Object.keys(drafts).forEach((fieldId) => {
    if (!activeIds.has(fieldId)) {
      delete drafts[fieldId];
    }
  });

  normalizedFields.value.forEach((field) => {
    const nextDraft = getDefaultDraft(field);
    if (!drafts[field.id]) {
      drafts[field.id] = nextDraft;
      return;
    }

    drafts[field.id].name = nextDraft.name;
    drafts[field.id].value = nextDraft.value;
    drafts[field.id].colorText = nextDraft.colorText;
    drafts[field.id].nameError = '';
    drafts[field.id].valueError = '';
  });
}

watch(
  () => [props.objectId, JSON.stringify(props.fields ?? [])],
  () => syncDrafts(),
  { immediate: true }
);

function emitFieldAction(action, payload = {}) {
  emit('action', action, {
    objectId: props.objectId,
    ...payload
  });
}

function stopInputEvent(event) {
  event.stopPropagation();
}

function hasDuplicateName(fieldId, name) {
  return normalizedFields.value.some((field) => (
    field.id !== fieldId &&
    String(field.name || '').trim() === name
  ));
}

function commitName(field) {
  const draft = drafts[field.id];
  if (!draft) {
    return;
  }

  const nextName = String(draft.name ?? '').trim().slice(0, MAX_CUSTOM_FIELD_NAME_LENGTH);
  draft.name = nextName;
  draft.nameError = '';

  if (!nextName) {
    draft.nameError = '字段名称不能为空';
    return;
  }

  if (hasDuplicateName(field.id, nextName)) {
    draft.nameError = '字段名称已存在';
    return;
  }

  if (nextName !== field.name) {
    emitFieldAction('update-annotation-custom-field', {
      fieldId: field.id,
      patch: { name: nextName }
    });
  }
}

function handleNameKeydown(event, field) {
  stopInputEvent(event);
  if (event.key === 'Enter') {
    event.preventDefault();
    commitName(field);
  }
}

function handleTypeChange(field, nextType) {
  emitFieldAction('update-annotation-custom-field', {
    fieldId: field.id,
    patch: { type: nextType }
  });
}

function commitTextValue(field) {
  const draft = drafts[field.id];
  if (!draft) {
    return;
  }

  const maxLength = field.type === 'textarea'
    ? MAX_CUSTOM_FIELD_TEXTAREA_LENGTH
    : MAX_CUSTOM_FIELD_TEXT_LENGTH;
  const nextValue = String(draft.value ?? '').slice(0, maxLength);
  draft.value = nextValue;
  draft.valueError = '';

  if (nextValue !== String(field.value ?? '')) {
    emitFieldAction('update-annotation-custom-field', {
      fieldId: field.id,
      patch: { value: nextValue }
    });
  }
}

function commitNumberValue(field) {
  const draft = drafts[field.id];
  if (!draft) {
    return;
  }

  const rawValue = String(draft.value ?? '').trim();
  draft.valueError = '';

  if (rawValue === '') {
    emitFieldAction('update-annotation-custom-field', {
      fieldId: field.id,
      patch: { value: '' }
    });
    return;
  }

  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) {
    draft.valueError = '请输入有效数值';
    return;
  }

  emitFieldAction('update-annotation-custom-field', {
    fieldId: field.id,
    patch: { value: numericValue }
  });
}

function commitColorText(field) {
  const draft = drafts[field.id];
  if (!draft) {
    return;
  }

  const nextValue = String(draft.colorText || '').trim().toUpperCase();
  draft.colorText = nextValue;
  draft.valueError = '';

  if (!isValidCustomFieldColor(nextValue)) {
    draft.valueError = '颜色格式必须为 #RRGGBB';
    return;
  }

  emitFieldAction('update-annotation-custom-field', {
    fieldId: field.id,
    patch: { value: nextValue }
  });
}

function handleColorPicker(field, value) {
  const draft = drafts[field.id];
  const nextValue = String(value || '').toUpperCase();
  if (draft) {
    draft.colorText = nextValue;
    draft.valueError = '';
  }
  emitFieldAction('update-annotation-custom-field', {
    fieldId: field.id,
    patch: { value: nextValue }
  });
}

function handleBooleanValue(field, checked) {
  emitFieldAction('update-annotation-custom-field', {
    fieldId: field.id,
    patch: { value: checked }
  });
}

function handleValueKeydown(event, field) {
  stopInputEvent(event);
  if (event.key !== 'Enter' || field.type === 'textarea') {
    return;
  }

  event.preventDefault();
  if (field.type === 'number') {
    commitNumberValue(field);
  } else {
    commitTextValue(field);
  }
}

function safeColorValue(field) {
  const draft = drafts[field.id];
  const value = draft?.colorText || field.value;
  return isValidCustomFieldColor(value) ? value : '#FFFFFF';
}
</script>

<template>
  <InspectorSection title="详细信息" :default-open="true">
    <div v-if="!normalizedFields.length" class="inspector-note">暂未添加详细信息</div>

    <div v-else class="custom-field-list">
      <article v-for="field in normalizedFields" :key="field.id" class="custom-field-card">
        <div class="custom-field-card-header">
          <span>{{ field.name || '未命名字段' }}</span>
          <button
            class="button-ghost custom-field-delete"
            type="button"
            title="删除字段"
            @click="emitFieldAction('delete-annotation-custom-field', { fieldId: field.id })"
          >
            删除
          </button>
        </div>

        <label class="inspector-field">
          <span>字段名称</span>
          <input
            v-model="drafts[field.id].name"
            type="text"
            maxlength="50"
            @keydown="handleNameKeydown($event, field)"
            @blur="commitName(field)"
          />
          <strong v-if="drafts[field.id].nameError" class="custom-field-error">{{ drafts[field.id].nameError }}</strong>
        </label>

        <label class="inspector-field">
          <span>类型</span>
          <select :value="field.type" @keydown="stopInputEvent" @change="handleTypeChange(field, $event.target.value)">
            <option v-for="type in CUSTOM_FIELD_TYPES" :key="type" :value="type">
              {{ fieldTypeLabels[type] }}
            </option>
          </select>
        </label>

        <label v-if="field.type === 'boolean'" class="custom-field-checkbox">
          <input
            type="checkbox"
            :checked="Boolean(field.value)"
            @keydown="stopInputEvent"
            @change="handleBooleanValue(field, $event.target.checked)"
          />
          <span>{{ field.value ? '是' : '否' }}</span>
        </label>

        <label v-else-if="field.type === 'color'" class="inspector-field">
          <span>字段值</span>
          <div class="custom-field-color-row">
            <input
              type="color"
              :value="safeColorValue(field)"
              @change="handleColorPicker(field, $event.target.value)"
            />
            <input
              v-model="drafts[field.id].colorText"
              type="text"
              maxlength="7"
              placeholder="#RRGGBB"
              @keydown="handleValueKeydown($event, field)"
              @blur="commitColorText(field)"
            />
          </div>
          <strong v-if="drafts[field.id].valueError" class="custom-field-error">{{ drafts[field.id].valueError }}</strong>
        </label>

        <label v-else-if="field.type === 'textarea'" class="inspector-field">
          <span>字段值</span>
          <textarea
            v-model="drafts[field.id].value"
            maxlength="5000"
            rows="4"
            @keydown.stop
            @blur="commitTextValue(field)"
          ></textarea>
        </label>

        <label v-else class="inspector-field">
          <span>字段值</span>
          <input
            v-model="drafts[field.id].value"
            :type="field.type === 'number' ? 'number' : 'text'"
            :maxlength="field.type === 'number' ? undefined : 500"
            step="any"
            @keydown="handleValueKeydown($event, field)"
            @blur="field.type === 'number' ? commitNumberValue(field) : commitTextValue(field)"
          />
          <strong v-if="drafts[field.id].valueError" class="custom-field-error">{{ drafts[field.id].valueError }}</strong>
        </label>
      </article>
    </div>

    <div class="inspector-actions">
      <button class="button-secondary" type="button" @click="emitFieldAction('add-annotation-custom-field', { type: 'text' })">
        + 添加字段
      </button>
    </div>
  </InspectorSection>
</template>
