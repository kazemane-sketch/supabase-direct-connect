ALTER TABLE public.counterparties ADD COLUMN entity_type text DEFAULT 'azienda';

COMMENT ON COLUMN public.counterparties.entity_type IS 'Entity type: azienda, pa, professionista, persona';