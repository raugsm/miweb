# acceso_entrar — el login de la web

La web ya no le pide la contraseña a Supabase directamente: se la pasa a esta
función, y la función se la pasa a Supabase.

## Lo que hay que entender antes de tocar esto

**La puerta directa de Supabase no se puede cerrar.** La app de escritorio la
usa (`/auth/v1/token?grant_type=password`) y la clave pública la tiene
cualquiera. Así que esta función **no impide** que alguien pruebe contraseñas
por fuera de la web.

Lo que sí hace, y es lo que sirve: cuenta los fallos y, pasado el tope,
**bloquea la cuenta en el origen**. Ese bloqueo cae sobre la cuenta, no sobre
el camino, así que cierra las dos puertas a la vez. Comprobado: con la cuenta
bloqueada, la puerta directa responde `user_banned` incluso con la contraseña
correcta.

## Los números

| | |
|---|---|
| Ventana en la que se cuentan los fallos | 15 min |
| Fallos con el mismo correo antes de bloquear | 8 |
| Fallos desde la misma conexión | 25 |
| Cuánto dura el bloqueo | 15 min |

El bloqueo es **corto a propósito**. Si durara horas, cualquiera podría dejar
sin trabajar a un técnico tecleando mal su correo ocho veces. Quince minutos
frena a un robot (le corta el ritmo a nada) y a una persona apenas la molesta.

Una entrada buena limpia el contador: el técnico que se equivocó seis veces,
entró bien y más tarde se vuelve a equivocar, arranca de cero.

## Anti-robot

Si la variable `TURNSTILE_SECRET` está puesta, se exige el token de Cloudflare
Turnstile y se valida contra Cloudflare. Si no está puesta, no se exige nada:
así la función ya quedó lista y solo falta cargar la clave.

Para activarlo hacen falta dos cosas:
1. La clave secreta acá, como secreto de la función (`TURNSTILE_SECRET`).
2. La clave pública en la web, para dibujar el recuadro.

## Lo que NO hace

No dice nunca si un correo tiene cuenta o no: la respuesta es la misma para
"no existe" y para "contraseña equivocada". Si no, esta pantalla sería una
forma cómoda de averiguar quiénes son los clientes.
