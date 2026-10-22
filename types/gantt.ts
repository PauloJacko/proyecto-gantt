export interface Proyecto {
  id: number
  nombre: string
  descripcion?: string
  encargado?: string
  fecha_inicio?: string
  fecha_fin?: string
  created_at?: string
}

export interface TareaGantt {
  id: number 
  proyecto_id: number 
  msp_id: string // "1", "1.1", "1.2.1"
  nombre: string
  fecha_inicio: string // YYYY-MM-DD
  fecha_fin: string   // YYYY-MM-DD
  progreso: number    // 0 - 100 (numeric)
  tipo: 'project' | 'task' | 'milestone'
  encargado?: string
  dependencias?: string // MSP IDs separados por coma (ej: "1.1")
}