/**
 * Chek (80 mm termoprinter) - yashirin iframe orqali chop etiladi:
 * qalqib chiquvchi oyna kerak emas, bloklanmaydi.
 */

export interface ReceiptData {
  shopName: string | null;
  registerName: string;
  branchName: string | null;
  number: string;
  date: string;
  cashier: string | null;
  customer: string | null;
  lines: { name: string; details: string; quantity: number; price: number; discountPercent: number; total: number }[];
  subtotal: number;
  discount: number;
  total: number;
  payments: { label: string; amount: string }[];
  change: number;
  debt: number;
  labels: Record<string, string>;
}

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const fmt = (value: number) => money.format(value || 0);
const escape = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));

export function receiptHtml(data: ReceiptData) {
  const l = data.labels;
  const row = (left: string, right: string, bold = false) =>
    `<div class="row${bold ? " b" : ""}"><span>${left}</span><span>${right}</span></div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(data.number)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { width: 72mm; margin: 0 auto; padding: 4mm 0; font: 12px/1.35 "Courier New", monospace; color: #000; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 2px; }
  .c { text-align: center; }
  .muted { font-size: 11px; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .b { font-weight: bold; }
  .big { font-size: 15px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  .item { margin-bottom: 4px; }
  .item .name { font-weight: bold; }
</style></head><body>
  <h1>${escape(data.shopName || "Gulbahor")}</h1>
  <div class="c muted">${escape([data.branchName, data.registerName].filter(Boolean).join(" · "))}</div>
  <hr>
  ${row(l.receipt, `№ ${escape(data.number)}`, true)}
  ${row(l.date, escape(data.date))}
  ${data.cashier ? row(l.cashier, escape(data.cashier)) : ""}
  ${data.customer ? row(l.customer, escape(data.customer)) : ""}
  <hr>
  ${data.lines.map((line) => `
    <div class="item">
      <div class="name">${escape(line.name)}</div>
      ${line.details ? `<div class="muted">${escape(line.details)}</div>` : ""}
      ${row(`${fmt(line.quantity)} × ${fmt(line.price)}${line.discountPercent ? ` (−${fmt(line.discountPercent)}%)` : ""}`, fmt(line.total))}
    </div>`).join("")}
  <hr>
  ${row(l.subtotal, fmt(data.subtotal))}
  ${data.discount ? row(l.discount, `−${fmt(data.discount)}`) : ""}
  <div class="big">${row(l.total, fmt(data.total), true)}</div>
  <hr>
  ${data.payments.map((payment) => row(escape(payment.label), escape(payment.amount))).join("")}
  ${data.change ? row(l.change, fmt(data.change), true) : ""}
  ${data.debt ? row(l.debt, fmt(data.debt), true) : ""}
  <hr>
  <div class="c">${escape(l.thanks)}</div>
</body></html>`;
}

/** Chekni chop etadi. Iframe chop etish tugagach o'chiriladi */
export function printReceipt(data: ReceiptData) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(receiptHtml(data));
  doc.close();
  const win = frame.contentWindow;
  window.setTimeout(() => {
    win?.focus();
    win?.print();
    window.setTimeout(() => frame.remove(), 1000);
  }, 150);
}
