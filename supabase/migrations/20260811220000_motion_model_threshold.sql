-- Reduce el umbral inicial mientras el conjunto LSD sigue en fase experimental.
-- Respeta cualquier valor que el administrador ya haya configurado por debajo de 0.80.
alter table public.model_training_settings
  alter column confidence_threshold set default 0.68;

update public.model_training_settings
set confidence_threshold = 0.68,
    updated_at = now()
where variant = 'LSD'
  and confidence_threshold >= 0.80;
