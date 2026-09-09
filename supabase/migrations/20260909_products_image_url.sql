-- Habilita la foto del producto.
--
-- La UI de imagen (subir, arrastrar, cambiar, quitar) ya existía y products.service
-- ya sube al bucket 'product-images', pero la columna donde se guarda la URL nunca
-- llegó a crearse: cualquier intento fallaba con
--   42703: column products.image_url does not exist
-- y el formulario mostraba "No se pudo subir la imagen".
--
-- Es TEXT y nullable: NULL = producto sin foto, que es como ya lo tratan las
-- plantillas (@if (row.image_url)).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN public.products.image_url
  IS 'URL pública de la foto en el bucket product-images. NULL si no tiene.';
