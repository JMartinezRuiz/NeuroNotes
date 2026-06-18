import os
import tempfile

_tmpdb = os.path.join(tempfile.gettempdir(), "nn_fase2_verify.db")
for _suffix in ("", "-wal", "-shm"):
    _p = _tmpdb + _suffix
    if os.path.exists(_p):
        os.remove(_p)
os.environ["NEURONOTES_DB_PATH"] = _tmpdb
os.environ.pop("NEURONOTES_EMBED_MODEL", None)

import app.database as db

results = []


def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))


db.init_database()

settings = db.get_settings()
check("settings expose embedding_model (default empty)", settings.get("embedding_model") == "", repr(settings.get("embedding_model")))

model_tag, dims, _fn = db.resolve_embedder(force=True)
check("default embedder is local hash", model_tag == "local-hash-v2" and dims == 256, f"{model_tag}/{dims}")

search = db.semantic_search_notes("memoria compartida", 5)
check("semantic search returns scored results on hash path", len(search) >= 1 and "score" in search[0], f"n={len(search)}")

mp = db.vector_memory_map()
check("vector map builds on hash path", isinstance(mp.get("nodes"), list) and mp.get("model") == "local-hash-v2", f"nodes={len(mp.get('nodes', []))} model={mp.get('model')}")

# Now configure a neural model that this Ollama cannot serve -> must fall back cleanly.
db.update_settings({"embedding_model": "qwen3.5:0.8b"})
model_tag2, dims2, _fn2 = db.resolve_embedder(force=True)
check("neural config but unavailable falls back to hash (no crash)", model_tag2 == "local-hash-v2", f"{model_tag2}/{dims2}")

search2 = db.semantic_search_notes("memoria compartida", 5)
check("search still works after neural fallback", len(search2) >= 1, f"n={len(search2)}")

rebuilt = db.rebuild_note_vectors()
check("rebuild reports a model + dimensions", "model" in rebuilt and "dimensions" in rebuilt, repr(rebuilt))

all_pass = all(ok for _, ok, _ in results)
for name, ok, extra in results:
    print(("PASS " if ok else "FAIL "), name, "::", extra)
print("RESULT:", "ALL_PASS" if all_pass else "SOME_FAIL")
