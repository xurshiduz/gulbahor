import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import ReferenceCrud, { useReferenceList, type RefRow } from "../../components/reference/ReferenceCrud";
import { formatRate } from "./formatRate";

interface Currency { id: string; name: string; code: string; symbol: string | null; isBase: boolean; isActive?: boolean }

interface CurrencyRate extends RefRow {
  currencyId: string;
  currency: Currency | null;
  /** Kurs kuchga kirgan sana: YYYY-MM-DD */
  date: string;
  /** 1 valyuta = rate so'm */
  rate: number;
}

/** Valyuta kursi: shu sanadan boshlab 1 valyuta necha so'm */
export default function CurrencyRates() {
  const { t } = useTranslation();
  const currencies = useReferenceList<Currency>("/api/currencies");
  // So'mning o'ziga kurs kiritilmaydi
  const options = currencies
    .filter((c) => !c.isBase)
    .map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }));

  return (
    <ReferenceCrud<CurrencyRate>
      resource="currency-rates"
      endpoint="/api/currency-rates"
      title={t("modules.currencyRates.title")}
      noStatus
      columns={[
        { key: "date", label: t("rates.date"), render: (row) => dayjs(row.date).format("DD.MM.YYYY"), className: "whitespace-nowrap" },
        {
          key: "currency",
          label: t("rates.currency"),
          render: (row) => (
            <span>
              <span className="font-mono text-xs font-semibold text-gray-900 dark:text-white">{row.currency?.code}</span>
              <span className="ml-2 text-gray-500 dark:text-gray-400">{row.currency?.name}</span>
            </span>
          ),
        },
        {
          key: "rate",
          label: t("rates.rate"),
          className: "whitespace-nowrap",
          render: (row) => (
            <span>
              1 {row.currency?.code} = <b className="text-gray-900 dark:text-white">{formatRate(row.rate)}</b> {t("currencies.sum")}
            </span>
          ),
        },
      ]}
      fields={() => [
        { name: "currencyId", label: t("rates.currency"), kind: "select", required: true, options },
        { name: "date", label: t("rates.date"), kind: "date", required: true, half: true },
        { name: "rate", label: t("rates.rate"), kind: "decimal", required: true, placeholder: "12650", hint: t("rates.rate_hint"), half: true },
      ]}
      blank={{ currencyId: "", date: dayjs().format("YYYY-MM-DD"), rate: "" }}
      toForm={(row) => ({ currencyId: row.currencyId, date: row.date, rate: String(row.rate) })}
      searchText={(row) => `${row.currency?.code || ""} ${row.currency?.name || ""} ${dayjs(row.date).format("DD.MM.YYYY")}`}
      rowName={(row) => `${row.currency?.code || ""} ${dayjs(row.date).format("DD.MM.YYYY")}`}
      filter={{
        allLabel: t("rates.all_currencies"),
        options,
        match: (row, value) => row.currencyId === value,
      }}
    />
  );
}
