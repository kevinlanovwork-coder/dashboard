-- Rename 'Bank Account' to 'Bank Deposit' everywhere for consistency

-- rate_records
UPDATE rate_records SET delivery_method = 'Bank Deposit' WHERE delivery_method = 'Bank Account';

-- alert_rules
UPDATE alert_rules SET delivery_method = 'Bank Deposit' WHERE delivery_method = 'Bank Account';

-- service_fees
UPDATE service_fees SET delivery_method = 'Bank Deposit' WHERE delivery_method = 'Bank Account';

-- Update defaults
ALTER TABLE rate_records ALTER COLUMN delivery_method SET DEFAULT 'Bank Deposit';
ALTER TABLE alert_rules ALTER COLUMN delivery_method SET DEFAULT 'Bank Deposit';
ALTER TABLE service_fees ALTER COLUMN delivery_method SET DEFAULT 'Bank Deposit';
