#!/usr/bin/env python3
"""
Remove duplicatas de 'indications' pelo nome (case-insensitive), mantendo o registro mais antigo.

Uso:
  python3 scripts/dedup_db.py            -> executa a limpeza
  python3 scripts/dedup_db.py --dry-run  -> mostra o que seria removido sem alterar nada
"""

import subprocess
import sys

DRY_RUN = "--dry-run" in sys.argv
SEP = "\x1f"
CWD = "/home/paiva/rede-guti"


def run_sql(sql):
    result = subprocess.run(
        ["docker", "compose", "exec", "-T", "db",
         "psql", "-U", "postgres", "-d", "rede_evangelica",
         "-t", "-A", "-F", SEP, "-c", sql],
        capture_output=True, text=True, cwd=CWD
    )
    if result.returncode != 0:
        print(f"ERRO psql:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)
    return [line.split(SEP) for line in result.stdout.strip().splitlines() if line]


# ── 1. Duplicados por nome (case-insensitive) ─────────────────────────────────
FIND_NAME_DUPS = """
SELECT d.id, d.name, d.created_at::text
FROM (
  SELECT id, name, created_at,
    ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(name)) ORDER BY created_at ASC) AS rn
  FROM indications
) d
WHERE d.rn > 1
ORDER BY LOWER(TRIM(d.name)), d.created_at;
"""

DELETE_NAME_DUPS = """
DELETE FROM indications
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(name)) ORDER BY created_at ASC) AS rn
    FROM indications
  ) t
  WHERE rn > 1
)
RETURNING id, name;
"""

print("=" * 60)
print("Checando duplicados por nome (case-insensitive)...")
name_dups = run_sql(FIND_NAME_DUPS)

if name_dups:
    print(f"\n{len(name_dups)} registro(s) duplicado(s) por nome (mantendo o mais antigo):")
    for row in name_dups:
        if len(row) >= 3:
            print(f"  [{row[2][:19]}] {row[1]}  (id: {row[0]})")
else:
    print("Nenhum duplicado de nome encontrado.")

# ── 2. Conflitos de telefone com nomes diferentes (informativo) ───────────────
FIND_PHONE_CONFLICTS = """
SELECT phone, COUNT(*) as qtd,
  STRING_AGG(name, ' | ' ORDER BY created_at) as nomes
FROM indications
WHERE phone IS NOT NULL AND phone != ''
GROUP BY phone
HAVING COUNT(DISTINCT LOWER(TRIM(name))) > 1
ORDER BY qtd DESC, phone;
"""

print("\nChecando conflitos de telefone com nomes diferentes...")
phone_conflicts = run_sql(FIND_PHONE_CONFLICTS)

if phone_conflicts:
    print(f"\n{len(phone_conflicts)} telefone(s) com nomes diferentes (requer revisao manual):")
    for row in phone_conflicts:
        if len(row) >= 3:
            print(f"  {row[0]}  ({row[1]} registros): {row[2]}")
else:
    print("Nenhum conflito de telefone encontrado.")

print("=" * 60)

# ── 3. Executar limpeza ───────────────────────────────────────────────────────
if DRY_RUN:
    print("\n[--dry-run] Nenhuma alteracao aplicada.")
    sys.exit(0)

if not name_dups:
    print("\nNada a remover. Banco ja esta limpo!")
    sys.exit(0)

print(f"\nRemovendo {len(name_dups)} duplicado(s) por nome...")
removed = run_sql(DELETE_NAME_DUPS)
print(f"Removidos: {len(removed)}")
for row in removed:
    if len(row) >= 2:
        print(f"  - {row[1]}  (id: {row[0]})")

print("\nConcluido!")
print("Proximos passos:")
print("  1. Revise os conflitos de telefone acima manualmente se necessario.")
print("  2. Execute 'python3 scripts/sync_to_sheets.py --reset' para atualizar a planilha.")
