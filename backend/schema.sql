-- ============================================================
-- EdusyncHub — full schema (fresh deploy to Neon)
-- Order matters: tables are created before anything that
-- references them via foreign key.
-- ============================================================

-- 1. TEACHERS ------------------------------------------------------
CREATE TABLE public.teachers (
    id serial PRIMARY KEY,
    phone_number character varying(15) NOT NULL UNIQUE,
    pochi_number character varying(15) NOT NULL,
    email character varying(255) NOT NULL UNIQUE,
    password_hash character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    business_name character varying(255),
    status character varying(20) NOT NULL DEFAULT 'active', -- active | suspended
    created_at timestamp without time zone DEFAULT now()
);

CREATE INDEX idx_teachers_phone ON public.teachers USING btree (phone_number);
CREATE INDEX idx_teachers_email ON public.teachers USING btree (email);

-- 2. OTP CODES -------------------------------------------------------
-- Buyer phone verification, unrelated to teacher tenancy.
CREATE TABLE public.otp_codes (
    id serial PRIMARY KEY,
    phone_number character varying(15) NOT NULL,
    code character varying(6) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now()
);

CREATE INDEX idx_otp_phone ON public.otp_codes USING btree (phone_number);

-- 3. PAPERS ------------------------------------------------------------
CREATE TABLE public.papers (
    id serial PRIMARY KEY,
    teacher_id integer NOT NULL REFERENCES public.teachers(id),
    title character varying(255) NOT NULL,
    subject character varying(100),
    level character varying(50),
    price integer NOT NULL,
    description text,
    file_key character varying(255) NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    curriculum character varying(20),
    grade character varying(50),
    exam_type character varying(50),
    term character varying(20),
    year integer,
    is_bundle boolean DEFAULT false
);

CREATE INDEX idx_papers_teacher ON public.papers USING btree (teacher_id);

-- 4. PURCHASES -----------------------------------------------------------
-- Parent buying a paper. Paid via IntaSend, not Daraja directly.
CREATE TABLE public.purchases (
    id serial PRIMARY KEY,
    paper_id integer NOT NULL REFERENCES public.papers(id),
    phone_number character varying(15) NOT NULL,
    checkout_request_id character varying(100),
    merchant_request_id character varying(100),
    amount integer NOT NULL,
    status character varying(20) NOT NULL DEFAULT 'pending',
    mpesa_receipt character varying(50),
    download_token character varying(100),
    token_expires_at timestamp without time zone,
    token_used boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    email character varying(255),
    CONSTRAINT purchases_checkout_request_id_key UNIQUE (checkout_request_id),
    CONSTRAINT purchases_download_token_key UNIQUE (download_token)
);

CREATE INDEX idx_purchases_checkout ON public.purchases USING btree (checkout_request_id);
CREATE INDEX idx_purchases_token ON public.purchases USING btree (download_token);

-- 5. PAYMENT EVENTS -------------------------------------------------------
-- Append-only audit log for any webhook/event (purchases or subscriptions).
CREATE TABLE public.payment_events (
    id serial PRIMARY KEY,
    purchase_id integer REFERENCES public.purchases(id),
    checkout_request_id character varying(100),
    phone_number character varying(15),
    event_type character varying(30) NOT NULL,
    payload jsonb,
    created_at timestamp without time zone DEFAULT now()
);

CREATE INDEX idx_payment_events_checkout ON public.payment_events USING btree (checkout_request_id);
CREATE INDEX idx_payment_events_phone ON public.payment_events USING btree (phone_number);
CREATE INDEX idx_payment_events_purchase ON public.payment_events USING btree (purchase_id);
CREATE INDEX idx_payment_events_type ON public.payment_events USING btree (event_type);

-- 6. LEDGER ACCOUNTS -------------------------------------------------------
-- One 'teacher_payable' account per teacher, plus a single
-- 'platform_revenue' account (teacher_id NULL) for your 30% cut.
CREATE TABLE public.ledger_accounts (
    id serial PRIMARY KEY,
    teacher_id integer REFERENCES public.teachers(id),
    account_type character varying(30) NOT NULL, -- teacher_payable | platform_revenue
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT ledger_accounts_teacher_type_unique UNIQUE (teacher_id, account_type)
);

CREATE INDEX idx_ledger_accounts_teacher ON public.ledger_accounts USING btree (teacher_id);

-- 7. PAYOUTS --------------------------------------------------------------
-- Teacher withdrawals via IntaSend Payouts, mirrors `purchases`.
CREATE TABLE public.payouts (
    id serial PRIMARY KEY,
    teacher_id integer NOT NULL REFERENCES public.teachers(id),
    amount integer NOT NULL CHECK (amount > 0),
    status character varying(20) NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed | reversed
    conversation_id character varying(100),
    originator_conversation_id character varying(100),
    mpesa_receipt character varying(50),
    failure_reason text,
    requested_at timestamp without time zone DEFAULT now(),
    completed_at timestamp without time zone,
    CONSTRAINT payouts_conversation_id_key UNIQUE (conversation_id)
);

CREATE INDEX idx_payouts_teacher ON public.payouts USING btree (teacher_id);
CREATE INDEX idx_payouts_status ON public.payouts USING btree (status);

-- 8. LEDGER ENTRIES ---------------------------------------------------------
-- Double-entry rows for paper purchases ONLY (the split-payment money).
-- Registration fees never touch this table — they're pure platform
-- revenue collected directly via Daraja, nothing to split.
CREATE TABLE public.ledger_entries (
    id bigserial PRIMARY KEY,
    account_id integer NOT NULL REFERENCES public.ledger_accounts(id),
    entry_type character varying(10) NOT NULL CHECK (entry_type IN ('debit', 'credit')),
    amount integer NOT NULL CHECK (amount > 0),
    purchase_id integer REFERENCES public.purchases(id),
    payout_id integer REFERENCES public.payouts(id),
    description character varying(255),
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT ledger_entries_source_check CHECK (
        purchase_id IS NOT NULL OR payout_id IS NOT NULL
    )
);

CREATE INDEX idx_ledger_entries_account ON public.ledger_entries USING btree (account_id);
CREATE INDEX idx_ledger_entries_purchase ON public.ledger_entries USING btree (purchase_id);
CREATE INDEX idx_ledger_entries_payout ON public.ledger_entries USING btree (payout_id);

-- 9. SUBSCRIPTIONS ----------------------------------------------------------
-- Teacher's KES 499/month dashboard gate. A trial row is inserted at
-- signup; a paid row is inserted when subscription_payments confirms.
-- Access = "does an active, unexpired row exist" — no cron job needed,
-- the lock happens automatically once expires_at passes.
CREATE TABLE public.subscriptions (
    id serial PRIMARY KEY,
    teacher_id integer NOT NULL REFERENCES public.teachers(id),
    tier character varying(20) NOT NULL DEFAULT 'trial', -- trial | monthly
    status character varying(20) NOT NULL DEFAULT 'active',
    started_at timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);

CREATE INDEX idx_subscriptions_teacher ON public.subscriptions USING btree (teacher_id);

-- 10. SUBSCRIPTION PAYMENTS --------------------------------------------------
-- Tracks pending/paid KES 499 Daraja STK Push attempts (registration
-- fee only — goes to your own shortcode, not through IntaSend).
CREATE TABLE public.subscription_payments (
    id serial PRIMARY KEY,
    teacher_id integer NOT NULL REFERENCES public.teachers(id),
    checkout_request_id character varying(100),
    merchant_request_id character varying(100),
    amount integer NOT NULL,
    status character varying(20) NOT NULL DEFAULT 'pending', -- pending | paid | failed
    mpesa_receipt character varying(50),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT subscription_payments_checkout_id_key UNIQUE (checkout_request_id)
);

CREATE INDEX idx_subscription_payments_teacher ON public.subscription_payments USING btree (teacher_id);
CREATE INDEX idx_subscription_payments_checkout ON public.subscription_payments USING btree (checkout_request_id);

-- 11. CONVENIENCE VIEW: LIVE TEACHER BALANCE ---------------------------------
-- Query this for the dashboard header — never a stored balance column.
CREATE VIEW public.teacher_balances AS
SELECT
    t.id AS teacher_id,
    t.name,
    COALESCE(SUM(CASE WHEN le.entry_type = 'credit' THEN le.amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN le.entry_type = 'debit' THEN le.amount ELSE 0 END), 0)
        AS available_balance
FROM public.teachers t
LEFT JOIN public.ledger_accounts la
    ON la.teacher_id = t.id AND la.account_type = 'teacher_payable'
LEFT JOIN public.ledger_entries le
    ON le.account_id = la.id
GROUP BY t.id, t.name;