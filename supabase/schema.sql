-- ============================================
-- SCHEMA: Control de Monitoreo - Tareas
-- Ejecuta este SQL en el SQL Editor de Supabase
-- ============================================

CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  shift TEXT NOT NULL CHECK (shift IN ('manana', 'tarde', 'noche')),
  task_time TIME NOT NULL,
  days TEXT[] NOT NULL DEFAULT ARRAY['lunes','martes','miercoles','jueves','viernes','sabado','domingo'],
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permitir acceso publico (sin auth)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access" ON tasks;

CREATE POLICY "Allow all access" ON tasks
  FOR ALL
  USING (true)
  WITH CHECK (true);
