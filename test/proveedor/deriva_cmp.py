# Compara las funciones de sop_proveedor en prod (solo lectura) con las armadas en PGlite por deriva.mjs.
# Uso: python -I -X utf8 deriva_cmp.py C:/Users/peter/.claude/skills/ari-web/scripts/sql_api.py deriva.json
import json, os, re, sys, subprocess
Q = sys.argv[1]; local = json.load(open(sys.argv[2], encoding='utf-8'))   # Q = ruta a sql_api.py
names = local['nombres']
q = ("select json_agg(json_build_object('f', p.proname, 'args', pg_get_function_identity_arguments(p.oid), 'def', pg_get_functiondef(p.oid))) "
     "from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'sop_proveedor' and p.proname = any(array[" + ",".join("'" + x + "'" for x in names) + "]);")
out = subprocess.run([sys.executable, '-I', '-X', 'utf8', Q], input=q, capture_output=True, text=True, encoding='utf-8').stdout
prod = json.loads(out.splitlines()[0])['json_agg']
norm = lambda d: re.sub(r'\s+', ' ', d).strip()
L = {(x['f'], x['args']): norm(x['def']) for x in local['funcs']}
P = {(x['f'], x['args']): norm(x['def']) for x in prod}
dist = [k for k in L if k in P and L[k] != P[k]]
falta = [k for k in L if k not in P]
sobra = [k for k in P if k not in L]
print('archivo:', len(L), '· prod:', len(P), '· iguales:', sum(1 for k in L if P.get(k) == L[k]), '· distintas:', [k[0] for k in dist], '· faltan en prod:', [k[0] for k in falta], '· solo en prod:', [k[0] for k in sobra])
