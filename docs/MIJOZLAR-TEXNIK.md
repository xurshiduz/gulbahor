# Final spec: technical notes (branch cloud/exchange-partners)

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
4. Currency-mismatched prices, and whether any `exchange_rates` row exists.
5. `pg_dump`. Then run `up`, then `down`, on a copy.

### Pitfalls
- Keep the counter key `partner_payment`.
- Expand the literal `customers.*` before adding new keys to the group.
- The `receipts.*` wildcard grants `receipts.prices` to the warehouse role.
- The Z-report must not group account rows by account name.
- `sale_payments` stay immutable; due dates live in `customer_dues`.
- Store the retail kind as null everywhere (customers, groups).
- The `mixed` location route for warehouse wholesale needs a check of the gate, stock pages and transfers before it is recommended. This is open question 3.
