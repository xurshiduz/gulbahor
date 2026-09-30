import type { TFunction } from "i18next";

export interface PermissionItem {
  id: string;
  name: string;
  action: string;
  resource: string;
  // Serverdan keladigan o'zbekcha nomlar - tarjima topilmasa shular ko'rsatiladi
  resourceLabel?: string | null;
  actionLabel?: string | null;
  sortOrder?: number;
}

type PermissionLike = Pick<PermissionItem, "name"> & Partial<PermissionItem>;

const parts = (p: PermissionLike) => {
  const [action, resource] = String(p.name || "").split(":");
  return { action: p.action || action, resource: p.resource || resource };
};

/**
 * Huquq nomlari tanlangan tilda. Tarjima locales/*.json dagi
 * permissions.resources.<resurs> va permissions.actions.<amal> dan olinadi;
 * yangi bo'lim uchun tarjima hali yozilmagan bo'lsa server bergan nom chiqadi.
 */
export function resourceLabel(t: TFunction, p: PermissionLike): string {
  const { resource } = parts(p);
  return t(`permissions.resources.${resource}`, { defaultValue: p.resourceLabel || resource });
}

export function actionLabel(t: TFunction, p: PermissionLike): string {
  const { action } = parts(p);
  return t(`permissions.actions.${action}`, { defaultValue: p.actionLabel || action });
}
