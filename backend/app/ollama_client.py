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
    "embedding_model": settings.get("embedding_model", ""),
  }


async def get_model_health() -> dict[str, Any]:
  settings = model_settings()
  provider = settings["provider"]
  base_url = settings["base_url"]
  model = settings["model"]
  embedding_model = settings["embedding_model"]

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
      "embedding_online": False,
      "provider": provider,
      "model": model,
      "embedding_model": embedding_model,
      "base_url": base_url,
      "message": "Endpoint local no responde. Revisa Ollama/LM Studio.",
    }

  # Ollama tag names may carry a ":latest" suffix the settings omit.
  def present(name: str) -> bool:
    return bool(name) and any(candidate == name or candidate.split(":")[0] == name for candidate in names)

  has_model = present(model)
  has_embedding = present(embedding_model)
  if has_model:
    message = "Modelo local listo."
  else:
    message = f"Endpoint activo; falta el modelo {model}."
  return {
    "online": has_model,
    "embedding_online": has_embedding,
    "provider": provider,
    "model": model,
    "embedding_model": embedding_model,
    "base_url": base_url,
    "message": message,
  }


async def _chat(messages: list[dict[str, str]], as_json: bool) -> str:
  settings = model_settings()
  async with httpx.AsyncClient(timeout=60.0) as client:
    if settings["provider"] == "lmstudio":
      body: dict[str, Any] = {
        "model": settings["model"],
        "messages": messages,
        "temperature": 0.2,
      }
      if as_json:
        body["response_format"] = {"type": "json_object"}
      response = await client.post(f"{settings['base_url']}/v1/chat/completions", json=body)
      response.raise_for_status()
      return response.json().get("choices", [{}])[0].get("message", {}).get("content", "")
    body = {
      "model": settings["model"],
      "stream": False,
      "messages": messages,
      "options": {"temperature": 0.2, "num_ctx": 8192},
    }
    if as_json:
      body["format"] = "json"
    response = await client.post(f"{settings['base_url']}/api/chat", json=body)
    response.raise_for_status()
    return response.json().get("message", {}).get("content", "")


async def ask_model_json(system_prompt: str, user_prompt: str) -> dict[str, Any]:
  content = await _chat(
    [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
    as_json=True,
  )
  return parse_json_object(content)


async def ask_model_text(system_prompt: str, user_prompt: str) -> str:
  content = await _chat(
    [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
    as_json=False,
  )
  # Strip any <think> blocks reasoning models may emit.
  return re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()


def parse_json_object(content: str) -> dict[str, Any]:
  cleaned = re.sub(r"```(?:json)?|```", "", content).strip()
  try:
    return json.loads(cleaned)
  except json.JSONDecodeError:
    match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
    if not match:
      raise
    return json.loads(match.group(0))
