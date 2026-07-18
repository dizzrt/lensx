<template>
  <article class="launcher-action-card launcher-no-drag flex min-w-0 items-center gap-1">
    <button
      class="launcher-action-card__open flex min-w-0 flex-1 items-center gap-3"
      type="button"
      @click="emit('open')"
    >
      <span class="launcher-action-card__icon shrink-0" aria-hidden="true">P</span>
      <span class="launcher-action-card__main min-w-0">
        <span class="launcher-action-card__title">{{ entry.title }}</span>
        <span class="launcher-action-card__description">{{ entry.detail }}</span>
      </span>
      <span class="launcher-action-card__meta shrink-0">
        <span class="launcher-action-card__badge">{{ t('pluginHost.action.badge') }}</span>
        <span class="launcher-action-card__open-label">{{ t('launcher.item.action.open') }}</span>
      </span>
    </button>

    <n-tooltip>
      <template #trigger>
        <n-button
          class="launcher-action-card__pin launcher-no-drag shrink-0"
          :class="{ 'launcher-action-card__pin--active': pinned }"
          quaternary
          circle
          size="small"
          :aria-label="pinLabel"
          :title="pinLabel"
          @click="emit('toggle-pin')"
          @mousedown.stop
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M15.5 3.5 20 8l-2 2v3.5l1.5 1.5v1H13v4.25l-1 1-1-1V16.5H4.5v-1L6 14v-4l-2-2 4.5-4.5 2 2h3l2-2Z" />
          </svg>
        </n-button>
      </template>
      {{ pinLabel }}
    </n-tooltip>
  </article>
</template>

<script setup lang="ts">
import { NButton, NTooltip } from 'naive-ui';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { LauncherActionEntry } from './entries';

const props = defineProps<{
  entry: LauncherActionEntry;
  pinned: boolean;
}>();

const emit = defineEmits<{
  open: [];
  'toggle-pin': [];
}>();

const { t } = useI18n();

const pinLabel = computed(() => (props.pinned ? t('launcher.item.action.unpin') : t('launcher.item.action.pin')));
</script>

<style scoped lang="less">
.launcher-action-card {
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 14px;
  background: color-mix(in srgb, var(--launcher-item-color) 78%, transparent);
  color: var(--launcher-text-color);
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    transform 0.16s ease;

  &:hover,
  &:focus-within {
    border-color: color-mix(in srgb, var(--launcher-primary-color) 42%, var(--launcher-border-color));
    background: color-mix(in srgb, var(--launcher-primary-color) 12%, var(--launcher-panel-color));
    transform: translateY(-1px);
  }
}

.launcher-action-card__open {
  min-width: 0;
  padding: 12px 8px 12px 12px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;

  &:focus-visible {
    border-radius: 10px;
    outline: 2px solid var(--launcher-primary-color);
    outline-offset: -2px;
  }
}

.launcher-action-card__icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 11px;
  background: color-mix(in srgb, var(--launcher-primary-color) 16%, var(--launcher-panel-color));
  color: var(--launcher-primary-color);
  font-size: 17px;
  font-weight: 700;
}

.launcher-action-card__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
}

.launcher-action-card__title,
.launcher-action-card__description {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.launcher-action-card__title {
  color: var(--launcher-text-color);
  font-size: 14px;
  font-weight: 650;
}

.launcher-action-card__description {
  color: var(--launcher-text-color-3);
  font-size: 12px;
}

.launcher-action-card__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  color: var(--launcher-text-color-3);
  font-size: 11px;
}

.launcher-action-card__badge {
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--launcher-primary-color) 14%, transparent);
  color: var(--launcher-primary-color);
  font-weight: 650;
}

.launcher-action-card__open-label {
  opacity: 0;
  transition: opacity 0.16s ease;
}

.launcher-action-card:hover .launcher-action-card__open-label,
.launcher-action-card:focus-within .launcher-action-card__open-label {
  opacity: 1;
}

.launcher-action-card__pin {
  color: var(--launcher-text-color-3);

  svg {
    width: 15px;
    height: 15px;
    fill: currentColor;
  }

  &:hover,
  &:focus-visible {
    color: var(--launcher-primary-color);
  }
}

.launcher-action-card__pin--active {
  color: var(--launcher-primary-color);
}
</style>
