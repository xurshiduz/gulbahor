/**
 * PostgreSQL `numeric` ustuni drayverdan satr bo'lib keladi ("12.50").
 * Shu transformer bilan entity da oddiy son sifatida ishlatiladi.
 */
export const numeric = {
  to: (value: number) => value,
  from: (value: string | null) => (value === null || value === undefined ? null : Number(value)),
};

/** Pul summalarini 2 xonagacha yaxlitlaydi (0.1 + 0.2 kabi xatolarsiz) */
export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
