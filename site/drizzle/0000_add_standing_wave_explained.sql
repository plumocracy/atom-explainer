ALTER TABLE "conversations"
ADD COLUMN IF NOT EXISTS "standing_wave_visualization_explained" boolean NOT NULL DEFAULT false;
