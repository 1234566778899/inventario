-- Splits the single is_visible flag into two independent concerns:
--   is_visible     → the field appears in the product form
--   show_in_table  → the field appears as a column in the products table
--
-- Until now is_visible drove both, so hiding a field from the form also removed
-- its table column with no way to keep one without the other.
--
-- Existing rows keep their current behaviour: a field visible in the form was
-- also showing as a column, so show_in_table starts out matching is_visible.

ALTER TABLE public.custom_fields
  ADD COLUMN IF NOT EXISTS show_in_table BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.custom_fields
   SET show_in_table = is_visible
 WHERE show_in_table IS DISTINCT FROM is_visible;

COMMENT ON COLUMN public.custom_fields.is_visible
  IS 'Field is shown in the product create/edit form.';
COMMENT ON COLUMN public.custom_fields.show_in_table
  IS 'Field is offered as a column in the products table.';
