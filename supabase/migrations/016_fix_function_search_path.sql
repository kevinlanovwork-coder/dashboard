-- Fix mutable search_path security warning on preserve_deleted_at function
ALTER FUNCTION public.preserve_deleted_at() SET search_path = public;
