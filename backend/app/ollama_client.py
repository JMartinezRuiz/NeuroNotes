from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

from .database import get_settings

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen3:4b")


def model_settings() -> dict[str, str]:
  settings = get_settings()
  return {
    "provider": settings.get("model_provider", "ollama").lower(),
    "base_url": settings.get("model_base_url", OLLAMA_BASE_URL).rstrip("/"),
    "model": settings.get("model_name", QWEN_MODEL),
  }


async def get_model_health() -> dict[str, Any]:
  settings = model_settings()
  provider = settings["provider"]
  base_url = settings["base_url"]
  model = settings["model"]

  try:
    async with httpx.AsyncClient(timeout=3.0) as client:
      if provider == "lmstudio":
        response = await client.get(f"{base_url}/v1/models")
        response.raise_for_status()
        payload = response.json()
        names = {item.get("id", "") for item in payload.get("data", [])}
      else:
        response = await client.get(f"{base_url}/api/tags")
        response.raise_for_status()
        payload = response.json()
        names = {item.get("name", "") for item in payload.get("models", [])}
  except Exception:
    return {
      "online": False,
      "provider": provider,
      "model": model,
      "base_url": base_url,
      "message": "Endpoint local no responde. Revisa Ollama/LM Studio y la configuracion.",
    }

  has_model = model in names
  return {
    "online": has_model,
    "provider": provider,
    "model": model,
    "base_url": base_url,
    "message": "Qwen local listo." if has_model else f"Endpoint activo; no encontre el modelo {model}.",
  }


async def ask_qwen_json(system_prompt: str, user_prompt: str) -> dict[str, Any]:
  settings = model_settings()
  messages = [
    {"role": "system", "content": system_prompt},
    {"role": "user", "content": user_prompt},
  ]

  async with httpx.AsyncClient(timeout=45.0) as client:
    if settings["provider"] == "lmstudio":
      body = {
        "model": settings["model"],
        "messages": messages,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
      }
      response = await client.post(f"{settings['base_url']}/v1/chat/completions", json=body)
    else:
      body = {
        "model": settings["model"],
        "stream": False,
        "format": "json",
        "messages": messages,
        "options": {
          "temperature": 0.2,
          "num_ctx": 8192,
        },
      }
      response = await client.post(f"{settings['base_url']}/api/chat", json=body)
    response.raise_for_status()
    payload = response.json()

  if settings["provider"] == "lmstudio":
    content = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
  else:
    content = payload.get("message", {}).get("content", "")
  return parse_json_object(content)


def parse_json_object(content: str) -> dict[str, Any]:
  cleaned = re.sub(r"```(?:json)?|```", "", content).strip()
  try:
    return json.loads(cleaned)
  except json.JSONDecodeError:
    match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
    if not match:
      raise
    return json.loads(match.group(0))
