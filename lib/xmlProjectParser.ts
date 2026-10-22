import { TareaGantt } from '@/types/gantt'

// Exportar tareas a formato XML de Microsoft Project
export function exportToMSProjectXML(nombreProyecto: string, tareas: TareaGantt[]): string {
  const tasksXML = tareas.map((t, idx) => `
    <Task>
      <UID>${idx + 1}</UID>
      <ID>${idx + 1}</ID>
      <Name>${escapeXML(t.nombre)}</Name>
      <OutlineNumber>${t.msp_id}</OutlineNumber>
      <Start>${t.fecha_inicio}T08:00:00</Start>
      <Finish>${t.fecha_fin}T17:00:00</Finish>
      <PercentComplete>${t.progreso}</PercentComplete>
      <Milestone>${t.tipo === 'milestone' ? 1 : 0}</Milestone>
      <Summary>${t.tipo === 'project' ? 1 : 0}</Summary>
      <Contact>${escapeXML(t.encargado || '')}</Contact>
    </Task>`).join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Name>${escapeXML(nombreProyecto)}</Name>
  <Tasks>
    ${tasksXML}
  </Tasks>
</Project>`
}

function escapeXML(str: string): string {
  return str.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '&': return '&amp;'
      case '\'': return '&apos;'
      case '"': return '&quot;'
      default: return c
    }
  })
}

// Descargar archivo .xml en el navegador
export function downloadXMLFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/xml;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}