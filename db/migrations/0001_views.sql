-- Cockpit views. Amounts in bigint cents.

-- Bank balance = last snapshot + movements after it (or all movements if none).
-- Unpaid provisions = everything provisioned − everything paid to administrations.
CREATE VIEW v_available_balance AS
WITH snap AS (
  SELECT date, amount FROM balance_snapshots ORDER BY date DESC LIMIT 1
), base AS (
  SELECT (SELECT date FROM snap) AS snapshot_date,
         coalesce((SELECT amount FROM snap), 0) AS snapshot_amount
), moves AS (
  SELECT coalesce(sum(t.amount), 0) AS total
  FROM transactions t, base
  WHERE base.snapshot_date IS NULL OR t.date > base.snapshot_date
), prov AS (
  SELECT coalesce(sum(amount), 0) AS total FROM provisions
), paid AS (
  SELECT coalesce(sum(-amount), 0) AS total FROM transactions WHERE kind = 'paiement_echeance'
)
SELECT base.snapshot_date,
       base.snapshot_amount::bigint AS snapshot_amount,
       (base.snapshot_amount + moves.total)::bigint AS balance,
       prov.total::bigint AS provisions_total,
       paid.total::bigint AS paid_total,
       greatest(prov.total - paid.total, 0)::bigint AS provisions_unpaid,
       (base.snapshot_amount + moves.total - greatest(prov.total - paid.total, 0))::bigint AS available
FROM base, moves, prov, paid;
--> statement-breakpoint

-- How much of the unpaid provisions the balance covers, and the next deadline.
CREATE VIEW v_coverage AS
SELECT b.balance,
       b.provisions_unpaid,
       CASE WHEN b.provisions_unpaid > 0
            THEN (b.balance::double precision / b.provisions_unpaid)
       END AS coverage_ratio,
       d.id AS next_deadline_id,
       d.kind AS next_kind,
       d.label AS next_label,
       d.due_on AS next_due_on,
       d.amount_due AS next_amount
FROM v_available_balance b
LEFT JOIN LATERAL (
  SELECT id, kind, label, due_on, amount_due FROM deadlines
  WHERE paid_on IS NULL AND amount_due > 0
  ORDER BY due_on, id
  LIMIT 1
) d ON true;
--> statement-breakpoint

-- Realised figures per month: CA and frais HT, provisions by kind.
CREATE VIEW v_ytd AS
WITH per_tx AS (
  SELECT t.id, t.date, t.kind, t.amount, t.vat_amount,
         coalesce(sum(p.amount) FILTER (WHERE p.kind = 'urssaf'), 0) AS urssaf,
         coalesce(sum(p.amount) FILTER (WHERE p.kind = 'cfp'), 0) AS cfp,
         coalesce(sum(p.amount) FILTER (WHERE p.kind = 'impot'), 0) AS impot,
         coalesce(sum(p.amount) FILTER (WHERE p.kind = 'tva'), 0) AS tva
  FROM transactions t
  LEFT JOIN provisions p ON p.transaction_id = t.id
  GROUP BY t.id
)
SELECT extract(year FROM date)::int AS year,
       extract(month FROM date)::int AS month,
       sum(CASE WHEN kind = 'encaissement' THEN amount - vat_amount ELSE 0 END)::bigint AS ca_ht,
       sum(CASE WHEN kind = 'frais_pro' THEN -amount - vat_amount ELSE 0 END)::bigint AS frais_ht,
       sum(urssaf)::bigint AS urssaf,
       sum(cfp)::bigint AS cfp,
       sum(impot)::bigint AS impot,
       sum(tva)::bigint AS tva
FROM per_tx
GROUP BY 1, 2;
