# Final spec: technical notes (branch cloud/exchange-partners)

> **Read section 3 first.** Sections 1–2 were written before V9 (2026-10-06). Section 3 (2026-10-10) lists what changes in them now that every currency is equal, customers keep a balance per currency, and phase 1 (pricing, M1) is put off.

## 0. Order, numbering, gates
- Two migrations:
  - `1790000035000-price-formulas.ts` (phase 1) runs first. It still updates `partners.price_type_id`, because that table still exists at that point.
  - `1790000036000-one-customer-book.ts` (phase 2) runs second. It normalises retail-kind price types again while moving partners.
- Each must be registered in `migrations/index.ts`.
- Phase 1 ships on its own. Phases 2 and 3 ship together, because the migration cannot ship without the UI. Phase 4 ships incrementally.
- Every phase ends with `npm run typecheck`, `npm run lint`, `npm test` and `python tools/check_i18n.py`, and is logged with `tools/progress.py`.
- After a core change, run `npm run build:core` before the server tests.

## 1. Pricing (phase 1)

### Core (`packages/core/src/pricing.ts`, `money.ts`)

**Formula types**
- `PRICE_BASES = ['cost','retail','fixed']`.
- `PriceFormula { base, percent, amount }`:
  - `percent` uses the existing `percentSchema` (−99..10000, 2 decimals);
  - `amount` is minor units in the price type's currency, signed for cost/retail.
- `priceFormulaSchema` refine: `fixed` ⇒ `amount > 0 && percent === 0`.
- `Markup = PriceFormula & { priceTypeId }`. `pickMarkup` is unchanged.

**`priceBy(f, basis {cost, retail}, rounding)`**
- `fixed` → `amount`, not rounded.
- `cost` / `retail` → `roundPrice(withPercent(x, p) + amount, rounding, 'up')`.
- Returns null when the basis is null or the result is ≤ 0.

**Rounding**
- `roundPrice` gains `mode: 'nearest' | 'up'` (default `'nearest'`, so existing callers are unchanged).
- `'up'` returns the smallest allowed price (step plus ending) that is ≥ amount.
- Tests: a cost just above a step, an ending (50 000 → 59 000 with step 10 000 / ending 9 000), and step 0.

**`parsePriceEntry(text)`** returns `{ ok, entry: LinePrice | null }`, where `LinePrice = {amount} | {formula}`:

| Input | Result |
|---|---|
| `''` | null |
| `'30%'` | cost, 30 |
| `'+50 000'` / `'+50k'` | cost + sum |
| `'30% + 5000'` | cost, 30, 5000 |
| `'ch −15%'`, `'ch+5%'` (also Cyrillic `'ч'`) | retail base |
| a negative cost percent | error `below_cost` (the UI hint suggests the `ch` syntax) |
| anything else | `parseAmount` → `{amount}` |

**Other exports**
- `formulaText(f, currency, short?)`.
- `blockPrices({types, own, receipt, rules, current, cost})` → `Record<typeId, BlockPrice {amount, formula, source, applies}>`.
  - Precedence: own entry → receipt strip (null means opt out) → scoped rule → scopeless rule (the type default).
  - `applies = own entry || (no current price && amount !== null && receipt[type] !== null)`.
  - Retail basis for other types: the applied retail, else the current retail, else the suggested retail. Only when the currency is the same as the retail type's.
- `blockKey(line)` moves to core from `web/src/features/receipts/receipt-state.ts`.

### DB (migration 35000, with `app.bypass_rls` on/off)

**`price_rule_markups`**
- Drop `price_rule_markups_base_check` and re-add it with `'fixed'`.
- Add `amount bigint NOT NULL DEFAULT 0`.
- Add CHECK `base <> 'fixed' OR (amount > 0 AND percent = 0)`.
- `percent_check` stays as it is.

**Receipts**
- `receipts.price_formulas jsonb NOT NULL DEFAULT '{}'` (`typeId` → formula | null).
- `receipt_lines.prices jsonb NOT NULL DEFAULT '{}'` and `applied_prices jsonb`.
- Move the old `retail_price` / `wholesale_price` / `other_prices` into `prices`, using today's `priceFields` semantics: the first retail and first active wholesale type by `sort_order`, then name. Then drop the three columns.

**Price revisions**
- `price_revisions.receipt_id uuid REFERENCES receipts ON DELETE SET NULL`, plus a partial index.

**Currency stragglers** (a `prices` row whose currency ≠ its type's currency)
- Convert at the org's latest `exchange_rates`.
- Write one `price_revisions` row per org, summary "Valyuta tuzatildi", with lines (number from that org's revision counter).
- Orgs with no rate: leave the rows. The service then reads them as missing.

**Retail-kind normalisation**
- `UPDATE partners/customer_groups SET price_type_id = NULL WHERE type.kind = 'retail'`.

**`down()`**
- Rebuilds the three columns from `prices` and drops the new columns.

### Server

**`modules/pricing/pricing.service.ts`**
- `formulasIn(em, productIds)` returns `{ formula, scoped }` per type.
- `recordIn(em, actor, changes, { receiptId?, summary })` writes one revision covering many types: `price_type_id` is null when there are several, and `price_type_name` is joined.
- `revert` is generalised to multi-type.
- `REPRICE_KINDS = percent | amount | formula | from_type`. `formula: PriceFormula | null`, where null means "by rules"; it goes through `priceBy` and is not rounded a second time.
- `describe`, `percentText` and the audit text use `formulaText`.
- `prices()` treats a currency-mismatched row as `no_price`.
- The list filter gains `missing?: typeId`.
- Rule validation: a fixed rule is valid; a retail base is refused on the retail type and needs the same currency as retail.

**Other pricing endpoints**
- `POST /pricing/formulas` replaces `/pricing/markups`.

**`catalog/price-types.service.ts`**
- "Qanday hisoblanadi" upserts or deletes the type's markup in the scopeless rule (`price_rules_scope`). A rule left empty is deleted. `fixed` is refused there.
- `CURRENCY_LOCKED` when any `prices` row exists, or any markup with `amount ≠ 0`.
- An endpoint to count the customers and groups using a type (for the archive warning).

**`products.service`**
- Always writes `type.currency`.

**`modules/receipts/prices.ts`: `receiptPrices(em, receipt, lines, costing, mayPrice)`**
- Groups lines by `blockKey`.
- Unit cost per group is Σ`costUzs`/Σqty and Σ`costUsd`/Σqty, taken from the posting `costReceipt`.
- Without `products.prices` or `receipts.prices`:
  - own entries and strip formulas are ignored;
  - strip nulls (opt-outs) are **always** honoured;
  - rules and defaults apply only to unpriced models.
- Today's majority logic is kept.
- Writes through `recordIn` with `receiptId`.
- `applied_prices = { typeId: { amount, formula, source } }`.

**`receipts.service`**
- Validation: keys must be active types; formulas are checked.
- `applyPrices` is replaced by `receiptPrices`.
- `updateExpenses` returns `repriceable`.
- New `POST /receipts/:id/reprice { dryRun }`. It only touches formula-made applied prices whose current model price still equals the applied amount, and returns `NOTHING_TO_CHANGE` otherwise.
- `copy()` copies `prices` and `price_formulas`.

**Other receipt code**
- `receipt-import.service`: the Chakana and Ulgurji columns map into `prices`.
- `labels.service describe`: on a draft receipt, the retail price shown is the applied retail from `receiptPrices`.

**Till (`modules/pos/items.ts`)**
- When `priceTypeId` is set and `SPECIAL IS NULL`, work out that type's formula for the item:
  - retail basis: the item's retail, in the type currency;
  - cost basis: the same cost as reprice uses (average on hand, else last batch, from `unitCosts` semantics).
- The same function is used by `sellables` in `/pos/items`, `/pos/search`, `/pos/lookup` and the sale, so `PRICE_CHANGED` cannot fire spuriously.
- `PosItemDto.priceFrom: 'type' | 'formula' | 'retail'`.
- New column `sale_lines.price_from text NULL CHECK IN ('formula','retail')`, used for reprint.

**Permissions (`access.ts`)**
- New `receipts.prices` ("Kirimda narx qo‘yish") in the receipts group.
- Roles holding the literal `receipts.*` (warehouse, manager) get it through the wildcard. That is intended.

### Web
- `receipt-page.tsx`: the strip popover, `BlockCard` fields, warnings, the post confirm (`useConfirm`), the posting summary, and the expense banner.
- New `features/receipts/price-entry-input.tsx`, built on `MoneyInput` text handling.
- `receipt-state.ts`: `Block.prices: Record<typeId, LinePrice|null>`; `blocksOf`/`newBlock` use the core `blockKey`; `costOf` works by identity.
- `ReceiptProductDto.prices` carries the current model prices.
- `markup-rules-tab.tsx` is renamed "Narx qoidalari", with method + % + sum per type.
- `reprice-dialog.tsx` gets the formula kind.
- `prices-page.tsx` gets the missing filter.
- `price-types-tab.tsx` gets "Qanday hisoblanadi", plus a "fill now" offer after creating a type, which opens reprice with the `missing` filter.
- `product-page.tsx` drops `onCurrencyChange`.
- POS line and `receipt-paper` show the "Chakana narxida" mark.
- i18n uz/ru: user text uses ‘ and ’.

### Tests
- **Core** `pricing.test.ts`: `priceBy` (each base, up rounding, fixed, negative %, null basis), `parsePriceEntry` (every row above plus garbage), `formulaText`, `blockPrices` (precedence, null opt-out, applies vs stays, retail basis order, currency mismatch), `blockKey`.
- **Server** `receipt-prices.spec` (rewrite):
  - landed cost with expenses;
  - the strip fills only unpriced models, and "apply to them too" covers priced ones;
  - opt-out;
  - default and scoped rule;
  - USD type with USD cost;
  - one revision, which can be reverted;
  - a poster without the right gets defaults only, and opt-outs are honoured;
  - a draft label shows the price posting will set;
  - expense change → reprice dry/apply;
  - invalid keys are refused.
- **Server** `pricing.spec`: rules with a sum and fixed rules, formula reprice, the missing filter, multi-type revert.
- **Server, other specs**:
  - `catalog.spec`: currency lock, type default;
  - `till-prices.spec`: `priceFrom` formula/retail, and that the sale matches `/pos/items`;
  - `receiving` and `import`: the new input.
- **Web**: `receipt-state.test`, and a new `price-entry-input` test.

## 2. One customer book (phases 2–4)

### DB (migration 36000)

**Guards** (throw an Uzbek error if any holds)
- `customer_debts` has rows.
- `debt_payments` has rows.
- The `receivables` system account balance ≠ 0.

**`customers`**
- `phone` drops NOT NULL. Replace `customers_org_phone` with a partial UNIQUE `(org_id, phone) WHERE phone IS NOT NULL`.
- Add:

| Column | Type and rule |
|---|---|
| `currency` | text NOT NULL, `CHECK ~ '^[A-Z]{3}$'`; filled from `organizations.base_currency` |
| `price_type_id` | FK `price_types` SET NULL |
| `is_supplier` | bool NOT NULL DEFAULT false |
| `credit_mode` | text NOT NULL DEFAULT `'default'`, CHECK IN (`default`, `none`, `limit`, `unlimited`) |
| `credit_limit` | bigint NULL; CHECK `(credit_mode = 'limit') = (credit_limit IS NOT NULL AND credit_limit > 0)` |
| `credit_days` | int NULL, CHECK 1..3650 |
| `no_due` | bool NOT NULL DEFAULT false; CHECK `NOT (no_due AND credit_days IS NOT NULL)` |
| `return_days` | int NULL, CHECK 0..3650 |
| `merged_into` | uuid NULL, FK to `customers` |

**Phone resolution** (before moving partners)
- Among partners sharing `(org_id, phone)`, the keeper is the one whose account has ledger lines, else the oldest by `created_at`.
- The others get `phone` = NULL and `note` gains `'Tel: ' || phone`, with an audit row.
- `moved(partner_id, customer_id, merged)`: a keeper whose phone equals a customer's phone merges into that customer row.
  - The customer row takes the partner's `currency`, `price_type_id` (null if retail kind) and `is_supplier`.
  - The partner's name goes into the note if it differs.
  - Audit row `customer.merge`.
  - This is safe because customers have no ledger accounts today.
- Unmerged partners are inserted with the **same id**.
  - `search_key` is recomputed in JS with the service's `keyOf`, which must accept a null phone.
  - `is_buyer` is dropped.
  - `credit_mode = 'default'`. With `debtLimit` 0, that means a word is needed, which is the same as today's `pos.partner_sale`.

**Re-pointing**
- Drop the FKs to `partners`, update the values through `moved` (only merged rows change), and re-add the FKs to `customers` for `receipts.supplier_id`, `receipt_lines.supplier_id`, `accounts.partner_id` and `partner_payments.partner_id`.

**`accounts`**
- `partner_id` → `customer_id`.
- `UPDATE kind 'partner'` → `'customer'`, and replace `accounts_kind_check`.
- `accounts_partner` → `accounts_customer`, CHECK `(kind = 'customer') = (customer_id IS NOT NULL)`.
- `accounts_of_partner` → `accounts_of_customer`.

**Payments**
- Rename `partner_payments` → `customer_payments` and `partner_payment_lines` → `customer_payment_lines`. Policies and indexes follow; rename the indexes.
- `partner_id` → `customer_id`.
- `kind` CHECK adds `'adjust'`.
- Add `category_id uuid NULL FK money_categories` (required iff `kind = 'adjust'`) and `forgive bigint NOT NULL DEFAULT 0`.
- Ledger codes: `UPDATE ledger_entries SET kind/document_type` from `'partner_payment'` / `'partner_payment_cancel'` to `customer_payment*`.
- **Keep the counter key `'partner_payment'`.** Renaming it restarts TL numbering and collides with `UNIQUE (org_id, number)`.

**New `customer_dues`**
- Columns: `id`, `org_id`, `customer_id` (FK RESTRICT), `sale_id` (FK sales, UNIQUE NULL), `payment_id` (FK `customer_payments`, UNIQUE NULL), `due_date date NULL` (null means muddatsiz), `changed_by`, `changed_by_name`, `changed_at`, `created_at`.
- CHECK `num_nonnulls(sale_id, payment_id) = 1`.
- `tenantPolicy`; index on `(customer_id)`.
- Due dates live here, not on the immutable `sale_payments` row, so they can be extended.

**`sales`**
- `customer_id = moved.customer_id`, `customer_name = partner_name` where `partner_id` is set.
- Drop `sales_customer_or_partner`, `sales_partner`, `partner_id`, `partner_name`.
- Add `account_after bigint NULL`, `account_currency text NULL` (balance snapshot for reprint).

**`sale_payments`**
- `'partner'` → `'account'`. `'debt'` cannot exist (guard). Replace the method CHECK with `cash, card, terminal, exchange, account`.
- Add `prepaid bigint NOT NULL DEFAULT 0`, CHECK `0 <= prepaid <= amount`: the part covered by haqi at posting, in account currency.
- Insert `customer_dues(due_date NULL)` for every existing account sale that is not voided.

**`sale_return_payments`**
- `'partner'` → `'account'`; method CHECK `cash, card, terminal, account`.
- Add `charge_sale_id uuid NULL FK sales`: the origin sale whose account part this return reduces.
- Add `from_account bool NOT NULL DEFAULT false`: cash paid out of haqi created by this return.

**Drops**
- `debt_payment_parts`, `debt_payment_lines`, `debt_payments`, `customer_debts`, then `partners`.

**Roles** (bypass on/off, the `1790000034000` pattern; run over all roles, not only `template_key`)
1. A literal `customers.*` held without `partners.*` is replaced by view, manage, debts, receive. This must run before the new keys enter the group, or holders silently gain pay_out, suppliers and adjust.
2. `customers.debts` → + `customers.receive`.
3. `partners.view` → `customers.view`.
4. `partners.manage` → `customers.manage`.
5. `partners.debts` → `customers.debts` + `customers.suppliers`.
6. `partners.pay` → `customers.receive` + `customers.pay_out`.
7. `partners.adjust` → `customers.adjust`.
8. `partners.*` → `customers.*`.
9. `pos.partner_sale` → `pos.debt`.
10. Template changes:
    - warehouse loses `partners.view`;
    - `partners_manager` keeps its key, is named "Ulgurji menejer" and holds `customers.*`.

**`down()`**
- Refuses if any `account` sale payment, `customer_payments` row, `customer_dues` row, or `kind = 'customer'` account with ledger lines exists.
- Otherwise rebuilds `partners` from the `is_supplier` customers (same ids; duplicate names get a " (2)" suffix) and restores the old constraints and the empty debt tables.

### Core
**`customers.ts`**
- Input schema:
  - `name` required;
  - `phone` uses `optionalPhoneSchema`; a non-+998 number is moved into the note by the client and by the server;
  - `currency?`, `priceTypeId?`, `isSupplier?`;
  - `credit {mode, limit?}`, `due {days?|none}`, `returnDays?`.
- `CustomerDto` adds currency, priceType, isSupplier, credit settings, and `standing | null`.
- `PosCustomerDto`:
  - `phone` becomes nullable;
  - `priceType` plus `priceFrom: 'own' | 'group'`;
  - `supplier: boolean`;
  - `standing: { currency, owed, credit, overdue, overdueSince, nextDue, nextDueAmount, lendable } | null`. It is null for a supplier when the cashier lacks `customers.suppliers`.
- `CustomerBriefDto` has: id, name, currency, isSupplier, isActive, masked phone (last 4), tags, the first 40 characters of the note, and the last receipt date.

**`debts.ts`**
- `ageBalance(events, today)` is a pure function. The events, in posting order, are:
  - `charge {id, amount, due: date|null}`: a sale account part or a dated opening;
  - `debit {amount}`: any other debit;
  - `credit {amount, target?: chargeId}`.
- Cancelled documents and their reversal entries, and voided sales, are removed before the call.
- State:
  - a pool (haqi);
  - open items ranked as dated charges by due date, then muddatsiz charges, then plain debits.
- How each event is applied:
  - A charge or debit first consumes the pool. The rest becomes an open item.
  - A targeted credit first reduces its own charge. The rest is a general credit.
  - A general credit pays open items by rank, earliest due first. The rest goes to the pool.
- Output: `owed = Σopen`, `credit = pool`, `overdue = Σ` dated open items with due < today, `overdueSince`, and `nextDue`.
- Invariant: `owed − credit == account balance`.
- `debtBar({ barred, noPhone, overdue, overLimit, supplier }, adds)` returns one of `'barred' | 'no_phone' | 'overdue' | 'over_limit' | 'supplier' | null`.
  - `adds = max(0, B + amount) − max(0, B)`.
  - `supplier` applies even when `adds` is 0.
- `limitOf(mode, own, orgLimit)`: `none` → barred; `unlimited` → ∞; `limit` → own (in account currency); `default` → `orgLimit` in base, where 0 means no word-free credit.
- `spreadOverDebts` and the debt payment schemas and DTOs are removed.

**`settlements.ts`**
- `Partner*` → `Customer*`. Kinds are in, out, opening, adjust.

**`pos.ts`**
- `TenderMethod` adds `'account'`.
- `saleInputSchema`: drops `partnerId` and `debt`. `onAccount {amount, settled?, dueDate?: string|null}` requires `customerId`.
- `exchangeInputSchema` adds `customerId`, `onAccount` and the theirs price type.
- `returnInputSchema` adds `payout?: { amount }`.
- `ShiftTotals` (Z-report):
  - `customersIn` and `customersOut` per currency and place;
  - account sale and prepaid amounts;
  - account refunds and payouts.
- Approvers: `debts` is kept; `partners` is dropped; `advances` is added (holders of `customers.receive` or `customers.pay_out`).
- `maySellToPartners` and `PosPartnerDto` are dropped.

**`purchasing.ts`**
- The partner schemas and DTO are removed.

**`access.ts`**
- The customers group becomes view, manage, debts, suppliers, receive, pay_out, adjust.
- `pos.partner_sale` is removed.
- `receipts.prices` is added (phase 1).

### Server
**`modules/customers/customers.service.ts`** absorbs `partners.service`:
- `assertCurrency` via `CurrenciesService.kept`, and the currency lock after the first ledger line.
- Price validation: a retail kind is normalised to null; min is refused.
- `brief`, `quick`, the supplier mark, and the archive guard `CUSTOMER_HAS_BALANCE`.
- Phase 4: `merge` and `reassignSale`.
- `keyOf` must handle a null phone.
- `/customers/brief` is open to `customers.view`, `receipts.view` and `supplier_returns.view`.

**`customers/standing.ts`**
- `standingsOf(em, customerIds)` loads the account `ledger_lines` with `document_type`/`kind`, the `customer_dues` rows and the return targets, and calls `ageBalance`.
- Lists compute it only for accounts with balance > 0, in batches.

**`customers/groups.ts` `rulesOf`**
- Price: the customer's own type (if `is_active`), then the first group's type (if `is_active`), then retail.
- Loyalty sums only `price_type_id IS NULL` sales (also `customers.service` purchases).
- Adds the standing.

**`customers/payments.service.ts`** (moved from partners)
- `in` has no cap; an archived mijoz is allowed.
- Places:
  - for `pos.sell`: this register's drawers, plus base-currency `card` and `terminal` accounts that `servesShop`, with an open shift;
  - for `customers.receive` / `pay_out`: the `mayUse` places, as today.
- `out`:
  - from a drawer, at most `max(0, −B)` (`ADVANCE_EXCEEDED`);
  - a `receive`-only holder may pay out to non-suppliers from a till drawer only;
  - a till PIN path through `approval {userId, pin}` + `registerId` → `ApprovalsService.verify`.
- `adjust` posts against the category's system account (expenses, `other_income`, or `owner` when `in_profit = false`).
- `opening` with `dueDate` inserts a `customer_dues` row.
- `forgive ≤ changeRoundStep` goes to `rounding`.

**Locking**
- Every posting to a customer account first runs `SELECT 1 FROM customers WHERE id = ANY($1) ORDER BY id FOR UPDATE`, then locks the accounts as today. Postings covered:
  - sale on account, return, void;
  - every TL kind;
  - receipt post and cancel (`owe`);
  - supplier return post and cancel (`creditIn`);
  - merge and reassign.

**`ledger.service`**
- `partnerAccount` → `customerAccount` (lazy; the account name follows the customer's).
- Phase 4: `sweepMerged`. After any post or reverse that touches an account whose customer has `merged_into`, post a `customer_merge` entry that moves the balance to the survivor, converted with `valueLine` (fx difference included) when the currencies differ. **Never UPDATE `ledger_lines`**: the balance trigger fires AFTER INSERT only.

**Sales (`pos/sales.service.ts`)**
- One account block replaces the debt block (371-408) and the onAccount block (409-451).
- Valued with `settleLine(amount, book.base, customer.currency, book, settled)`.
- `prepaid = min(amount, max(0, −B))`.
- Bars come from `debtBar`, with the errors `NO_DEBT`, `NO_PHONE`, `DEBT_OVERDUE`, `DEBT_OVER_LIMIT` and `SUPPLIER_ON_ACCOUNT`. A sale passes with `pos.debt` or an approver with `debts`.
- The due row is inserted with `dueDate` defaulting to today + (`credit_days` ?? `debtDays`), or null when `no_due`. The cashier may set a date but not null unless `no_due`.
- Writes the `account_after` snapshot.
- Void: drop `SALE_DEBT_PAID`. The due row stays, and standing ignores the voided sale.

**Returns (`returns.service.ts`)**
- `partnerPart` keys on method `'account'`. For goods paid by exchange it follows `exchangeSaleId` to the origin sale and writes `charge_sale_id`.
- Cash cap becomes `total − notCash − cashBack`; the `debt.paid` term goes.
- `payout ≤ min(offAccount, max(0, −B_after))`, only for a base-currency account and only as so'm cash from this drawer. `pos.return` is enough.
- Ledger lines inside the return entry: account `+payout`, drawer `−payout`; a `sale_return_payments` row (cash, `from_account`).
- Return days come from `customer.return_days ?? org`.

**Exchange**
- Passes `customerId`, `onAccount` and the theirs price to `SalesService.createIn`.

**Shift totals and reports**
- `shifts.service`: totals are grouped by method and currency, not by account name.
- TL terminal lines are added to the `shift_terminal_counts` expected sum.
- `reports.service`: method `'account'`.

**Receipts, import and supplier returns**
- `receipts.service`: `owe` and `creditIn` go through `customerAccount`.
- `is_supplier` is set on post (`UPDATE … WHERE id = ANY AND NOT is_supplier`) and on quick-create.
- The supplier check (761-780) no longer requires `is_supplier`.
- `receipt-import.service`:
  - matches by `lower(name)` among `is_supplier` only, using a query instead of `find(Partner)`;
  - two suppliers with the same name are an error;
  - a non-supplier with the same name gets a preview note.
- `stockdocs.service` `credited` uses kind `'customer'`. `StockDocDto.credited` is gated by `customers.suppliers`.

**Money and currencies**
- `money.service.ts:361,397`: the kind exclusions use `'customer'`.
- `money.service.ts:438`: the name uniqueness check must exclude `'customer'`, or retail names block card and safe names.
- `currencies.service` `CURRENCY_HELD` uses kind `'customer'`.

**POS endpoints**
- `pos.service` and `pos.controller`:
  - `GET /pos/customers?q=` (null phone allowed);
  - `GET /pos/customers/:id` (`knowAgain` refreshes by id);
  - `POST /pos/customers` (name required);
  - `/pos/partners` is removed;
  - the context drops `maySellToPartners`;
  - approvers gain `advances`.

**Realtime, audit, deletions**
- Realtime keys: `customers` and `customer-payments` replace `partners`, `partner-payments` and `customer-debts`. Also `money`, `pos`, `shifts`, `receipts` and `stockdocs` as today.
- Audit entities: `customer` and `customer_payment`. The old `partner`, `partner_payment` and `debt.pay` rows keep their labels on the audit page.
- Delete `modules/partners/`, `customers/debts.service.ts`, `debts.controller.ts` and `debts.ts`.

**Phase 4 endpoints**
- `POST /customers/:id/merge { intoId, settled? }`.
- `POST /sales/:id/customer { customerId }`: same currency only, no returns yet; posts a `sale_reassign` entry and re-points `sale_payments.account_id`, `customer_dues` and `sales.customer_*`.
- `PATCH /customer-dues/:id { dueDate }`: `customers.debts` / `customers.suppliers` or `pos.debt`; audited.
- Statement `?from&to`, with an opening balance, goods counts and Excel export.
- Opening-balance Excel import, with a `dryRun` that rolls the transaction back.

### Web
**`features/customers`**
- Page tabs: list, groups, loyalty, debtors, payments.
- The form with the Hisob-kitob block and the duplicate-name hint.
- Statement and debtors views.
- `payments.tsx` (moved from partners) holds `PaymentDialog`, `OpeningDialog` and the adjust dialog.
- `payment-lines.tsx` moves to `features/money/`.

**`features/pos`**
- `customer-picker.tsx`: one list.
- `pos-state.ts`: `cart.partner` is dropped.
- `pos-page.tsx`:
  - `serve` handles own and group price;
  - `servePartner` and `offPartner` are removed;
  - `knowAgain` works by id;
  - adds the advance-refund approval.
- `tender-panel.tsx`: one "Qarzga / Hisobidan" block in place of `lend` and `onAccount`, built on `data-enter-skip` and `ReceivedField`.
- `receipt-paper.tsx` and `receipt-preview.tsx`: balance line (only if visible), signature line, "Chakana narxida".
- `sale-dialog.tsx`, `shift-parts.tsx`: the new Z-report rows.

**Elsewhere**
- Receipt and supplier-return pickers use `/customers/brief?supplier=1`.
- `receipt-page` gets a "To‘lov berish" button on posted receipts.
- `app/router.tsx`: `/partners` and `/payments` redirect.
- `navigation.ts` drops the partners section.
- `shell.tsx`: Ctrl+K is gated by `customers.receive` or `pos.sell` (till places only); Alt+C by `customers.pay_out` or `customers.receive`.
- Also `command-palette.tsx`, the audit page, and i18n uz/ru.

### Tests
**Core**
- `ageBalance`:
  - the Aziz example;
  - advance then sale;
  - a refund of an advance followed by a sale;
  - a supplier prepayment, a supplier return, and a receipt cancel after barter: never overdue;
  - a cancelled payment-in brings the overdue back;
  - a return applied to its own charge;
  - an exchange-chain target;
  - muddatsiz;
  - the invariant `owed − credit = B`.
- `debtBar` and `limitOf`.
- The customers schema (phone).

**Server**
- New `customer-account.spec`:
  - every bar, including `NO_PHONE`;
  - credit modes, and the org limit 0;
  - supplier needs a word;
  - spending an advance and the `prepaid` split;
  - due default, `no_due` and extension;
  - overdue;
  - two concurrent sales against the limit.
- `customer-payments.spec`:
  - "in" beyond what is owed;
  - till terminal plus shift reconciliation;
  - drawer out ≤ advance, PIN path;
  - adjust, forgive, archived mijoz.
- Rewritten: `customers`, `returns` (account first, payout, chain, cash cap), `receiving`, `supplier-returns`, `till-controls`, `till-prices`, `import`, `agreed-sums`, `money-currencies`, `promotions`, `main-till`.
- Removed: `customer-debts`, `partner-payments`, `partner-sales`.
- Global invariant: for every customer account, `ageBalance` agrees with `accounts.balance`.

**Web**
- `customer-picker`, `on-account` (from `partner-sale`), `tender-panel`, `pos-state`, `sidebar`, `payment-lines` (moved).

### Deploy checklist (owner DB, bypass RLS)
1. Guards:
   ```sql
   SELECT count(*) FROM customer_debts;
   SELECT count(*) FROM debt_payments;
   SELECT balance FROM accounts WHERE kind = 'system' AND code = 'receivables';
   ```
   Check the real system-account column name first.
2. Partner phone duplicates:
   ```sql
   SELECT org_id, phone, count(*) FROM partners WHERE phone IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1;
   ```
3. Partners sharing a phone with a customer, and partners sharing a name with a customer (informational, for the owner's merge list).
4. Currency-mismatched prices (`exchange_rates` is gone since V9; rates are `currency_rates`).
5. `pg_dump`. Then run `up`, then `down`, on a copy.

### Pitfalls
- Keep the counter key `partner_payment`.
- Expand the literal `customers.*` before adding new keys to the group.
- The `receipts.*` wildcard grants `receipts.prices` to the warehouse role.
- The Z-report must not group account rows by account name.
- `sale_payments` stay immutable; due dates live in `customer_dues`.
- Store the retail kind as null everywhere (customers, groups).
- The `mixed` location route for warehouse wholesale needs a check of the gate, stock pages and transfers before it is recommended. This is open question 3.

## 3. After V9 (2026-10-10): what changes in section 2

The owner's decisions are in `KEYINGI-REJA.md`, 8th part, "Narx, mijoz hisobi va hisobot valyutasi" (9–13), and 16.10. The owner put M1 (pricing) off and asked for M2 (one customer book) next.

**Order and numbering**
- M2 (book and ledger) and M3 (screens) ship together; M4 follows in pieces. M1 is not a prerequisite. Decision 10's "formula or Chakana narxida" fallback waits for M1. Until then, a price type with no price for a product falls back to retail, as it does today.
- Two migrations: `1790000044000-customer-card.ts` (M2-1) and `1790000045000-one-customer-book.ts` (M2-2). The numbers 35000 and 36000 were taken by other work. It must not assume `price-formulas` ran. Retail-kind price types are still normalised to null here.

**A balance per currency**
- A customer has one account per currency: `accounts.kind = 'customer'`, `customer_id`, and `currency`, with UNIQUE `(customer_id, currency)`. Each account opens on its first posting: `LedgerService.customerAccount(em, customer, currency)`. A partner's existing account moves as it is, in its currency.
- `customers.currency` is the customer's **main** currency. It is the default in every window and document, set to the base by default. It is a default only: it may change at any time, and nothing locks it.
- Every document is in one currency and touches only that currency's account:
  - a sale on account: `onAccount { currency, amount (base), settled? }`, defaulting to the main currency;
  - a TL payment: the customer side's currency, chosen in the window and defaulting to the main currency;
  - **a receipt: the supplier's account in the receipt's own currency.** `owe`, `creditIn` and `inAccount` no longer convert, so the supplier's debt is exactly what was written;
  - a supplier return (YQ-): the receipt's currency.
- `customer_dues` rows hang on a sale or payment, so they are per currency by construction.
- `standingsOf` and `ageBalance` run per account and return `{ currency, owed, credit, overdue, overdueSince, nextDue, nextDueAmount }[]`.
- **Limit and bars** work on the total in the base at today's book: `Σ (owed − credit)` over the currencies, plus this sale's account part.
  - If any currency involved has no rate, the account block is off and `wantingRate` says which rate is missing. Selling for money still works.
  - `adds` is computed in the base.
  - "Overdue" is any currency's overdue.
- **In-account exchange** (`hisob ichida almashtirish`): a TL kind `exchange`. One entry moves an amount from the customer's A account to their B account, at the day's rate or an agreed sum (`valueLine`). The difference goes to `fx`. Permission: `customers.adjust`. It is shown in both currencies' statements.
- Merge (M4): each currency's balance moves to the survivor's account in the same currency. No conversion happens unless a person chooses it.
- Statement (akt-sverka): one block per currency, then a total in the base at today's book.

**Places since V9**
- A till's drawers are cash accounts given to the till, in any currency (`register_id`). For `pos.sell`, the places are this register's active drawers, plus cards (each in its own currency) and base terminals that `servesShop`, with an open shift.
- The Z-report already counts per currency (`shift_counts`, `ShiftTotals.cash`). Customer in and out are added to `ShiftCashMoves` per currency; they are not grouped by account name.

**Things section 2 names that are gone or renamed**
- `takesDollars` and dollar-only branches: use the till's currencies and the book.
- `partners.currency` single-currency checks (`PartnersService.assertCurrency`): the main currency is checked against `CurrenciesService.kept`. Account currencies are checked per document.
- `sales.uzs_per_usd` is kept for old receipts only.

## 4. How M2-1 and M2-2 were built (2026-10-10 – 2026-10-11)

Section 3's plan, as it went in. M2-3 (dues, limit and bars on the book), M2-4 (adjust, forgive, in-account exchange, terminal at the till, drawer payout cap) and M2-5 (returns and voids) are still to come; until M2-3 the retail debt (`customer_debts`, "Qarzlar" tabs) stays a book of its own.

**M2-1. The card** (migration `1790000044000-customer-card`)
- `customers.phone` is nullable, unique among those that have one (partial index). `down` refuses while phoneless customers exist.
- New columns: `currency` (NOT NULL, filled with the business's base), `price_type_id` (not the `min` kind; retail is null), `is_supplier`, `credit` (`default | none | limit | unlimited`), `credit_limit` (required for `limit`), `due_days` / `no_due` (never both), `return_days`.
- Core: `customerInputSchema` (`phone` optional, `currency?`, `priceTypeId`, `isSupplier`, `terms?`), `customerTermsSchema` (checks and normalises), `DEFAULT_CUSTOMER_TERMS`, `CustomerDto.currency / priceType / isSupplier / terms`.
- Terms are set only with `customers.adjust` (403 otherwise; a form without it sends none and nothing changes). The customer's own price comes before their group's (`rulesOf` → `PosCustomerDto.priceType`, `priceFrom`); loyalty counts only retail-priced sales.
- Permissions: `customers.suppliers`, `customers.receive`, `customers.pay_out`, `customers.adjust`. A role holding `customers.*` without `partners.*` (the store manager) is narrowed to view, manage, debts and receive, so it does not gain the suppliers' accounts; every `customers.debts` holder gains receive.

**M2-2. One book** (migration `1790000045000-one-customer-book`)
- Phones first: a phone two partners shared stays with the one whose account has ledger lines (else the oldest); the others carry it in their note (`Tel: …`).
- A partner whose phone is a customer's merges into that customer: the customer takes the partner's currency, their price (unless retail), the supplier mark, and the partner's name into the note. Every other partner is inserted as a customer with the same id; `search_key` is recomputed in JS with `searchKey`.
- Re-pointed: `receipts.supplier_id`, `receipt_lines.supplier_id` (FKs to customers), `accounts.partner_id → customer_id` with `kind = 'customer'` and UNIQUE `accounts_of_customer(customer_id, currency)`, `sales.partner_id → customer_id` (`customer_name` keeps the partner's name). `partner_payments` / `partner_payment_lines` are renamed to `customer_payments` / `customer_payment_lines` with their constraints and indexes; ledger `kind` / `document_type` `partner_payment*` → `customer_payment*`; `sale_payments` and `sale_return_payments` method `partner` → `account`. `DROP TABLE partners`. The TL- counter keeps its key (`partner_payment`).
- Permissions renamed in roles and in `users.extra_permissions`: `partners.*` → `customers.*`, `partners.view` → `customers.view`, `partners.manage` → `customers.manage`, `partners.debts` → `customers.debts` + `customers.suppliers`, `partners.pay` → `customers.receive` + `customers.pay_out`, `partners.adjust` → `customers.adjust`, `pos.partner_sale` → `pos.debt`. The warehouse template loses `partners.view` (it picks suppliers through `/customers/brief`). "Hamkorlar menejeri" becomes "Ulgurji menejer" (`customers.*`).
- `down` refuses once a customer account has a ledger line, a customer payment exists or a sale went on an account; otherwise it rebuilds `partners` (with `tenantPolicy('partners')`) from the customers that were partners.
- The audit log is append-only: old rows keep `partner` / `partner_payment`; their labels stay in the dictionaries, the audit filter offers `customer_payment`.

**Server**
- `modules/partners` is gone. `modules/customers` holds `CustomerPaymentsService` + `payments.controller.ts` (`/customer-payments`: list and one — `seesPayments`: receive, pay_out, debts or suppliers; `accounts`; create — `MAY`: in → receive, out → pay_out; `opening` — adjust; `:id/cancel`).
- `CustomersService`: `fields()` (phone check, currency kept or base, terms by `customers.adjust`), `priceOf` (retail → null, `min` refused), `dtos(em, customers, actor)` — balances by permission (supplier → `customers.suppliers`, others → `customers.debts`, else `null`), `brief` and `quick`, list filters `supplier` and `balance` (limited to the balances this person may see), archive guard `CUSTOMER_HAS_BALANCE`, a new name renames the accounts. Moving an existing customer across the supplier mark needs `customers.suppliers` (403): it moves their account out of or into a debts-holder's sight; the card's checkbox is disabled for the rest.
- `GET /customers/:id` is open to view, receive, pay_out, debts or suppliers (the payment window reads the card). `GET /customers/:id/statement?currency` checks the same rule as the balances.
- `LedgerService.customerAccount(em, customer, currency)` finds or opens the account of that currency.
- Receipts: `owe` / `creditIn` post to `customerAccount(em, supplier, receipt.currency)` with the amount written (`inAccount` removed); posting marks the suppliers `is_supplier`. Import finds suppliers by name among `is_supplier` customers (two of one name is an error) and creates a missing one in the receipt's currency.
- Stock documents: `StockDocDto.supplierId / supplierName`; `credited` needs `customers.suppliers`.
- Sales: `onAccount { currency?, amount, settled? }` for any customer (`partnerId` is gone); currency defaults to the customer's main one and must be kept; `pos.debt` or an approver with debts (`ON_ACCOUNT_NEEDS_WORD`). Returns: `accountShare`, `accountPart`, `caps.account`.
- POS: `/pos/partners`, `PosPartnerDto`, `maySellToPartners` and `approvers[].partners` are gone; `POST /pos/customers` strips price, supplier mark, currency and terms; `GET /pos/customers/:id` re-reads a kept cart's customer.
- Shifts: `ShiftCashMoves.customersIn / customersOut`; a sale on account is named by its method only (`PLACE_NAME` is empty for `account`), never by whose account.
- Base currency change carries `customers.credit_limit` and moves customers' main currency old → new; "money held" checks customer accounts.

**Web**
- `features/partners` is gone; `/partners` redirects to `/customers`. `payment-lines.tsx` moved to `features/money`, the payment windows to `features/customers/payments.tsx`: `PaymentDialog { customerId?, currency?, kind? }` (customer `Combobox` searching the server through `onQuery`; "Hisob valyutasi" select), `OpeningDialog { customer }` (currency select), `StatementDialog { customerId, currency?, onPay(kind, currency) }` (a button per currency), `PaymentsPage` ("Mijoz to‘lovlari", under Mijozlar in the menu).
- `features/customers/choices.ts` — `useCustomerChoices(picked, suppliersFirst)` over `/customers/brief`; `Combobox` and `FilterCombo` gained `onQuery`. Receipts, receipt import and the receipts list pick suppliers through it; a new supplier is made with `/customers/quick`.
- Customers page: columns "Turi" (supplier badge; filter all / suppliers / others), "Narxi", "Hisob-kitob" (each unsettled currency on its own line — "qarzi 2 050,00 $", "haqi 2 000 000 so‘m"; filter owes / owed; only for debts or suppliers holders); the row menu adds statement (when `balances !== null`), take in, pay out (receive / pay_out, active customers) and opening (adjust), opened in place through `over` (a payment started from the statement returns to it). A person without `customers.manage` opens a row on its statement.
- Card form: name first, phone optional, price, main currency (when the business keeps more than one), "Yetkazib beruvchi", and a "Hisob-kitob" fieldset for `customers.adjust`.
- Till: the customer picker has no partner list and adds a customer without a phone; the "Hisobiga" block is offered for any customer, in their main currency; `offAccount` on returns; the shift report shows `customersIn / customersOut`.
- Shell: Ctrl+K / Alt+K need `customers.receive`, Alt+C needs `customers.pay_out`.

**Tests**
- Server: `customer-payments.spec.ts` (was `partner-payments`), `account-sales.spec.ts` (was `partner-sales`), the card and balances in `customers.spec.ts`, per-currency supplier debt in `receiving.spec.ts`, the rest adjusted. The migration was run up and down on partner data in the test database (merge by phone, phone dedupe by ledger use, accounts, receipts).
- Web: `on-account.test.tsx` (was `partner-sale.test`), fixtures in `pos-state.test.ts` and `customer-picker.test.tsx`, the menu groups in `sidebar.test.ts`. Core: the payment schema in `settlements.test.ts`.
- On screen (a sample business in the test database, servers 3101/5191): the list with balances in three currencies, both filters, the row menu, the statement in each currency, a payment opened from it on the so'm account and back, "Mijoz to‘lovlari".
- Every role (one person each, 2026-10-11): owner and manager see and do everything; accountant sees both kinds of balance, takes payments, pays none out (as before: the template never had `partners.pay`); store manager sees buyers' balances, not suppliers', takes payments, Ctrl+K only; cashier has no customers' screens, and putting a sale on an account asks for a PIN (`ON_ACCOUNT_NEEDS_WORD`, the owner as approver); warehouse picks suppliers in receipts (the receipt's currency follows the supplier) and sees no credited sum on a YQ-; seller sees nothing of customers; wholesale manager has the whole book (terms included) but no till. Fixed on the way: the supplier mark (above) and the payment window's kind list, which now offers only the ways this person may pay.

## 5. How M2-3 was built (2026-10-11)

Debts are the customer's account (16.3). The retail debt book is gone; what is owed, late or next due is read from the account each time.

**DB** (migration `1790000046000-customer-dues`)
- Guard: refuses while `customer_debts` or `debt_payments` has rows (the old retail debts are not carried over; settle them, or move them by hand on a copy).
- `customer_dues` (`customer_id`, `sale_id` or `payment_id` — exactly one, each unique; `due_date` null for never; `changed_by`, `changed_by_name`, `changed_at`), RLS. Existing sales on account get a row with no day.
- `sale_payments.prepaid` (what of a sale on account the customer's haqi covered, `0 ≤ prepaid ≤ amount`). Method checks drop `debt`.
- Drops `debt_payment_parts`, `debt_payment_lines`, `debt_payments`, `customer_debts`. `down` refuses once a due has a day or a payment, or a sale used haqi; otherwise rebuilds the empty debt tables.

**Core**
- `debts.ts` rewritten: `ageBalance(events, today)` (charges, debits, credits with an optional `target`; haqi first, then the targeted charge, then dated by due date, then dateless, then plain debits; `owed − credit = balance`, never both above zero), `accountBar(customer, adds, orgLimit)` (`supplier` even at `adds = 0`, then `barred`, `no_phone` for a phoneless `default` customer, `overdue`, `over_limit`; `limit` own ceiling, `unlimited` none, `default` the business's, which at 0 means every debt needs a word), `addedDebt(balance, amount)`, `debtorListQuerySchema`, `DebtorDto`, `DebtorSummary`, `dueChangeSchema`. `spreadOverDebts`, `debtState` and the debt payment contracts are gone.
- `CustomerBalance` extends `AccountAge`. `PosCustomerDto`: `debt` → `accounts` (null for a hidden supplier), `credit`, `creditLimit`, `dueDays`, `noDue`. `CustomerDto.debt / overdue` gone.
- `pos.ts`: `PAYMENT_METHODS` without `debt`; `saleOnAccountSchema.dueDate`; `saleInputSchema.debt` gone; `SaleDto.debt` → `due: { id, dueDate } | null`; `ReturnableDto.caps.debt` and `ShiftCashMoves.debts` gone. `customerOpeningInputSchema.dueDate`; `CustomerStatementLine.due`.

**Server**
- `customers/standing.ts`: `businessDay`, `standingsOf(em, customerIds, today)` — only accounts that owe are aged; events are the account's ledger lines in order, leaving out voided sales, cancelled payments, receipts and supplier returns with their reversals; a sale's or a dated opening's positive line is a charge with its due row, a return's credit targets its sale.
- `rulesOf(em, customers, seesSuppliers = true)` returns the standing and the terms; `/pos/customers` and `/pos/customers/:id` pass `customers.suppliers`.
- Sales: one account block (the old debt block and `customer_debts` are gone). The customer row is locked, the standing read again; `prepaid = min(settled, max(0, −B))`, `lent` the rest; bars by `accountBar` with `owedBase` and `adds` at today's book (an unrated currency among the balances refuses a lent sale); codes `SUPPLIER_ON_ACCOUNT`, `NO_DEBT`, `NO_PHONE`, `DEBT_OVERDUE`, `DEBT_OVER_LIMIT`; `pos.debt` or an approver with debts. A lent sale writes its due row (asked day, else the customer's or the business's days, null for `noDue`; a past day refused). Void no longer refuses a paid debt (`SALE_DEBT_PAID` gone).
- Returns: the account part comes off first (`offAccount = min(total − credit, put − returned)`), the customer locked; cash cap no longer adds debt payments.
- Customer payments: `atTill` — a `pos.sell` holder without `customers.receive` takes `in` payments into drawers and cards only (`TILL_PLACES`), never from a supplier; `/customer-payments/accounts` serves them too. The customer is locked. `opening` with `dueDate` (only for what the customer owes) writes a due row. The statement gives each debt line its `due`, dropped once the document is undone.
- `CustomersService.debtors` (`GET /customers/debtors`): one row per owing account the person may see, late first (oldest), then by next due; summary in the base. `moveDue` (`PUT /customers/dues/:id`): that account's keeper or `pos.debt`; null only for `noDue` customers or `customers.adjust`; audited `customer.due`.
- `modules/customers/debts.*` deleted; shifts no longer read `debt_payment_lines`.

**Web**
- `TenderPanel`: `lend` and `offDebt` gone; one `onAccount` block — "Qarzga / Hisobidan · name", the account's balance beside it ("qarzi …" / "haqi …"), under it "Haqidan: …", "Qarzga: …" and the due day field (only when something is lent). `pos-page`: `accountDue`, `accountStop` / `accountWhy` from `accountBar`, the approval reason, `onAccount.dueDate` only when lent.
- `CustomerPicker`: each account's debt or haqi, what is late, "To‘lov olish" when they owe; it opens `PaymentDialog` with `buyer` (no `/customers/:id`, no `/customers/brief`; `onSaved` re-reads the customer). `debt-pay.tsx` deleted; `useCustomerChoices(…, enabled)`.
- Customers: "Qarzlar" + "Qarz to‘lovlari" → "Qarzdorlar" (`DebtorsTab`: owed, late and since when, next due; statement and payment from the row; filter owed / overdue). List: the "Qarzi" column is gone, the balance column says what is late. `StatementDialog`: a "To‘lash muddati" column with a date field for whoever may move days.
- Receipt, sale window, return parts and Z-report read `due` / `account` instead of the old debt.

**Tests**
- Core: `debts.test.ts` (the Aziz example, haqi first, targeted returns, suppliers never late, dateless debts, the balance invariant; every bar; the sale schema).
- Server: `customer-account.spec.ts` (due days by business, card and cashier; every bar with and without a word; haqi and `prepaid`; moving a day, overdue at the till, money in at the till and its places; returns off their own receipt; voids; dated openings and the statement; debtors and their summary; isolation). `customer-debts.spec.ts` removed; account sales, returns, customers, receiving and customer payments adjusted.
- Web: the till's customer card, the one account block (haqi, lent, day), the receipt's due line, the report fixture.
- On screen (test database, 3101/5191): the cashier sells to a customer with haqi without a word ("Haqidan: 500 000 so‘m"), sees a late debt on the customer card, takes 1 000 000 in at the till (the late part goes), is asked for a word for a new debt with the day set 30 days on; the owner's "Qarzdorlar" and the statement, a day moved and the list showing it late.
