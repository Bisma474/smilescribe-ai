-- ============================================================
-- Migration: 004_seed_demo_data
-- Description: Demo data for development — safe to skip in prod
-- ============================================================

-- Demo user (password: Demo@12345 — bcrypt hash)
INSERT INTO users (email, hashed_password, full_name, role, practice_name, license_number, is_active, is_verified)
VALUES (
    'dr.kim@brightsmile.com',
    '$2b$12$2Ul6UE.GHKk4BubpPTCf6OYRPkONPPd9tOV27DF8eqp73P6aS.Kbq',
    'Dr. Alice Kim',
    'dentist',
    'Bright Smile Dental',
    'CA-284710',
    TRUE,
    TRUE
)
ON CONFLICT (email) DO NOTHING;

-- Demo patients
WITH dentist AS (SELECT id FROM users WHERE email = 'dr.kim@brightsmile.com' LIMIT 1)
INSERT INTO patients (practice_id, first_name, last_name, dob, email, phone, risk_level)
SELECT
    dentist.id, p.first_name, p.last_name, p.dob::DATE, p.email, p.phone, p.risk_level
FROM dentist,
(VALUES
    ('Sarah',  'Johnson', '1985-06-12', 'sarah.j@email.com',  '555-0101', 'low'),
    ('Marcus', 'Torres',  '1981-03-14', 'marcus.t@email.com', '555-0102', 'high'),
    ('Lisa',   'Nguyen',  '1993-09-28', 'lisa.n@email.com',   '555-0103', 'normal'),
    ('Robert', 'Park',    '1968-11-02', 'robert.p@email.com', '555-0104', 'normal'),
    ('Ana',    'Patel',   '1990-02-14', 'ana.p@email.com',    '555-0105', 'high'),
    ('Julia',  'Lee',     '2001-12-18', 'julia.l@email.com',  '555-0106', 'high')
) AS p(first_name, last_name, dob, email, phone, risk_level)
ON CONFLICT DO NOTHING;
