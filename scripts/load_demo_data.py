from __future__ import annotations

import json
import re
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR / "backend"))

from app.database import connect, estimate_tokens, init_database, rebuild_note_vectors  # noqa: E402


AGENTS = {
  "user": "#6b7280",
  "qwen": "#2563eb",
  "claude": "#7c3aed",
  "codex": "#16a34a",
  "chatgpt": "#ea580c",
}

PROJECTS = [
  {
    "id": "massive-project-personal-os",
    "name": "Mi sistema personal - Ejemplo",
    "goal": "Centralizar vida, rutinas, decisiones personales y contexto reusable.",
    "status": "active",
    "summary": "Ejemplo de segundo cerebro personal con habitos, decisiones, lecturas y pendientes.",
    "tags": ["personal", "rutinas", "segundo-cerebro"],
  },
  {
    "id": "massive-project-work-clients",
    "name": "Trabajo y clientes - Ejemplo",
    "goal": "Agrupar proyectos de clientes, reuniones, propuestas y decisiones operativas.",
    "status": "active",
    "summary": "Memoria de trabajo para clientes, entregables, reuniones y seguimiento comercial.",
    "tags": ["clientes", "trabajo", "operaciones"],
  },
  {
    "id": "massive-project-ai-learning",
    "name": "Aprendizaje IA - Ejemplo",
    "goal": "Registrar aprendizajes, prompts, modelos, pruebas y patrones de uso de LLMs.",
    "status": "active",
    "summary": "Notas de estudio y experimentos sobre agentes, Qwen, Codex, RAG y memoria local.",
    "tags": ["IA", "LLM", "aprendizaje"],
  },
  {
    "id": "massive-project-finance-admin",
    "name": "Finanzas y administracion - Ejemplo",
    "goal": "Mantener decisiones financieras, presupuesto, pagos y documentos importantes.",
    "status": "review",
    "summary": "Sistema de notas para control de gastos, pagos, impuestos y decisiones financieras.",
    "tags": ["finanzas", "admin", "presupuesto"],
  },
  {
    "id": "massive-project-health-energy",
    "name": "Salud y energia - Ejemplo",
    "goal": "Registrar energia, descanso, entrenamientos, alimentacion y aprendizaje personal.",
    "status": "active",
    "summary": "Bitacora de salud enfocada en patrones, rutinas y decisiones sostenibles.",
    "tags": ["salud", "rutinas", "energia"],
  },
  {
    "id": "massive-project-neuronotes-roadmap",
    "name": "Neuronotes roadmap - Ejemplo",
    "goal": "Planear producto, interfaz, MCP, datos, seguridad local e integraciones.",
    "status": "MVP",
    "summary": "Roadmap de producto para convertir Neuronotes en memoria compartida humano-LLM.",
    "tags": ["producto", "Neuronotes", "MCP"],
  },
]

NOTE_BLUEPRINTS = {
  "agent-memory-hub": [
    ("Arquitectura", "Sistema", ["Protocolo de memoria para LLMs", "Capas de contexto por agente", "Reglas de escritura canonica", "Indice local de vectores", "Revision humana de cambios", "Exportacion para Codex"]),
    ("Interfaz", "Producto", ["Vista Notion de proyectos", "Mapa 3D por temas", "Panel lateral de nota activa", "Busqueda global con filtros", "Edicion rapida sin friccion", "Estados canonicos de notas"]),
    ("MCP", "Integraciones", ["Contrato read only inicial", "Tools de busqueda por proyecto", "Writeback con memory patch", "Context compiler por presupuesto", "Permisos por agente", "Logs de actividad compartida"]),
    ("Local AI", "AI Notes", ["Qwen para clasificar notas", "Compresion local de contexto", "Sugerencia de relaciones", "Extraccion de tareas", "Normalizacion de categorias", "Fallback heuristico sin modelo"]),
    ("Privacidad", "Decisiones", ["Datos locales primero", "Exportaciones explicitas", "Separar borradores de memoria", "No enviar notas privadas", "Trazabilidad por agente", "Backups de SQLite"]),
    ("Roadmap", "Desarrollo", ["Modo captura rapida", "Plantillas de proyecto", "Importar conversaciones", "Revision por lotes", "Vista de relaciones", "Empaquetado desktop"]),
  ],
  "massive-project-personal-os": [
    ("Rutinas", "Personal", ["Rutina de manana", "Revision semanal", "Lista de compras recurrentes", "Sistema de energia", "Orden de escritorio", "Cierre del dia"]),
    ("Ideas", "Creatividad", ["Ideas para newsletter", "Preguntas para investigar", "Frases utiles", "Temas de video", "Mapa de intereses", "Experimentos personales"]),
    ("Lecturas", "Aprendizaje", ["Libro sobre enfoque", "Articulo de memoria", "Resumen de podcast", "Metodo Zettelkasten", "Notas de filosofia practica", "Citas para revisar"]),
  ],
  "massive-project-work-clients": [
    ("Clientes", "Trabajo", ["Brief cliente A", "Kickoff cliente B", "Seguimiento propuesta", "Riesgos de entrega", "Feedback de revision", "Checklist de cierre"]),
    ("Reuniones", "Operaciones", ["Minuta semanal", "Acuerdos pendientes", "Preguntas para discovery", "Decision de alcance", "Notas de llamada", "Retrospectiva interna"]),
    ("Ventas", "Comercial", ["Objeciones comunes", "Plantilla de propuesta", "Oferta por paquetes", "Pipeline semanal", "Caso de estudio", "Seguimiento post demo"]),
  ],
  "massive-project-ai-learning": [
    ("Prompts", "AI Notes", ["Prompt para resumir juntas", "Prompt para limpiar notas", "Prompt para investigar", "Prompt de code review", "Prompt de estrategia", "Prompt de memoria larga"]),
    ("Modelos", "Investigacion", ["Comparativa Qwen local", "Notas sobre embeddings", "RAG local simple", "Agentes con herramientas", "Limites de contexto", "Evaluacion de respuestas"]),
    ("Experimentos", "Desarrollo", ["Prueba de busqueda semantica", "Clasificador de categorias", "Generacion de tareas", "Memoria entre agentes", "Context pack para Codex", "Mapa de conocimiento"]),
  ],
  "massive-project-finance-admin": [
    ("Presupuesto", "Finanzas", ["Gastos fijos mensuales", "Regla de ahorro", "Categorias de gasto", "Fondo de emergencia", "Revision de suscripciones", "Plan de compras"]),
    ("Documentos", "Administracion", ["Checklist fiscal", "Polizas importantes", "Renovaciones", "Contratos guardados", "Pagos recurrentes", "Fechas limite"]),
    ("Decisiones", "Finanzas", ["Prioridad de deuda", "Meta de ahorro anual", "Compra de equipo", "Separar cuentas", "Revisar seguros", "Politica de inversiones"]),
  ],
  "massive-project-health-energy": [
    ("Energia", "Salud", ["Patrones de sueno", "Registro de cafeina", "Bloques de enfoque", "Baja energia tarde", "Descanso activo", "Senales de saturacion"]),
    ("Entrenamiento", "Salud", ["Rutina fuerza A", "Rutina movilidad", "Caminar diario", "Progreso mensual", "Recuperacion", "Equipo necesario"]),
    ("Comida", "Salud", ["Desayunos simples", "Lista base de comida", "Preparacion semanal", "Hidratacion", "Comidas que funcionan", "Compras saludables"]),
  ],
  "massive-project-neuronotes-roadmap": [
    ("Producto", "Producto", ["Inbox de capturas", "Panel de proyectos", "Navegacion lateral", "Modo enfoque de nota", "Plantillas", "Revision por lotes"]),
    ("Mapa", "Visualizacion", ["Agrupar por categorias", "Clustering de notas", "Seleccion de nodo", "Leyenda minima", "Animacion sutil", "Vista de relaciones"]),
    ("LLM", "Integraciones", ["API para agentes", "MCP estable", "Context compiler", "Reglas de writeback", "Audit trail", "Permisos por herramienta"]),
  ],
}

STATUS_BY_INDEX = ["draft", "review", "canonical", "approved"]
TYPE_BY_CATEGORY = {
  "AI Notes": "Agent Draft",
  "Decisiones": "Decision",
  "Investigacion": "Research",
  "Reuniones": "Meeting",
  "Salud": "Human Note",
  "Finanzas": "Project Note",
}


def slug(text: str) -> str:
  normalized = (
    text.encode("ascii", errors="ignore")
    .decode("ascii")
    .lower()
  )
  return re.sub(r"[^a-z0-9]+", "-", normalized).strip("-") or "item"


def upsert_project(connection: sqlite3.Connection, project: dict[str, Any], created_at: str) -> None:
  connection.execute(
    """
    INSERT INTO projects (id, name, goal, status, canonical_summary, tags, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      goal = excluded.goal,
      status = excluded.status,
      canonical_summary = excluded.canonical_summary,
      tags = excluded.tags
    """,
    (
      project["id"],
      project["name"],
      project["goal"],
      project["status"],
      project["summary"],
      json.dumps(project["tags"]),
      created_at,
    ),
  )


def upsert_note(connection: sqlite3.Connection, note: dict[str, Any]) -> None:
  connection.execute(
    """
    INSERT INTO notes (id, project_id, title, content, type, status, folder, category, created_by_agent_id, color, token_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      project_id = excluded.project_id,
      title = excluded.title,
      content = excluded.content,
      type = excluded.type,
      status = excluded.status,
      folder = excluded.folder,
      category = excluded.category,
      created_by_agent_id = excluded.created_by_agent_id,
      color = excluded.color,
      token_count = excluded.token_count
    """,
    (
      note["id"],
      note["project_id"],
      note["title"],
      note["content"],
      note["type"],
      note["status"],
      note["folder"],
      note["category"],
      note["agent_id"],
      AGENTS[note["agent_id"]],
      estimate_tokens(note["content"]),
      note["created_at"],
    ),
  )


def upsert_task(connection: sqlite3.Connection, task: dict[str, Any]) -> None:
  connection.execute(
    """
    INSERT INTO tasks (id, project_id, title, status, source_note_id, source_agent_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      project_id = excluded.project_id,
      title = excluded.title,
      status = excluded.status,
      source_note_id = excluded.source_note_id,
      source_agent_id = excluded.source_agent_id
    """,
    (
      task["id"],
      task["project_id"],
      task["title"],
      task["status"],
      task["source_note_id"],
      task["agent_id"],
      task["created_at"],
    ),
  )


def upsert_relation(connection: sqlite3.Connection, relation: dict[str, Any]) -> None:
  connection.execute(
    """
    INSERT INTO relations (id, from_type, from_id, to_type, to_id, relation_type, created_by_agent_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
    ON CONFLICT(id) DO UPDATE SET
      from_type = excluded.from_type,
      from_id = excluded.from_id,
      to_type = excluded.to_type,
      to_id = excluded.to_id,
      relation_type = excluded.relation_type,
      created_by_agent_id = excluded.created_by_agent_id,
      status = 'active'
    """,
    (
      relation["id"],
      relation["from_type"],
      relation["from_id"],
      relation["to_type"],
      relation["to_id"],
      relation["relation_type"],
      relation["agent_id"],
      relation["created_at"],
    ),
  )


def content_for(project_name: str, folder: str, category: str, topic: str, index: int) -> str:
  return f"""# {topic}

## Contexto
Esta nota de ejemplo pertenece a {project_name}. Sirve para simular una memoria real: una idea, decision, minuta o referencia que un humano y varios LLMs podrian reutilizar.

## Detalles
- Area: {folder}.
- Categoria: {category}.
- Punto principal: mantener informacion breve, enlazable y facil de buscar.
- Criterio de uso: si un agente necesita contexto, debe leer esta nota antes de responder sobre este tema.

## Para LLMs
Usar esta nota como contexto durable. Si aparece informacion nueva, proponer un memory patch en vez de sobrescribir la memoria canonica.

## Siguiente accion
Revisar si esta nota debe quedarse como borrador, pasar a revision o volverse canonica.

Referencia demo: {index:03d}.
"""


def build_notes() -> list[dict[str, Any]]:
  notes: list[dict[str, Any]] = []
  base_time = datetime(2026, 6, 1, 9, 0, tzinfo=timezone.utc)
  project_names = {project["id"]: project["name"] for project in PROJECTS}
  project_names["agent-memory-hub"] = "Agent Memory Hub"
  project_index = 0

  for project_id, groups in NOTE_BLUEPRINTS.items():
    project_index += 1
    note_index = 0
    for folder, category, topics in groups:
      for topic in topics:
        note_index += 1
        agent_id = list(AGENTS.keys())[(note_index + project_index) % len(AGENTS)]
        note_id = f"massive-note-{slug(project_id)}-{note_index:03d}"
        status = STATUS_BY_INDEX[(note_index + project_index) % len(STATUS_BY_INDEX)]
        note_type = TYPE_BY_CATEGORY.get(category, "Project Note")
        created_at = (base_time + timedelta(days=project_index, minutes=note_index * 9)).isoformat()
        notes.append(
          {
            "id": note_id,
            "project_id": project_id,
            "title": topic,
            "content": content_for(project_names[project_id], folder, category, topic, note_index),
            "type": note_type,
            "status": status,
            "folder": folder,
            "category": category,
            "agent_id": agent_id,
            "created_at": created_at,
          }
        )
  return notes


def build_tasks_and_relations(notes: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
  tasks: list[dict[str, Any]] = []
  relations: list[dict[str, Any]] = []
  notes_by_project: dict[str, list[dict[str, Any]]] = {}
  for note in notes:
    notes_by_project.setdefault(note["project_id"], []).append(note)

  for project_id, project_notes in notes_by_project.items():
    project_notes.sort(key=lambda item: item["id"])
    for index, note in enumerate(project_notes):
      if index % 3 == 0:
        task_id = f"massive-task-{slug(project_id)}-{index + 1:03d}"
        tasks.append(
          {
            "id": task_id,
            "project_id": project_id,
            "title": f"Revisar y canonizar: {note['title']}",
            "status": "open" if index % 2 == 0 else "in_progress",
            "source_note_id": note["id"],
            "agent_id": note["agent_id"],
            "created_at": note["created_at"],
          }
        )
        relations.append(
          {
            "id": f"massive-rel-task-{slug(project_id)}-{index + 1:03d}",
            "from_type": "note",
            "from_id": note["id"],
            "to_type": "task",
            "to_id": task_id,
            "relation_type": "creates_task",
            "agent_id": note["agent_id"],
            "created_at": note["created_at"],
          }
        )

      if index + 1 < len(project_notes):
        next_note = project_notes[index + 1]
        same_category = note["category"] == next_note["category"]
        relations.append(
          {
            "id": f"massive-rel-note-{slug(project_id)}-{index + 1:03d}",
            "from_type": "note",
            "from_id": note["id"],
            "to_type": "note",
            "to_id": next_note["id"],
            "relation_type": "same_topic" if same_category else "nearby_context",
            "agent_id": "qwen",
            "created_at": note["created_at"],
          }
        )

  return tasks, relations


def main() -> None:
  init_database()
  notes = build_notes()
  tasks, relations = build_tasks_and_relations(notes)
  now = datetime.now(timezone.utc).isoformat()

  with connect() as connection:
    for project in PROJECTS:
      upsert_project(connection, project, now)
    for note in notes:
      upsert_note(connection, note)
    for task in tasks:
      upsert_task(connection, task)
    for relation in relations:
      upsert_relation(connection, relation)

    connection.execute(
      """
      INSERT INTO activity_events (id, project_id, agent_id, action, created_at)
      VALUES (?, 'agent-memory-hub', 'user', ?, ?)
      ON CONFLICT(id) DO UPDATE SET action = excluded.action, created_at = excluded.created_at
      """,
      ("massive-demo-load-activity", f"cargo dataset demo masivo: {len(notes)} notas, {len(tasks)} tareas, {len(relations)} relaciones.", now),
    )
    connection.commit()

  rebuild = rebuild_note_vectors()
  result = {
    "projects_upserted": len(PROJECTS),
    "notes_upserted": len(notes),
    "tasks_upserted": len(tasks),
    "relations_upserted": len(relations),
    "vectors": rebuild,
  }
  print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
  main()
