import { useTranslation } from "react-i18next";
import ReferenceCrud, { useReferenceList } from "../../components/reference/ReferenceCrud";
import {
  BLANK_PROMOTION, TiersEditor, categoryOptions, formatMoney, headFields, materialOptions, nameColumn, noteField,
  periodColumn, promotionSearch, promotionToForm, scopeColumn, scopeFields,
  type CategoryRef, type MaterialRef, type Promotion, type Tier,
} from "./shared";

/** Forma uchun tovarlar ro'yxati (kategoriyalar va materiallar) */
function useScopeOptions(lang: string) {
  const categories = useReferenceList<CategoryRef>("/api/product-categories");
  const materials = useReferenceList<MaterialRef>("/api/materials");
  return { categories: categoryOptions(categories, lang), materials: materialOptions(materials) };
}

/** Chegirma aksiyalari: foiz, summa yoki maxsus narx */
export function DiscountPromotions() {
  const { t, i18n } = useTranslation();
  const scope = useScopeOptions(i18n.language);
  const sum = t("currencies.sum");

  return (
    <ReferenceCrud<Promotion>
      resource="promotions"
      endpoint="/api/discount-promotions"
      title={t("modules.discountPromotions.title")}
      wide
      columns={[
        nameColumn(t),
        {
          key: "rule",
          label: t("marketing.discount"),
          className: "whitespace-nowrap font-semibold text-gray-900 dark:text-white",
          render: (row) =>
            row.discountKind === "PERCENT" ? `−${formatMoney(row.value)}%`
              : row.discountKind === "AMOUNT" ? `−${formatMoney(row.value)} ${sum}`
              : `${t("marketing.kind_price")}: ${formatMoney(row.value)} ${sum}`,
        },
        scopeColumn(t, i18n.language),
        periodColumn(t),
      ]}
      fields={({ form }) => [
        ...headFields(t),
        { kind: "section", label: t("marketing.section_rule") },
        {
          name: "discountKind", label: t("marketing.discount_kind"), kind: "select", required: true, half: true,
          options: [
            { value: "PERCENT", label: t("marketing.kind_percent") },
            { value: "AMOUNT", label: t("marketing.kind_amount") },
            { value: "PRICE", label: t("marketing.kind_price") },
          ],
        },
        {
          name: "value", kind: "decimal", required: true, half: true,
          label: form.discountKind === "PERCENT" ? t("marketing.value_percent") : form.discountKind === "PRICE" ? t("marketing.value_price") : t("marketing.value_amount"),
        },
        ...scopeFields(t, form, scope.categories, scope.materials),
        noteField(t),
      ]}
      blank={{ ...BLANK_PROMOTION, discountKind: "PERCENT", value: "" }}
      toForm={(row) => ({ ...promotionToForm(row), discountKind: row.discountKind || "PERCENT", value: String(row.value ?? "") })}
      searchText={promotionSearch}
      rowName={(row) => row.name}
    />
  );
}

/** "N + M" aksiyalari: N ta sotib olinsa M tasi sovg'a (1+1, 2+1) */
export function GiftPromotions() {
  const { t, i18n } = useTranslation();
  const scope = useScopeOptions(i18n.language);

  return (
    <ReferenceCrud<Promotion>
      resource="promotions"
      endpoint="/api/gift-promotions"
      title={t("modules.giftPromotions.title")}
      wide
      columns={[
        nameColumn(t),
        {
          key: "rule",
          label: t("marketing.rule"),
          className: "whitespace-nowrap",
          render: (row) => (
            <span>
              <b className="text-gray-900 dark:text-white">{row.buyQuantity} + {row.giftQuantity}</b>
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                {t("marketing.gift_summary", { buy: row.buyQuantity, gift: row.giftQuantity })}
              </span>
            </span>
          ),
        },
        scopeColumn(t, i18n.language),
        periodColumn(t),
      ]}
      fields={({ form }) => [
        ...headFields(t),
        { kind: "section", label: t("marketing.section_rule") },
        { name: "buyQuantity", label: t("marketing.buy_quantity"), kind: "number", half: true },
        { name: "giftQuantity", label: t("marketing.gift_quantity"), kind: "number", half: true, hint: t("marketing.gift_hint") },
        ...scopeFields(t, form, scope.categories, scope.materials),
        noteField(t),
      ]}
      blank={{ ...BLANK_PROMOTION, buyQuantity: 1, giftQuantity: 1 }}
      toForm={(row) => ({ ...promotionToForm(row), buyQuantity: row.buyQuantity ?? 1, giftQuantity: row.giftQuantity ?? 1 })}
      searchText={promotionSearch}
      rowName={(row) => row.name}
    />
  );
}

/** Karusel aksiyalari: soni oshgani sari chegirma o'sadi (1 = 20%, 2 = 30%, 3 = 40%) */
export function CarouselPromotions() {
  const { t, i18n } = useTranslation();
  const scope = useScopeOptions(i18n.language);

  /** Bosqichlarni tekshiradi; xato bo'lsa matnini qaytaradi */
  const validateTiers = (tiers: Tier[]) => {
    const rows = (tiers || []).map((tier) => ({ quantity: Number(tier.quantity), percent: Number(tier.percent) }));
    if (!rows.length) return t("marketing.tiers_required");
    if (rows.some((tier) => !Number.isInteger(tier.quantity) || tier.quantity < 1 || !(tier.percent > 0) || tier.percent > 100)) {
      return t("marketing.tiers_invalid");
    }
    return null;
  };

  return (
    <ReferenceCrud<Promotion>
      resource="promotions"
      endpoint="/api/carousel-promotions"
      title={t("modules.carouselPromotions.title")}
      wide
      columns={[
        nameColumn(t),
        {
          key: "rule",
          label: t("marketing.tiers"),
          render: (row) => (
            <span className="flex flex-wrap gap-1.5">
              {(row.tiers || []).map((tier) => (
                <span key={tier.quantity} className="whitespace-nowrap rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                  {tier.quantity} = {formatMoney(tier.percent)}%
                </span>
              ))}
            </span>
          ),
        },
        scopeColumn(t, i18n.language),
        periodColumn(t),
      ]}
      fields={({ form }) => [
        ...headFields(t),
        { kind: "section", label: t("marketing.section_rule") },
        {
          name: "tiers", label: t("marketing.tiers"), kind: "custom", hint: t("marketing.tiers_hint"),
          render: (value, onChange) => <TiersEditor value={value} onChange={onChange} t={t} />,
          validate: validateTiers,
          // Serverga son ko'rinishida ketadi
          toPayload: (tiers: Tier[]) => tiers.map((tier) => ({ quantity: Number(tier.quantity), percent: Number(tier.percent) })),
        },
        ...scopeFields(t, form, scope.categories, scope.materials),
        noteField(t),
      ]}
      blank={{ ...BLANK_PROMOTION, tiers: [{ quantity: 1, percent: "" }, { quantity: 2, percent: "" }, { quantity: 3, percent: "" }] }}
      toForm={(row) => ({ ...promotionToForm(row), tiers: row.tiers || [] })}
      searchText={promotionSearch}
      rowName={(row) => row.name}
    />
  );
}

/** Chek aksiyalari: chek summasi belgilangan miqdordan oshsa chegirma */
export function ReceiptPromotions() {
  const { t } = useTranslation();
  const sum = t("currencies.sum");

  return (
    <ReferenceCrud<Promotion>
      resource="promotions"
      endpoint="/api/receipt-promotions"
      title={t("modules.receiptPromotions.title")}
      columns={[
        nameColumn(t),
        { key: "min", label: t("marketing.min_amount"), className: "whitespace-nowrap", render: (row) => `${formatMoney(row.minAmount)} ${sum}` },
        {
          key: "rule",
          label: t("marketing.discount"),
          className: "whitespace-nowrap font-semibold text-gray-900 dark:text-white",
          render: (row) => (row.discountKind === "PERCENT" ? `−${formatMoney(row.value)}%` : `−${formatMoney(row.value)} ${sum}`),
        },
        periodColumn(t),
      ]}
      fields={({ form }) => [
        ...headFields(t),
        { kind: "section", label: t("marketing.section_rule") },
        { name: "minAmount", label: t("marketing.min_amount"), kind: "decimal", required: true, hint: t("marketing.min_amount_hint") },
        {
          name: "discountKind", label: t("marketing.discount_kind"), kind: "select", required: true, half: true,
          options: [
            { value: "PERCENT", label: t("marketing.kind_percent") },
            { value: "AMOUNT", label: t("marketing.kind_amount") },
          ],
        },
        {
          name: "value", kind: "decimal", required: true, half: true,
          label: form.discountKind === "AMOUNT" ? t("marketing.value_amount") : t("marketing.value_percent"),
        },
        noteField(t),
      ]}
      blank={{ name: "", startDate: "", endDate: "", note: "", minAmount: "", discountKind: "PERCENT", value: "" }}
      toForm={(row) => ({
        name: row.name, startDate: row.startDate || "", endDate: row.endDate || "", note: row.note || "",
        minAmount: String(row.minAmount ?? ""), discountKind: row.discountKind || "PERCENT", value: String(row.value ?? ""),
      })}
      searchText={promotionSearch}
      rowName={(row) => row.name}
    />
  );
}
