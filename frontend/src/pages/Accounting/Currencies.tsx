import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import ReferenceCrud, { type RefRow } from "../../components/reference/ReferenceCrud";
import { formatRate } from "./formatRate";

interface Currency extends RefRow {
  name: string;
  symbol: string | null;
  code: string;
  /** Asosiy valyuta (so'm) - kurslar shunga nisbatan */
  isBase: boolean;
  /** Bugungi kunga amaldagi kurs; hali kiritilmagan bo'lsa null */
  currentRate: number | null;
  rateDate: string | null;
}

/** Valyuta turlari: nomi, belgisi, kodi va amaldagi kursi */
export default function Currencies() {
  const { t } = useTranslation();

  return (
    <ReferenceCrud<Currency>
      resource="currencies"
      endpoint="/api/currencies"
      title={t("modules.currencies.title")}
      columns={[
        {
          key: "name",
          label: t("ref.name"),
          className: "font-medium text-gray-900 dark:text-white",
          render: (row) => (
            <span className="flex items-center gap-2">
              {row.name}
              {row.isBase && (
                <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                  {t("currencies.base")}
                </span>
              )}
            </span>
          ),
        },
        { key: "symbol", label: t("currencies.symbol"), render: (row) => row.symbol || "—" },
        { key: "code", label: t("currencies.code"), render: (row) => row.code, className: "font-mono text-xs" },
        {
          key: "rate",
          label: t("currencies.current_rate"),
          className: "whitespace-nowrap",
          render: (row) =>
            row.isBase ? "—" : row.currentRate === null ? (
              <span className="text-amber-600 dark:text-amber-400">{t("currencies.no_rate")}</span>
            ) : (
              <span>
                1 {row.code} = <b>{formatRate(row.currentRate)}</b> {t("currencies.sum")}
                {row.rateDate && <span className="ml-2 text-xs text-gray-400">{dayjs(row.rateDate).format("DD.MM.YYYY")}</span>}
              </span>
            ),
        },
      ]}
      fields={() => [
        { name: "name", label: t("ref.name"), kind: "text", required: true, maxLength: 80, placeholder: "AQSH dollari" },
        { name: "symbol", label: t("currencies.symbol"), kind: "text", maxLength: 10, placeholder: "$", half: true },
        { name: "code", label: t("currencies.code"), kind: "text", required: true, maxLength: 3, placeholder: "USD", hint: t("currencies.code_hint"), half: true },
      ]}
      blank={{ name: "", symbol: "", code: "" }}
      toForm={(row) => ({ name: row.name, symbol: row.symbol || "", code: row.code })}
      searchText={(row) => `${row.name} ${row.code} ${row.symbol || ""}`}
      rowName={(row) => row.name}
    />
  );
}
