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
  depends_on UUID,
  depends_on_step UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLA DE PASOS (sub-tareas dentro de una tarea)
-- ============================================
CREATE TABLE IF NOT EXISTS task_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  done BOOLEAN DEFAULT false,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE task_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access steps" ON task_steps;

CREATE POLICY "Allow all access steps" ON task_steps
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Permitir acceso publico (sin auth)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access" ON tasks;

CREATE POLICY "Allow all access" ON tasks
  FOR ALL
  USING (true)
  WITH CHECK (true);
