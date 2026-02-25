
-- Insert CAVECO S.R.L.
INSERT INTO public.companies (name, vat_number, fiscal_code, address, city, zip_code, province, sdi_code, pec)
VALUES ('CAVECO S.R.L.', '07951511000', '07951511000', 'Via di S. Costanza, 35', 'Roma', '00198', 'RM', 'QULXG4S', 'cavecosrl@pec.it');

-- Add user as owner (need to use a subquery for the company_id)
INSERT INTO public.company_members (company_id, user_id, role)
SELECT id, '138a2a2f-fc53-4b78-a735-44f7f9e4e759', 'owner'
FROM public.companies WHERE vat_number = '07951511000';
