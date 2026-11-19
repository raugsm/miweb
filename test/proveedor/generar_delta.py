# Genera el delta de sop_proveedor (solo las funciones que cambian + los permisos) entre una copia de lo que está en prod
# y la fuente 20261118-proveedor-compra.sql. Después se valida con: BASE=<base> DELTA=<salida> node valida_arreglos.mjs
# Uso: python -I -X utf8 generar_delta.py <base.sql> <salida.sql> "<qué trae>"   (archivos dentro de la carpeta de propuestas)
import os, re, sys

D = os.environ.get('PROPUESTAS_DIR', r'C:\private\AriTool_Recursos\db-diagramas\propuestas')
BASE, SALIDA, TITULO = sys.argv[1], sys.argv[2], sys.argv[3]
nuevo = open(os.path.join(D, '20261118-proveedor-compra.sql'), encoding='utf-8').read()
viejo = open(os.path.join(D, BASE), encoding='utf-8').read()
# Bloque = desde «create or replace function» hasta la línea que cierra el cuerpo ($$; o end $$;), sea al final de línea o sola.
pat = re.compile(r'(?:^--[^\n]*\n)*create or replace function (sop_proveedor\.\w+)\(.*?(?:\n(?:end )?\$\$;|\$\$;)\n', re.S | re.M)
bloques = lambda t: {m.group(1): m.group(0) for m in pat.finditer(t)}
bn, bv = bloques(nuevo), bloques(viejo)
norm = lambda x: re.sub(r'\s+', ' ', re.sub(r'(?m)^--.*$', '', x)).strip()
cambian = [k for k in bn if k not in bv or norm(bn[k]) != norm(bv[k])]
perm = nuevo[nuevo.index('-- ───────────────────────── Permisos'):nuevo.rindex('commit;')]
cab = '\n'.join([
    f'-- {SALIDA} · Ari-Web. PROPUESTA: no aplicado (espera el OK de Peter en el chat de Ari-Web).',
    f'-- {TITULO}',
    f'-- Generado desde 20261118-proveedor-compra.sql (la fuente) contra {BASE} (lo que está en prod): solo funciones que',
    f'-- cambian y los permisos. Las columnas nuevas, si hay, se agregan a mano arriba de las funciones.',
    f'-- Rollback: aplicar las mismas funciones de {BASE}.',
    'begin;', '', ''])
out = cab + '\n'.join(bn[k] for k in cambian) + '\n' + perm + 'commit;\n'
open(os.path.join(D, SALIDA), 'w', encoding='utf-8', newline='\n').write(out)
print('funciones en el delta:', len(cambian), '·', ', '.join(k.split('.')[1] for k in cambian))
