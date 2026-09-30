import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import Button from "../../components/ui/button/Button";
import { errorMessage, readJson } from "../../utils/api";
import { actionLabel, resourceLabel, type PermissionItem } from "../../utils/permissionLabels";

/**
 * Qo'shimcha huquqlar oynasi: rol huquqlaridan tashqari, shu xodimga alohida
 * beriladigan huquqlar. Rolni o'zgartirmasdan bitta odamga bo'lim ochish uchun.
 * Faqat Admin / Super admin beradi (server ham shuni tekshiradi).
 */
export default function ExtraPermissionsModal({ user, token, onClose, onSaved }: {
  user: { id: string; name: string; extraPermissions: { id: string }[] };
  token: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [perms, setPerms] = useState<PermissionItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(user.extraPermissions.map((p) => p.id)));
  const [q, setQ] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/permissions", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setPerms(Array.isArray(data) ? data : []))
      .catch(() => setError(t("common.load_error")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Bo'limlar bo'yicha guruhlash (Rollar sahifasidagi kabi)
  const groups = useMemo(() => {
    const filter = q.trim().toLowerCase();
    const acc: Record<string, PermissionItem[]> = {};
    for (const p of [...perms].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))) {
      if (filter && !resourceLabel(t, p).toLowerCase().includes(filter) && !actionLabel(t, p).toLowerCase().includes(filter)) continue;
      (acc[p.resource] ||= []).push(p);
    }
    return acc;
  }, [perms, q, t]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const save = async () => {
    setIsSaving(true); setError("");
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ extraPermissionIds: [...selected] }),
      });
      if (!res.ok) throw new Error(errorMessage(await readJson(res), t("common.save_error")));
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t("users.extra_title")}</h3>
            <p className="mt-0.5 text-xs text-gray-500">{t("users.extra_subtitle", { name: user.name })}</p>
          </div>
          <button onClick={onClose} aria-label={t("common.close")} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="border-b border-gray-100 px-5 py-2 dark:border-gray-800">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("users.extra_search")}
            className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          />
        </div>

        <div className="flex-1 overflow-auto px-5 py-3 custom-scrollbar">
          {error && <p className="mb-2 text-xs font-medium text-red-500">{error}</p>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {Object.entries(groups).map(([resource, list]) => (
              <div key={resource} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                <p className="mb-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200">{resourceLabel(t, list[0])}</p>
                <div className="space-y-1">
                  {list.map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p.id)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                      />
                      {actionLabel(t, p)}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-800">
          <span className="text-xs text-gray-500">{t("users.extra_selected", { count: selected.size })}</span>
          <div className="flex gap-2">
            <Button size="xs" variant="outline" onClick={() => setSelected(new Set())}>{t("users.extra_clear")}</Button>
            <Button size="xs" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button size="xs" onClick={save} disabled={isSaving}>{isSaving ? t("common.saving") : t("common.save")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
