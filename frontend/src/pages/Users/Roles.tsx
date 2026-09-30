import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import { Plus, Edit, Trash2, Lock, Users as UsersIcon } from "lucide-react";
import Button from "../../components/ui/button/Button";
import Input from "../../components/form/input/InputField";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/usePermissions";
import { errorMessage, readJson } from "../../utils/api";
import { actionLabel, resourceLabel, type PermissionItem } from "../../utils/permissionLabels";

interface Role {
  id: string;
  name: string;
  description: string;
  /** Doimiy rol - nomi o'zgarmaydi */
  isSystem?: boolean;
  permissions: PermissionItem[];
}

const SUPER_ADMIN = "Super admin";
const ADMIN = "Admin";

export default function Roles() {
  const { t } = useTranslation();
  const { token, logout } = useAuth();
  const { isSuperAdmin, canView, canCreate, canUpdate, canDelete } = usePermissions();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [formData, setFormData] = useState<{ name: string; description: string; permissionIds: string[] }>({
    name: "",
    description: "",
    permissionIds: [],
  });

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setLoadError("");
      const headers = { 'Authorization': `Bearer ${token}` };
      const [rolesRes, permsRes] = await Promise.all([
        fetch('/api/roles', { headers }),
        fetch('/api/permissions', { headers }),
      ]);

      if (rolesRes.status === 401 || permsRes.status === 401) return logout();
      if (!rolesRes.ok || !permsRes.ok) throw new Error(t("common.load_error"));

      setRoles(await rolesRes.json());
      setPermissions(await permsRes.json());
    } catch (error: any) {
      setLoadError(error.message || t("common.load_error"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const openModal = (role?: Role) => {
    setFormError("");
    if (role) {
      setEditingRole(role);
      setFormData({
        name: role.name,
        description: role.description || "",
        permissionIds: role.permissions.map((p) => p.id),
      });
    } else {
      setEditingRole(null);
      setFormData({ name: "", description: "", permissionIds: [] });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setFormError(t("roles.name_required"));
      return;
    }
    try {
      setIsSaving(true);
      setFormError("");
      const isEditing = !!editingRole;
      const res = await fetch(isEditing ? `/api/roles/${editingRole.id}` : '/api/roles', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ...formData, name: formData.name.trim() }),
      });
      if (!res.ok) throw new Error(errorMessage(await readJson(res), t("common.save_error")));

      fetchData();
      setIsModalOpen(false);
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (role: Role) => {
    if (!window.confirm(t("roles.delete_confirm", { name: role.name }))) return;
    const res = await fetch(`/api/roles/${role.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      // Masalan: rol foydalanuvchilarga biriktirilgan
      alert(errorMessage(await readJson(res), t("roles.delete_error")));
    }
    fetchData();
  };

  // Bo'limlar bo'yicha guruhlaymiz. Tartib server bergan sortOrder bo'yicha.
  const groupedPermissions = [...permissions]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .reduce((acc, curr) => {
      (acc[curr.resource] ||= []).push(curr);
      return acc;
    }, {} as Record<string, PermissionItem[]>);

  /**
   * Huquqni belgilash/olib tashlash.
   *
   * "Ko'rish" - bo'limning asosiy huquqi: menyu faqat shu belgilangan bo'lsa ko'rinadi.
   * Shuning uchun boshqa huquq belgilansa "Ko'rish" avtomatik qo'shiladi, "Ko'rish"
   * olib tashlansa esa shu bo'limning qolgan huquqlari ham olib tashlanadi.
   */
  const togglePermission = (perm: PermissionItem) => {
    setFormData((prev) => {
      const selected = new Set(prev.permissionIds);
      const sameResource = permissions.filter((x) => x.resource === perm.resource);
      const viewPerm = sameResource.find((x) => x.action === "read");

      if (selected.has(perm.id)) {
        selected.delete(perm.id);
        if (viewPerm && perm.id === viewPerm.id) {
          sameResource.forEach((x) => selected.delete(x.id));
        }
      } else {
        selected.add(perm.id);
        if (viewPerm) selected.add(viewPerm.id);
      }

      return { ...prev, permissionIds: Array.from(selected) };
    });
  };

  /** Bo'limning barcha huquqlarini birdan belgilash / olib tashlash */
  const toggleGroup = (perms: PermissionItem[]) => {
    setFormData((prev) => {
      const selected = new Set(prev.permissionIds);
      const allSelected = perms.every((p) => selected.has(p.id));
      perms.forEach((p) => (allSelected ? selected.delete(p.id) : selected.add(p.id)));
      return { ...prev, permissionIds: Array.from(selected) };
    });
  };

  // Super admin roli yopiq; Admin rolini faqat Super admin o'zgartiradi (server ham shuni tekshiradi)
  const canEditRole = (role: Role) =>
    canUpdate("roles") && role.name !== SUPER_ADMIN && (role.name !== ADMIN || isSuperAdmin);
  const canDeleteRole = (role: Role) =>
    canDelete("roles") && role.name !== SUPER_ADMIN && (role.name !== ADMIN || isSuperAdmin);

  return (
    <>
      <PageMeta title={`${t("roles.title")} | Gulbahor`} description={t("roles.title")} />
      <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-gray-900 w-full">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90 uppercase tracking-wide">
            {t("roles.title")}
          </h2>
          <div className="flex items-center gap-2 sm:gap-3">
            {canView("users") && (
              <Link to="/users">
                <Button variant="outline" className="flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-md shadow-sm border-gray-300">
                  <UsersIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t("sidebar.users_list")}</span>
                </Button>
              </Link>
            )}
            {canCreate("roles") && (
              <Button onClick={() => openModal()} className="flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-md shadow-sm">
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("roles.new")}</span>
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6">
          {isLoading ? (
            <p className="text-sm text-gray-500">{t("common.loading")}</p>
          ) : loadError ? (
            <p className="text-sm text-red-500">{loadError}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {roles.map((role) => (
                <div key={role.id} className="border border-gray-200 dark:border-gray-800 rounded-xl p-5 hover:shadow-md transition-shadow bg-gray-50/50 dark:bg-gray-800/20">
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <h3 className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-white text-lg">
                      {role.name}
                      {/* Doimiy rol - nomi o'zgarmaydi; Super admin huquqlari yopiq */}
                      {role.isSystem && (
                        <span title={role.name === SUPER_ADMIN ? t("roles.locked_role") : t("roles.system_role")} className="text-gray-400">
                          <Lock className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </h3>
                    <div className="flex shrink-0 gap-2">
                      {canEditRole(role) && (
                        <button onClick={() => openModal(role)} className="text-gray-400 hover:text-brand-500" title={t("common.edit")} aria-label={t("common.edit")}>
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                      {canDeleteRole(role) && (
                        <button onClick={() => handleDelete(role)} className="text-gray-400 hover:text-red-500" title={t("common.delete")} aria-label={t("common.delete")}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 mb-4">{role.description || t("roles.no_description")}</p>
                  <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                    {t("roles.permissions_count")}:{" "}
                    <span className="bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-400 px-2 py-0.5 rounded-full">
                      {role.permissions.length} / {permissions.length}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rol oynasi */}
        {isModalOpen && (
          <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-3xl p-5 md:p-6 shadow-xl max-h-[90vh] flex flex-col">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 shrink-0">
                {editingRole ? t("roles.edit") : t("roles.new")}
              </h3>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("roles.name")}</label>
                    <Input type="text" value={formData.name} disabled={!!editingRole?.isSystem} onChange={(e) => setFormData({...formData, name: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("roles.description")}</label>
                    <Input type="text" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} />
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-1 border-b border-gray-200 dark:border-gray-800 pb-2">{t("roles.permissions")}</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t("roles.permissions_hint")}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(groupedPermissions).map(([resource, perms]) => {
                      const selectedCount = perms.filter((p) => formData.permissionIds.includes(p.id)).length;
                      return (
                        <div key={resource} className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                          <div className="font-medium text-sm text-gray-900 dark:text-white mb-3 flex items-center justify-between gap-2">
                            <span>{resourceLabel(t, perms[0])}</span>
                            <button
                              type="button"
                              onClick={() => toggleGroup(perms)}
                              className="text-xs font-normal text-brand-500 hover:underline"
                            >
                              {selectedCount === perms.length ? t("roles.clear_all") : t("roles.select_all")} ({selectedCount}/{perms.length})
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {perms.map((p) => (
                              <label key={p.id} className="flex items-center gap-2 cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={formData.permissionIds.includes(p.id)}
                                  onChange={() => togglePermission(p)}
                                  className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 cursor-pointer dark:bg-gray-700 dark:border-gray-600"
                                />
                                <span className="text-sm text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                                  {actionLabel(t, p)}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {formError && <p className="mt-4 text-sm font-medium text-red-500 shrink-0">{formError}</p>}

              <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-gray-800 shrink-0">
                <Button variant="outline" onClick={() => setIsModalOpen(false)}>{t("common.cancel")}</Button>
                <Button onClick={handleSave} disabled={isSaving}>{isSaving ? t("common.saving") : t("common.save")}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
