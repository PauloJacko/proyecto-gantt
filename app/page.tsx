'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Proyecto, TareaGantt } from '@/types/gantt'
import { exportToMSProjectXML, downloadXMLFile } from '@/lib/xmlProjectParser'

export default function GanttApp() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState<Proyecto | null>(null)
  const [tareas, setTareas] = useState<TareaGantt[]>([])
  const [cargando, setCargando] = useState<boolean>(true)

  // Modales
  const [mostrarModalProyecto, setMostrarModalProyecto] = useState(false)
  const [nuevoNombreProyecto, setNuevoNombreProyecto] = useState('')
  const [nuevoEncargadoProyecto, setNuevoEncargadoProyecto] = useState('')

  const [mostrarModalTarea, setMostrarModalTarea] = useState(false)
  const [nuevaTarea, setNuevaTarea] = useState<Partial<TareaGantt>>({
    msp_id: '1.1',
    nombre: '',
    fecha_inicio: new Date().toISOString().split('T')[0],
    fecha_fin: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    progreso: 0,
    tipo: 'task',
    encargado: '',
  })

  // Cargar proyectos
  const cargarProyectos = async () => {
    setCargando(true)
    const { data, error } = await supabase.from('proyectos').select('*').order('id', { ascending: true })
    if (!error && data) {
      setProyectos(data)
      if (data.length > 0 && !proyectoSeleccionado) {
        setProyectoSeleccionado(data[0])
      }
    }
    setCargando(false)
  }

  // Cargar tareas
  const cargarTareas = async (proyectoId: number) => {
    const { data, error } = await supabase
      .from('tareas')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('msp_id', { ascending: true })
    
    if (!error && data) {
      setTareas(data)
    }
  }

  useEffect(() => {
    cargarProyectos()
  }, [])

  useEffect(() => {
    if (proyectoSeleccionado) {
      cargarTareas(proyectoSeleccionado.id)
    } else {
      setTareas([])
    }
  }, [proyectoSeleccionado])

  // Crear Proyecto
  const crearProyecto = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nuevoNombreProyecto.trim()) return

    const { data, error } = await supabase
      .from('proyectos')
      .insert([{ nombre: nuevoNombreProyecto, encargado: nuevoEncargadoProyecto }])
      .select()

    if (!error && data) {
      setProyectos([...proyectos, data[0]])
      setProyectoSeleccionado(data[0])
      setNuevoNombreProyecto('')
      setNuevoEncargadoProyecto('')
      setMostrarModalProyecto(false)
    }
  }

  // Agregar Tarea
  const agregarTarea = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!proyectoSeleccionado || !nuevaTarea.nombre) return

    const payload = {
      proyecto_id: proyectoSeleccionado.id,
      msp_id: nuevaTarea.msp_id || '1',
      nombre: nuevaTarea.nombre,
      fecha_inicio: nuevaTarea.fecha_inicio,
      fecha_fin: nuevaTarea.fecha_fin,
      progreso: Number(nuevaTarea.progreso) || 0,
      tipo: nuevaTarea.tipo || 'task',
      encargado: nuevaTarea.encargado || '',
    }

    const { data, error } = await supabase.from('tareas').insert([payload]).select()

    if (!error && data) {
      setTareas([...tareas, data[0]].sort((a, b) => a.msp_id.localeCompare(b.msp_id, undefined, { numeric: true })))
      setMostrarModalTarea(false)
      setNuevaTarea({
        msp_id: '1.' + (tareas.length + 1),
        nombre: '',
        fecha_inicio: new Date().toISOString().split('T')[0],
        fecha_fin: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        progreso: 0,
        tipo: 'task',
        encargado: '',
      })
    }
  }

  // Eliminar Tarea
  const eliminarTarea = async (id?: number) => {
    if (!id) return
    const { error } = await supabase.from('tareas').delete().eq('id', id)
    if (!error) {
      setTareas(tareas.filter((t) => t.id !== id))
    }
  }

  // Exportar XML
  const handleExportarXML = () => {
    if (!proyectoSeleccionado) return
    const xmlContent = exportToMSProjectXML(proyectoSeleccionado.nombre, tareas)
    downloadXMLFile(`${proyectoSeleccionado.nombre.replace(/\s+/g, '_')}_Gantt.xml`, xmlContent)
  }

  // Cálculo de fechas para la línea de tiempo visual (Octubre - Noviembre 2026 o rango dinámico)
  // Generamos un rango fijo de 45 días a partir del 1 de Octubre de 2026 para el ejemplo visual o fecha actual
  const fechaBaseTimeline = new Date('2026-10-01')
  const diasTimeline = Array.from({ length: 50 }, (_, i) => {
    const d = new Date(fechaBaseTimeline)
    d.setDate(d.getDate() + i)
    return d
  })

  // Función para calcular posición en píxeles o porcentaje de las barras en el timeline
  const calcularPosicionBarra = (inicioStr: string, finStr: string) => {
    const inicio = new Date(inicioStr).getTime()
    const fin = new Date(finStr).getTime()
    const base = fechaBaseTimeline.getTime()
    const unDia = 86400000

    const offsetDias = Math.max(0, Math.floor((inicio - base) / unDia))
    const duracionDias = Math.max(1, Math.ceil((fin - inicio) / unDia))

    return {
      left: offsetDias * 32, // 32px por cada columna de día
      width: Math.max(duracionDias * 32, 28),
    }
  }

  const hoyStr = '2026-10-14' // Línea de hoy simulada según la imagen

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans select-none">
      {/* Barra Superior estilo MS Project */}
      <header className="bg-slate-900 text-white px-4 py-2.5 flex flex-wrap justify-between items-center shadow border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <span className="text-xl">📊</span>
          <h1 className="text-base font-bold tracking-wide">Sistema GANTT Profesional (Estilo MS Project)</h1>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={proyectoSeleccionado?.id || ''}
            onChange={(e) => {
              const p = proyectos.find((proj) => proj.id === Number(e.target.value))
              if (p) setProyectoSeleccionado(p)
            }}
            className="bg-slate-800 border border-slate-700 text-white rounded px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                📁 {p.nombre} ({p.encargado || 'Sin encargado'})
              </option>
            ))}
          </select>

          <button
            onClick={() => setMostrarModalProyecto(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs font-semibold transition"
          >
            + Proyecto
          </button>

          {proyectoSeleccionado && (
            <>
              <button
                onClick={() => setMostrarModalTarea(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-xs font-semibold transition"
              >
                + Tarea
              </button>
              <button
                onClick={handleExportarXML}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1 rounded text-xs font-medium transition flex items-center space-x-1"
              >
                <span>📥 Exportar XML</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Contenedor Principal divido en Tabla Izquierda y Gantt Derecho */}
      {proyectoSeleccionado ? (
        <div className="flex-1 flex overflow-x-auto bg-white border-t border-slate-200">
          
          {/* ================= PANEL IZQUIERDO: TABLA DE TAREAS ================= */}
          <div className="w-[480px] min-w-[480px] border-r border-slate-200 flex flex-col bg-white z-10 shadow-lg">
            {/* Cabecera Tabla */}
            <div className="grid grid-cols-12 bg-slate-100 text-slate-600 font-bold text-[11px] uppercase tracking-wider border-b border-slate-200 py-2.5 px-3">
              <div className="col-span-2">MSP ID</div>
              <div className="col-span-6">Nombre de tarea</div>
              <div className="col-span-3">Encargado</div>
              <div className="col-span-1 text-center">✕</div>
            </div>

            {/* Filas de Tareas */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {tareas.length > 0 ? (
                tareas.map((t) => {
                  const esFase = t.tipo === 'project'
                  return (
                    <div
                      key={t.id}
                      className={`grid grid-cols-12 items-center py-2 px-3 text-xs hover:bg-blue-50/50 transition ${
                        esFase ? 'bg-blue-50/70 font-bold text-slate-900' : 'text-slate-700'
                      }`}
                    >
                      <div className="col-span-2 font-mono text-slate-500">{t.msp_id}</div>
                      <div className="col-span-6 truncate pr-2" title={t.nombre}>
                        <span style={{ paddingLeft: `${(t.msp_id.split('.').length - 1) * 12}px` }}>
                          {esFase ? '📁 ' : '🔹 '}
                          {t.nombre}
                        </span>
                      </div>
                      <div className="col-span-3 text-slate-500 truncate" title={t.encargado}>
                        {t.encargado || '-'}
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          onClick={() => eliminarTarea(t.id)}
                          className="text-slate-400 hover:text-red-600 font-bold"
                          title="Eliminar"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="p-8 text-center text-slate-400 italic text-xs">
                  No hay tareas registradas. Haz clic en "+ Tarea" para empezar.
                </div>
              )}
            </div>
          </div>

          {/* ================= PANEL DERECHO: LÍNEA DE TIEMPO GANTT ================= */}
          <div className="flex-1 overflow-x-auto relative bg-slate-50">
            <div className="min-w-max flex flex-col">
              
              {/* Cabecera de Meses y Días */}
              <div className="bg-slate-200 border-b border-slate-300 flex text-[10px] text-slate-600 font-semibold">
                <div className="h-6 flex items-center px-4 bg-slate-300 border-r border-slate-300 sticky left-0 z-20">
                  Octubre 2026 / Noviembre 2026
                </div>
                <div className="flex">
                  {diasTimeline.map((d, idx) => {
                    const diaSemana = ['D', 'L', 'M', 'M', 'J', 'V', 'S'][d.getDay()]
                    const numeroDia = d.getDate()
                    const esFinSemana = d.getDay() === 0 || d.getDay() === 6
                    return (
                      <div
                        key={idx}
                        className={`w-8 h-6 flex flex-col items-center justify-center border-r border-slate-300 ${
                          esFinSemana ? 'bg-slate-250 text-slate-400' : ''
                        }`}
                      >
                        <span className="text-[9px] font-bold">{numeroDia}</span>
                        <span className="text-[8px] text-slate-500">{diaSemana}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Cuerpo del Gráfico de Gantt (Barras y Línea de Hoy) */}
              <div className="relative divide-y divide-slate-200">
                {/* Línea Vertical Roja de "Hoy" */}
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-10 pointer-events-none"
                  style={{ left: `${13 * 32}px` }} // Posicionado simétricamente en el día actual
                >
                  <span className="absolute -top-4 -left-3 bg-red-500 text-white text-[9px] px-1 rounded font-bold">
                    Hoy
                  </span>
                </div>

                {tareas.map((t) => {
                  const esFase = t.tipo === 'project'
                  const { left, width } = calcularPosicionBarra(t.fecha_inicio, t.fecha_fin)

                  return (
                    <div key={t.id} className="h-9 flex items-center relative hover:bg-slate-100/60">
                      {/* Cuadrícula de fondo por día */}
                      <div className="absolute inset-0 flex pointer-events-none">
                        {diasTimeline.map((_, i) => (
                          <div key={i} className="w-8 border-r border-slate-200 h-full" />
                        ))}
                      </div>

                      {/* Barra de Tarea Gantt */}
                      <div
                        className="absolute h-5 rounded flex items-center px-2 shadow-sm transition-all"
                        style={{
                          left: `${left}px`,
                          width: `${width}px`,
                          backgroundColor: esFase ? '#1e3a8a' : t.tipo === 'milestone' ? '#7c3aed' : '#0ea5e9',
                        }}
                      >
                        <div
                          className="absolute left-0 top-0 bottom-0 bg-emerald-400/40 rounded-l pointer-events-none"
                          style={{ width: `${t.progreso}%` }}
                        />
                        <span className="text-[10px] text-white truncate font-medium relative z-10">
                          {t.nombre} ({t.progreso}%)
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

            </div>
          </div>

        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-white">
          <span className="text-4xl mb-3">📁</span>
          <h2 className="text-xl font-bold text-slate-800 mb-2">No hay ningún proyecto activo</h2>
          <p className="text-slate-500 mb-4 text-sm">Crea o selecciona un proyecto para visualizar el diagrama Gantt.</p>
          <button
            onClick={() => setMostrarModalProyecto(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-semibold shadow"
          >
            + Crear Proyecto
          </button>
        </div>
      )}

      {/* Modal Nuevo Proyecto */}
      {mostrarModalProyecto && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl border border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Nuevo Proyecto</h3>
            <form onSubmit={crearProyecto} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre del Proyecto</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Proyecto Integrado Tecnored"
                  value={nuevoNombreProyecto}
                  onChange={(e) => setNuevoNombreProyecto(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Encargado Principal</label>
                <input
                  type="text"
                  placeholder="Ej: Francisco Ruiz"
                  value={nuevoEncargadoProyecto}
                  onChange={(e) => setNuevoEncargadoProyecto(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMostrarModalProyecto(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded font-medium hover:bg-blue-500">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nueva Tarea */}
      {mostrarModalTarea && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full shadow-2xl border border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Agregar Tarea o Fase</h3>
            <form onSubmit={agregarTarea} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">MSP ID</label>
                  <input
                    type="text"
                    required
                    value={nuevaTarea.msp_id || ''}
                    onChange={(e) => setNuevaTarea({ ...nuevaTarea, msp_id: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono"
                    placeholder="1.1"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo</label>
                  <select
                    value={nuevaTarea.tipo || 'task'}
                    onChange={(e) => setNuevaTarea({ ...nuevaTarea, tipo: e.target.value as any })}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  >
                    <option value="project">Fase Principal (Summary)</option>
                    <option value="task">Tarea Normal</option>
                    <option value="milestone">Hito</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Levantamiento y diseño funcional"
                  value={nuevaTarea.nombre || ''}
                  onChange={(e) => setNuevaTarea({ ...nuevaTarea, nombre: e.target.value })}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Encargado</label>
                  <input
                    type="text"
                    placeholder="Ej: Mauro Huerta"
                    value={nuevaTarea.encargado || ''}
                    onChange={(e) => setNuevaTarea({ ...nuevaTarea, encargado: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">% Progreso</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={nuevaTarea.progreso || 0}
                    onChange={(e) => setNuevaTarea({ ...nuevaTarea, progreso: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha Inicio</label>
                  <input
                    type="date"
                    required
                    value={nuevaTarea.fecha_inicio || ''}
                    onChange={(e) => setNuevaTarea({ ...nuevaTarea, fecha_inicio: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha Fin</label>
                  <input
                    type="date"
                    required
                    value={nuevaTarea.fecha_fin || ''}
                    onChange={(e) => setNuevaTarea({ ...nuevaTarea, fecha_fin: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMostrarModalTarea(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 text-sm bg-emerald-600 text-white rounded font-medium hover:bg-emerald-500">
                  Guardar Tarea
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}