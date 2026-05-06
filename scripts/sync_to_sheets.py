#!/usr/bin/env python3
"""
Sincroniza todos os registros do banco com a planilha Google Sheets.

Uso:
  python3 scripts/sync_to_sheets.py           -> envia todos os registros (upsert por id)
  python3 scripts/sync_to_sheets.py --reset   -> limpa a planilha antes de reenviar tudo
                                                 (requer que o Apps Script trate {"_action": "clearAll"})
"""

import json
import subprocess
import sys
import urllib.request
import time

RESET_MODE = "--reset" in sys.argv
WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbywpnMrloVqaX0eHw-nvcGXlLMf5yD7CHNC7jfl8CHA_j0R5rODeVZaVLps9Bgx-4821A/exec"

SQL = """
SELECT
  i.id,
  i.name,
  COALESCE(i.phone, ''),
  COALESCE(i.email, ''),
  c.name,
  m.name,
  COALESCE(i.indicated_by, ''),
  i.created_at,
  i.status
FROM indications i
JOIN churches c ON i.church_id = c.id
JOIN municipalities m ON i.municipality_id = m.id
ORDER BY i.created_at ASC
"""

result = subprocess.run(
    ["docker", "compose", "exec", "-T", "db",
     "psql", "-U", "postgres", "-d", "rede_evangelica",
     "-t", "-A", "-F", "\x1f", "-c", SQL],
    capture_output=True, text=True, cwd="/home/paiva/rede-guti"
)

rows = [r for r in result.stdout.strip().splitlines() if r]
total = len(rows)

if RESET_MODE:
    print("Modo --reset: enviando sinal de limpeza para a planilha...")
    clear_payload = json.dumps({"_action": "clearAll"}).encode("utf-8")
    req = urllib.request.Request(
        WEBHOOK_URL,
        data=clear_payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"  Sinal enviado (status {resp.status}). Aguardando 2s...")
    except Exception as e:
        print(f"  AVISO: erro ao enviar sinal de limpeza: {e}")
    time.sleep(2)

print(f"Enviando {total} registros...")

for i, row in enumerate(rows, 1):
    parts = row.split("\x1f")
    if len(parts) < 9:
        print(f"  [{i}/{total}] linha invalida, pulando")
        continue

    payload = {
        "id":           parts[0],
        "name":         parts[1],
        "phone":        parts[2],
        "email":        parts[3],
        "church":       {"name": parts[4]},
        "municipality": {"name": parts[5]},
        "indicatedBy":  parts[6],
        "createdAt":    parts[7],
        "status":       parts[8],
    }

    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        WEBHOOK_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"  [{i}/{total}] OK — {parts[1]}")
    except Exception as e:
        print(f"  [{i}/{total}] ERRO — {parts[1]}: {e}")

    time.sleep(0.3)

print("Concluido.")
