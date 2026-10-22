'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Proyecto, TareaGantt } from '@/types/gantt'
import { exportToMSProjectXML, downloadXMLFile } from '@/lib/xmlProjectParser'

export default function GanttApp() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState<Proyecto | null>(null)
  const [tareas, setTareas] = useState<TareaGantt[]>([])

  // Estado seguro para la fecha actual de "HOY" (evita errores de SSR en Next.js)
  const [hoyUtcMs, setHoyUtcMs] = useState<number>(Date.UTC(2026, 9, 21, 12, 0, 0))

  // Modales Proyecto
  const [mostrarModalProyecto, setMostrarModalProyecto] = useState(false)
  const [nuevoNombreProyecto, setNuevoNombreProyecto] = useState('')
  const [nuevoEncargadoProyecto, setNuevoEncargadoProyecto] = useState('')
  const [nuevaFechaInicioProj, setNuevaFechaInicioProj] = useState('2026-10-01')
  const [nuevaFechaFinProj, setNuevaFechaFinProj] = useState('2026-12-31')

  // Modales Tarea
  const [mostrarModalTarea, setMostrarModalTarea] = useState(false)
  const [nuevaTarea, setNuevaTarea] = useState<Partial<TareaGantt>>({
    msp_id: '1.1',
    nombre: '',
    fecha_inicio: '2026-10-05',
    fecha_fin: '2026-10-12',
    progreso: 0,
    tipo: 'task',
    encargado: '',
    dependencias: '',
  })

  // Estado para el Arrastre de Conectores (Drag and Drop interactivo global)
  const [tareaOrigenId, setTareaOrigenId] = useState<number | null>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)

  // Asignar fechas seguras en cliente al montar el componente
  useEffect(() => {
    const hoyReal = new Date()
    setHoyUtcMs(
      Date.UTC(
        hoyReal.getFullYear(),
        hoyReal.getMonth(),
        hoyReal.getDate(),
        12, 0, 0
      )
    )

    const fechaLocal = (fecha: Date) => {
      const anio = fecha.getFullYear()
      const mes = String(fecha.getMonth() + 1).padStart(2, '0')
      const dia = String(fecha.getDate()).padStart(2, '0')
      return `${anio}-${mes}-${dia}`
    }

    const hoyStr = fechaLocal(hoyReal)
    const fechaFin = new Date(hoyReal)
    fechaFin.setDate(fechaFin.getDate() + 7)
    const finStr = fechaLocal(fechaFin)

    setNuevaTarea((prev) => ({
      ...prev,
      fecha_inicio: prev.fecha_inicio || hoyStr,
      fecha_fin: prev.fecha_fin || finStr,
    }))
  }, [])

  // Cargar proyectos
  const cargarProyectos = async () => {
    const { data, error } = await supabase.from('proyectos').select('*').order('id', { ascending: true })
    if (!error && data) {
      setProyectos(data)
      if (data.length > 0 && !proyectoSeleccionado) {
        setProyectoSeleccionado(data[0])
      }
    }
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
      .insert([{
        nombre: nuevoNombreProyecto,
        encargado: nuevoEncargadoProyecto,
        fecha_inicio: nuevaFechaInicioProj,
        fecha_fin: nuevaFechaFinProj,
      }])
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
      dependencias: nuevaTarea.dependencias || '',
    }

    const { data, error } = await supabase
      .from('tareas')
      .insert([payload])
      .select()

    if (error) {
      console.error('Error al agregar tarea:', error)
      alert('No se pudo guardar la tarea. Revisa la consola.')
      return
    }

    if (data && data.length > 0) {
      setTareas((prev) =>
        [...prev, data[0]].sort((a, b) =>
          a.msp_id.localeCompare(b.msp_id, undefined, { numeric: true })
        )
      )
      setMostrarModalTarea(false)
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

  // Actualizar dependencia en Supabase al conectar
  const conectarTareas = async (idHijo: number, idPadreMsp: string) => {
    const tareaHija = tareas.find(t => t.id === idHijo)
    if (!tareaHija) return

    const depsActuales = tareaHija.dependencias ? tareaHija.dependencias.split(',').map(s => s.trim()) : []
    if (depsActuales.includes(idPadreMsp)) return

    const nuevasDeps = [...depsActuales, idPadreMsp].join(', ')

    const { error } = await supabase
      .from('tareas')
      .update({ dependencias: nuevasDeps })
      .eq('id', idHijo)

    if (!error) {
      setTareas(tareas.map(t => t.id === idHijo ? { ...t, dependencias: nuevasDeps } : t))
    }
  }

  // Eliminar dependencia específica al hacer doble clic en la línea
  const desconectarTareas = async (idHijo: number, idPadreMsp: string) => {
    const tareaHija = tareas.find(t => t.id === idHijo)
    if (!tareaHija || !tareaHija.dependencias) return

    const depsActuales = tareaHija.dependencias.split(',').map(s => s.trim())
    const nuevasDeps = depsActuales.filter(dep => dep !== idPadreMsp).join(', ')

    const { error } = await supabase
      .from('tareas')
      .update({ dependencias: nuevasDeps })
      .eq('id', idHijo)

    if (!error) {
      setTareas(tareas.map(t => t.id === idHijo ? { ...t, dependencias: nuevasDeps } : t))
    }
  }

  // Exportar XML
  const handleExportarXML = () => {
    if (!proyectoSeleccionado) return
    const xmlContent = exportToMSProjectXML(proyectoSeleccionado.nombre, tareas)
    downloadXMLFile(`${proyectoSeleccionado.nombre.replace(/\s+/g, '_')}_Gantt.xml`, xmlContent)
  }

  // --- MOTOR DE FECHAS 100% INMUNE A ZONAS HORARIAS (UTC MEDIODÍA) ---
  const fechaToUtcMs = (fechaStr?: string) => {
    if (!fechaStr) return Date.UTC(2026, 9, 1, 12, 0, 0)
    const partes = fechaStr.split('T')[0].split('-')
    if (partes.length !== 3) return Date.UTC(2026, 9, 1, 12, 0, 0)
    const year = parseInt(partes[0], 10)
    const month = parseInt(partes[1], 10) - 1
    const day = parseInt(partes[2], 10)
    return Date.UTC(year, month, day, 12, 0, 0)
  }

  const unDiaMs = 24 * 60 * 60 * 1000

  const inicioProjMs = fechaToUtcMs(proyectoSeleccionado?.fecha_inicio || '2026-10-01')
  const finProjMs = fechaToUtcMs(proyectoSeleccionado?.fecha_fin || '2026-12-31')

  const totalDias = Math.max(1, Math.round((finProjMs - inicioProjMs) / unDiaMs) + 1)

  const diasTimeline = Array.from({ length: totalDias }, (_, i) => {
    const dMs = inicioProjMs + (i * unDiaMs)
    return new Date(dMs)
  })

  // Agrupar días por Meses para la cabecera superior
  const mesesTimeline: { nombreMes: string; span: number }[] = []
  let mesActual = ''
  let contadorDiasMes = 0

  diasTimeline.forEach((d) => {
    const nombreMesStr = d.toLocaleString('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    const nombreMesCap = nombreMesStr.charAt(0).toUpperCase() + nombreMesStr.slice(1)
    if (nombreMesCap !== mesActual) {
      if (mesActual !== '') {
        mesesTimeline.push({ nombreMes: mesActual, span: contadorDiasMes })
      }
      mesActual = nombreMesCap
      contadorDiasMes = 1
    } else {
      contadorDiasMes++
    }
  })
  if (mesActual !== '') {
    mesesTimeline.push({ nombreMes: mesActual, span: contadorDiasMes })
  }

  // Calcular posición y ancho de barras en píxeles (32px por día)
  const calcularPosicionBarra = (inicioStr: string, finStr: string) => {
    const inicioMs = fechaToUtcMs(inicioStr)
    const finMs = fechaToUtcMs(finStr)

    const offsetDias = Math.round((inicioMs - inicioProjMs) / unDiaMs)
    const duracionDias = Math.max(1, Math.round((finMs - inicioMs) / unDiaMs) + 1)

    return {
      left: offsetDias * 32,
      width: duracionDias * 32,
    }
  }

  // Cálculo exacto de la línea de "HOY" utilizando el estado seguro del cliente
  const offsetHoyDias = Math.round((hoyUtcMs - inicioProjMs) / unDiaMs)
  const posicionHoyPx = offsetHoyDias * 32 + 16

  const formatearFechaChilena = (fechaStr?: string) => {
    if (!fechaStr) return 'Sin fecha'
    const partes = fechaStr.split('T')[0].split('-')
    if (partes.length !== 3) return fechaStr
    const [yyyy, mm, dd] = partes
    return `${dd}-${mm}-${yyyy}`
  }

  // Efecto global para manejar el movimiento y soltado del ratón al arrastrar conectores
  useEffect(() => {
    if (tareaOrigenId === null) return

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const ganttContainer = document.getElementById('gantt-timeline-container')
      if (!ganttContainer) return
      const rect = ganttContainer.getBoundingClientRect()
      
      setMousePos({
        x: e.clientX - rect.left + ganttContainer.scrollLeft,
        y: e.clientY - rect.top + ganttContainer.scrollTop
      })
    }

    const handleGlobalMouseUp = () => {
      setTareaOrigenId(null)
      setMousePos(null)
    }

    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [tareaOrigenId])

  const registrarDestino = (tareaDestinoId: number) => {
    if (tareaOrigenId !== null && tareaOrigenId !== tareaDestinoId) {
      const tareaPadre = tareas.find(t => t.id === tareaOrigenId)
      if (tareaPadre) {
        conectarTareas(tareaDestinoId, tareaPadre.msp_id)
      }
    }
    setTareaOrigenId(null)
    setMousePos(null)
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans select-none">
      {/* Header */}
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
                📁 {p.nombre} ({formatearFechaChilena(p.fecha_inicio)} al {formatearFechaChilena(p.fecha_fin)})
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

      {/* Contenedor Principal */}
      {proyectoSeleccionado ? (
        <div className="flex-1 flex overflow-x-auto bg-white border-t border-slate-200">
          
          {/* PANEL IZQUIERDO: TABLA DE TAREAS */}
          <div className="w-[500px] min-w-[500px] border-r border-slate-200 flex flex-col bg-white z-10 shadow-lg">
            <div className="grid grid-cols-12 bg-slate-100 text-slate-600 font-bold text-[11px] uppercase tracking-wider border-b border-slate-200 py-2.5 px-3">
              <div className="col-span-2">MSP ID</div>
              <div className="col-span-5">Nombre de tarea</div>
              <div className="col-span-3">Encargado</div>
              <div className="col-span-1 text-center" title="Dependencias">Dep</div>
              <div className="col-span-1 text-center">✕</div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {tareas.length > 0 ? (
                tareas.map((t) => {
                  const esFase = t.tipo === 'project'
                  const nivelIndentacion = (t.msp_id.split('.').length - 1) * 12
                  return (
                    <div
                      key={t.id}
                      className={`grid grid-cols-12 items-center py-2 px-3 text-xs hover:bg-blue-50/50 transition ${
                        esFase ? 'bg-blue-50/70 font-bold text-slate-900' : 'text-slate-700'
                      }`}
                    >
                      <div className="col-span-2 font-mono text-slate-500">{t.msp_id}</div>
                      <div className="col-span-5 truncate pr-2" title={t.nombre}>
                        <span style={{ paddingLeft: `${nivelIndentacion}px` }} className="inline-block">
                          {esFase ? '📁 ' : '🔹 '}
                          {t.nombre}
                        </span>
                      </div>
                      <div className="col-span-3 text-slate-500 truncate" title={t.encargado}>
                        {t.encargado || '-'}
                      </div>
                      <div className="col-span-1 text-center font-mono text-[10px] text-amber-600 font-bold" title={t.dependencias || 'Sin dependencias'}>
                        {t.dependencias || '-'}
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

          {/* PANEL DERECHO: LÍNEA DE TIEMPO GANTT CON MESES Y CONECTORES INTERACTIVOS */}
          <div 
            id="gantt-timeline-container"
            className="flex-1 overflow-x-auto relative bg-slate-50"
          >
            <div className="min-w-max flex flex-col relative">
              
              {/* Fila superior: Meses */}
              <div className="bg-slate-300 border-b border-slate-300 flex text-[11px] text-slate-700 font-bold">
                <div className="flex">
                  {mesesTimeline.map((mes, idx) => (
                    <div
                      key={idx}
                      className="h-6 flex items-center justify-center border-r border-slate-400 bg-slate-200 text-slate-800 font-semibold px-2 uppercase tracking-wide text-[10px]"
                      style={{ width: `${mes.span * 32}px` }}
                    >
                      {mes.nombreMes}
                    </div>
                  ))}
                </div>
              </div>

              {/* Fila de Días y Semanas */}
              <div className="bg-slate-200 border-b border-slate-300 flex text-[10px] text-slate-600 font-semibold">
                <div className="flex">
                  {diasTimeline.map((d, idx) => {
                    const diaSemana = ['D', 'L', 'M', 'M', 'J', 'V', 'S'][d.getUTCDay()]
                    const numeroDia = d.getUTCDate()
                    const esFinSemana = d.getUTCDay() === 0 || d.getUTCDay() === 6
                    return (
                      <div
                        key={idx}
                        className={`w-8 h-6 flex flex-col items-center justify-center border-r border-slate-300 ${
                          esFinSemana ? 'bg-slate-300/60 text-slate-400' : ''
                        }`}
                      >
                        <span className="text-[9px] font-bold">{numeroDia}</span>
                        <span className="text-[8px] text-slate-500">{diaSemana}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Cuerpo del Gantt con Línea de HOY y CONECTORES SVG */}
              <div className="relative divide-y divide-slate-200">
                
                {/* SVG para dibujar las flechas conectoras permanentes y la línea activa al arrastrar */}
                <svg className="absolute inset-0 w-full h-full pointer-events-auto z-20">
                  <defs>
                    <marker
                      id="arrow"
                      viewBox="0 0 10 10"
                      refX="6"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 2 L 10 5 L 0 8 z" fill="#f97316" />
                    </marker>
                  </defs>

                  {/* Líneas de dependencias guardadas (Con doble clic para eliminar) */}
                  {tareas.map((tarea, index) => {
                    if (!tarea.dependencias) return null
                    const depIds = tarea.dependencias.split(',').map(s => s.trim())
                    
                    return depIds.map((depId) => {
                      const tareaPadre = tareas.find(t => t.msp_id === depId)
                      if (!tareaPadre) return null

                      const indexPadre = tareas.findIndex(t => t.id === tareaPadre.id)
                      if (indexPadre === -1) return null

                      const posPadre = calcularPosicionBarra(tareaPadre.fecha_inicio, tareaPadre.fecha_fin)
                      const posHija = calcularPosicionBarra(tarea.fecha_inicio, tarea.fecha_fin)

                      const x1 = posPadre.left + posPadre.width
                      const y1 = indexPadre * 36 + 18

                      const x2 = posHija.left
                      const y2 = index * 36 + 18

                      const controlPointOffset = Math.max(15, Math.abs(x2 - x1) / 2)
                      const pathData = `M ${x1} ${y1} C ${x1 + controlPointOffset} ${y1}, ${x2 - controlPointOffset} ${y2}, ${x2 - 4} ${y2}`

                      return (
                        <g key={`${tareaPadre.id}-${tarea.id}`} className="cursor-pointer group">
                          {/* Línea invisible más gruesa para facilitar el doble clic */}
                          <path
                            d={pathData}
                            fill="none"
                            stroke="transparent"
                            strokeWidth="12"
                            onDoubleClick={() => {
                              if (confirm(`¿Deseas eliminar la dependencia entre "${tareaPadre.nombre}" y "${tarea.nombre}"?`)) {
                                desconectarTareas(tarea.id, tareaPadre.msp_id)
                              }
                            }}
                          />
                          {/* Línea visible de la flecha */}
                          <path
                            d={pathData}
                            fill="none"
                            stroke="#f97316"
                            strokeWidth="2"
                            strokeDasharray="3 3"
                            markerEnd="url(#arrow)"
                            className="hover:stroke-red-500 hover:stroke-[3px] transition"
                            onDoubleClick={() => {
                              if (confirm(`¿Deseas eliminar la dependencia entre "${tareaPadre.nombre}" y "${tarea.nombre}"?`)) {
                                desconectarTareas(tarea.id, tareaPadre.msp_id)
                              }
                            }}
                          />
                        </g>
                      )
                    })
                  })}

                  {/* Línea temporal mientras se arrastra el conector */}
                  {tareaOrigenId !== null && mousePos && (() => {
                    const idxPadre = tareas.findIndex(t => t.id === tareaOrigenId)
                    if (idxPadre === -1) return null
                    const tareaP = tareas[idxPadre]
                    const posP = calcularPosicionBarra(tareaP.fecha_inicio, tareaP.fecha_fin)
                    const x1 = posP.left + posP.width
                    const y1 = idxPadre * 36 + 18
                    return (
                      <line
                        x1={x1}
                        y1={y1}
                        x2={mousePos.x}
                        y2={mousePos.y}
                        stroke="#f97316"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                      />
                    )
                  })()}
                </svg>

                {/* Línea roja vertical de HOY */}
                {offsetHoyDias >= 0 && offsetHoyDias < totalDias && (
                  <div
                    className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-10 pointer-events-none"
                    style={{ left: `${posicionHoyPx}px` }}
                  >
                    <span className="absolute -top-4 -left-3 bg-red-500 text-white text-[9px] px-1 rounded font-bold shadow">
                      HOY
                    </span>
                  </div>
                )}

                {tareas.map((t, index) => {
                  const esFase = t.tipo === 'project'
                  const { left, width } = calcularPosicionBarra(t.fecha_inicio, t.fecha_fin)

                  return (
                    <div 
                      key={t.id} 
                      className="h-9 flex items-center relative hover:bg-slate-100/60"
                    >
                      <div className="absolute inset-0 flex pointer-events-none">
                        {diasTimeline.map((_, i) => (
                          <div key={i} className="w-8 border-r border-slate-200 h-full" />
                        ))}
                      </div>

                      {/* Barra de Tarea con puntos interactivos para conectar */}
                      <div
                        className="absolute h-5 rounded flex items-center px-2 shadow-sm transition-all group cursor-pointer"
                        style={{
                          left: `${left}px`,
                          width: `${width}px`,
                          backgroundColor: esFase ? '#1e3a8a' : t.tipo === 'milestone' ? '#7c3aed' : '#0ea5e9',
                        }}
                      >
                        {/* Circulito izquierdo (Punto de llegada de dependencia) */}
                        <div 
                          onMouseUp={() => registrarDestino(t.id)}
                          className="absolute -left-1.5 w-3 h-3 bg-amber-400 border-2 border-white rounded-full shadow cursor-pointer hover:scale-125 transition z-30" 
                          title="Soltar aquí para conectar dependencia" 
                        />

                        <div
                          className="absolute left-0 top-0 bottom-0 bg-emerald-400/40 rounded-l pointer-events-none"
                          style={{ width: `${t.progreso}%` }}
                        />
                        <span className="text-[10px] text-white truncate font-medium relative z-10">
                          {t.nombre} ({t.progreso}%)
                        </span>

                        {/* Circulito derecho (Punto de partida para arrastrar la línea) */}
                        <div 
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            setTareaOrigenId(t.id)
                          }}
                          className="absolute -right-1.5 w-3 h-3 bg-amber-500 border-2 border-white rounded-full shadow cursor-grab active:cursor-grabbing hover:scale-125 transition z-30" 
                          title="Haz clic y arrastra hacia otra tarea para crear una dependencia" 
                        />
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
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Encargado Principal</label>
                <input
                  type="text"
                  placeholder="Ej: Francisco Ruiz"
                  value={nuevoEncargadoProyecto}
                  onChange={(e) => setNuevoEncargadoProyecto(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha Inicio Proyecto</label>
                  <input
                    type="date"
                    required
                    value={nuevaFechaInicioProj}
                    onChange={(e) => setNuevaFechaInicioProj(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha Fin Proyecto</label>
                  <input
                    type="date"
                    required
                    value={nuevaFechaFinProj}
                    onChange={(e) => setNuevaFechaFinProj(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  />
                </div>
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
                  placeholder="Ej: Orden de Compra / EWM"
                  value={nuevaTarea.nombre || ''}
                  onChange={(e) => setNuevaTarea({ ...nuevaTarea, nombre: e.target.value })}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
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

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Dependencia (MSP ID)</label>
                  <input
                    type="text"
                    placeholder="Ej: 1 o 1.1"
                    value={nuevaTarea.dependencias || ''}
                    onChange={(e) => setNuevaTarea({ ...nuevaTarea, dependencias: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono text-amber-600 font-bold"
                  />
                </div>
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