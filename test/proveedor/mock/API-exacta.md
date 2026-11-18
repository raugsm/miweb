# API de PKGSMHUB ("GSM Theme") — contrato exacto

Fecha: 18-nov-2026. Solo se leyó el código público en GitHub; **no se hizo ninguna llamada a pkgsmhub.com**.

## 0. Fuentes y alcance

| Archivo | Qué es | Versión leída |
|---|---|---|
| `gsmtheme/gsm-theme-api-standards/PublicApiController.php` | Controlador del servidor (el que atiende la API) | `main` = commit `f25a2d7` (16-ago-2025). Abajo **[S:n]** = línea n |
| el mismo archivo, versión anterior | El mismo controlador antes de pasar la lógica a helpers | commit `fe2dba3` (28-jun-2025). Abajo **[V:n]** |
| `gsmtheme/gsm-theme-client-api/app/Http/Controllers/GsmThemeApiController.php` | Cliente de ejemplo (Laravel) con respuestas de muestra | `main` (21-jul-2026). Abajo **[C:n]** |

**Límites importantes (leer antes de confiar en este documento):**

1. La versión actual llama a helpers que **no están publicados**: `isValidIncommingApi()`, `orderCreatePermission()`,
   `createPaidOrder()`, `isBase64()`, `apiVersion()`, `calculateServicePrice()`. Todo lo que pasa dentro de ellos
   (autenticación, validación de campos, descuento del saldo) **no se puede confirmar con la versión actual**. La
   versión anterior [V] tenía esa misma lógica escrita adentro del controlador; la uso como **la mejor evidencia
   disponible** y la marco como tal.
2. **El servidor en vivo no coincide del todo con el código publicado.** Prueba: el código solo agrega `Requires.Custom`
   cuando hay campos [S:180-193], pero nuestras lecturas reales reciben `"Requires.Custom": null`. Así que la versión
   que corre en pkgsmhub es otra (más nueva o con cambios propios). Hay que tratar cada punto marcado como
   **(no confirmado)** como algo a vigilar en la primera compra real.
3. No existe ninguna acción para listar órdenes ni el historial de saldo. Las únicas acciones son las 6 de [S:26-34].

## 1. Transporte (igual para las 6 acciones)

- URL: `https://<host>/public/api/index.php` — el cliente oficial la arma así:
  ```php
  // [C:16-17]
  $parsed = parse_url($api['url']);
  $url = $parsed['scheme'] . '://' . $parsed['host'] . '/public/api/index.php';
  ```
- Método y formato: **POST form-urlencoded** con 5 campos:
  ```php
  // [C:32-39]
  ->asForm()
  ->post($url, [
      'username' => $api['username'],
      'apiaccesskey' => $api['apiaccesskey'],
      'action' => $action,
      'requestformat' => 'JSON',
      'parameters' => $jsonParams,
  ]);
  ```
- `requestformat`: el controlador **nunca lo lee** (no aparece en [S]). La respuesta es siempre JSON. Se manda
  `JSON` por costumbre.
- `action` se compara exacto y en minúsculas; cualquier otro valor da `Invalid Action`:
  ```php
  // [S:26-34]
  return match ($request->action) {
      'accountinfo' => $this->accountInfo($customer),
      'imeiservicelist' => $this->imeiServiceList($customer),
      'getimeiorder' => $this->getImeiOrder($request, $customer),
      'getimeiorderbulk' => $this->getImeiOrderBulk($request, $customer),
      'placeimeiorder' => $this->placeImeiOrder($request, $customer),
      'placebulkorder' => $this->placeBulkOrder($request, $customer),
      default => $this->error('Invalid Action'),
  };
  ```
- **Codificación de `parameters` según la acción (lo más importante):**

  | Acción | `parameters` |
  |---|---|
  | `accountinfo`, `imeiservicelist` | vacío (no se lee) |
  | `placeimeiorder` | **XML plano** (NO base64). Raíz con cualquier nombre; hijos `ID`, `QNT`, `IMEI`, `CUSTOMFIELD` en MAYÚSCULAS |
  | `getimeiorder` | **XML plano** con hijo `ID` (= REFERENCEID) |
  | `placebulkorder` | **base64( JSON )** de un objeto `{ "<nuestraRef>": {"ID":..,"QNT":..,"CUSTOMFIELD":..}, ... }` |
  | `getimeiorderbulk` | **base64( JSON )** de un objeto `{ "<nuestraRef>": {"ID": <REFERENCEID>}, ... }` |

  En todos los casos, `CUSTOMFIELD` = **base64( JSON )** de `{ "<fieldname>": "<valor>" }`.
- Ojo con el form-urlencoded: el base64 trae `+`, `/` y `=`. Si no se escapan, PHP convierte `+` en espacio y el
  servidor responde `Parameters must be encoded with base64.` Usar siempre `URLSearchParams` (o equivalente).

## 2. Envoltorio de las respuestas

Siempre **HTTP 200** y JSON (tanto éxito como error), con `apiversion` agregado al final:

```php
// [S:38-52]
private function error($message, $code = 200)
{
    $data = [
        'ERROR' => [['MESSAGE' => $message]],
        'apiversion' => apiVersion(),
    ];
    return response()
        ->json($data, $code)
        ->header('X-Powered-By', 'GSM-THEME')
        ->header('gsmtheme-api-version', apiVersion())
        ->header('Content-Type', 'application/json; charset=utf-8')
        ...
// [S:56-58]
private function success(array $data, $code = 200)
{
    $data['apiversion'] = apiVersion();
```

- Error: `{"ERROR":[{"MESSAGE":"..."}],"apiversion":"1.0"}`
- Éxito: `{"SUCCESS":[{...}],"apiversion":"1.0"}` (salvo las dos acciones bulk, ver abajo).
- `apiversion` = `"1.0"` según los ejemplos del cliente [C:89] y nuestras lecturas reales (`apiVersion()` no es público).
- **Excepción a "siempre JSON":** `placeBulkOrder` **no tiene try/catch** [S:386-451]. Si algo lanza una excepción ahí,
  responde el manejador de errores de Laravel: HTTP 500 y, como el cliente no pide `Accept: application/json`,
  probablemente una página **HTML**. (no confirmado en vivo)
- En las demás acciones, cualquier excepción se devuelve como `ERROR` con el texto crudo de la excepción
  (`catch (\Exception $e) { return $this->error($e->getMessage()); }`, p. ej. [S:379-382]). Eso significa que un error
  de base de datos puede llegar como `ERROR` con un mensaje tipo `SQLSTATE[...]`.

## 3. Autenticación y límites

- Versión actual: todo está en `isValidIncommingApi($request)` (no público) y su mensaje se devuelve tal cual:
  ```php
  // [S:17-22]
  $isApiValid = isValidIncommingApi($request);
  if(!$isApiValid['valid']){
      return $this->error($isApiValid['message']);
  }
  ```
- Versión anterior (mejor evidencia de los mensajes) [V:20-51]:
  ```php
  return $this->error('Currently server is under maintenance. Please try again later.', $apiVersion);
  return $this->error('Demo Mode ON!', $apiVersion);
  // validador: username required|email|max:60, apiaccesskey required|string|max:39, action required|string|max:30
  return $this->error($validator->errors(), $apiVersion);   // MESSAGE sería un OBJETO {"username":["..."]}
  $customer = Customer::where('email', $request->username)->where('api_key', $request->apiaccesskey)->first();
  if (!$customer) { return $this->error('Authentication Failed', $apiVersion); }
  if ($customer->status == 'Block') { return $this->error('You are Blocked!', $apiVersion); }
  if ($customer->api_allow != 'on') { return $this->error('API is inactive!', $apiVersion); }
  ```
  → Llave o usuario incorrecto: **`Authentication Failed`** (no confirmado en la versión actual). Ojo: si falta un campo,
  `MESSAGE` podría ser un objeto, no un texto.
- **Único límite de frecuencia visible:** `imeiservicelist`, una vez cada 5 minutos por cliente:
  ```php
  // [S:111-117]
  if ($customer->next_account_sync > now()) {
      $nextTime = now()->diffInMinutes($customer->next_account_sync);
      return $this->error('You are calling this API too frequently! Please try after ' . $nextTime . ' minutes.', 200);
  }
  $customer->update([ 'next_account_sync' => now()->addMinutes(5) ]);
  ```
  `accountinfo`, `placeimeiorder` y `getimeiorder*` no tienen límite en el controlador (`isValidIncommingApi` podría tener
  otro; no confirmado). Con Carbon 3 el número de minutos puede salir con decimales (no confirmado).

## 4. Acciones

### 4.1 `accountinfo`
```php
// [S:89-98]
'SUCCESS' => [[
    'MESSAGE' => 'Your Account Info',
    'AccountInfo' => [
        'credit' => round($customer->balance, 2) . ' ' . $customer->currency,
        'creditraw' => round($customer->balance, 2),
        'mail' => $customer->email,
        'currency' => $customer->currency
```
Respuesta: `{"SUCCESS":[{"MESSAGE":"Your Account Info","AccountInfo":{"credit":"12.5 USD","creditraw":12.5,"mail":"…","currency":"USD"}}],"apiversion":"1.0"}`.
Ojo con la mayúscula: `AccountInfo` aquí, `ACCOUNTINFO` en `imeiservicelist`.

### 4.2 `imeiservicelist`
Por servicio [S:141-162]:
```php
'SERVICEID' => $service->id,
'SERVICETYPE' => match (strtoupper($serviceGroup->type)) { 'SERVER' => 'SERVER', 'IMEI' => 'IMEI', 'REMOTE' => 'REMOTE', default => 'REMOTE' },
'SERVER' => match (strtoupper($serviceGroup->type)) { 'SERVER' => 1, 'IMEI' => 0, 'REMOTE' => 2, default => 2 },
'QNT' => $service->min_qnt ? 1 : 0,
'MINQNT' => $service->min_qnt,
'MAXQNT' => $service->max_qnt,
'SERVICENAME' => $service->title,
'CREDIT' => calculateServicePrice($service->id, 1, $customer->id),
'TIME' => $service->delivery_time,
'INFO' => ''
```
Campos [S:164-193]: para servicios `service_type === 'IMEI'` el **primer** input es el IMEI (sale en `CUSTOM.customname`) y
el resto va a `Requires.Custom`; para cualquier otro tipo (REMOTE, SERVER) **todos** los inputs van a `Requires.Custom`:
```php
$inputFields = ServiceInput::where('service_id', $service->id)->get();
$customFields = $service->service_type === 'IMEI' ? $inputFields->skip(1) : $inputFields;
...
'type' => 'serviceimei', 'fieldname' => $input->name, 'fieldtype' => 'text',
'description' => '', 'fieldoptions' => '', 'required' => 'on'
```
Estructura: `SUCCESS[0].LIST["<grupo>"].SERVICES["<id>"]` + `SUCCESS[0].ACCOUNTINFO` [S:198-208].
Nota: `SERVICETYPE` sale del **grupo**, pero la regla del IMEI usa `$service->service_type` (del **servicio**); en
teoría pueden no coincidir.

### 4.3 `placeimeiorder` (una orden)

**Pedido:** `parameters` = XML plano. Ejemplo para REMOTE sin campos:
```
<PARAMETERS><ID>556</ID><QNT>1</QNT></PARAMETERS>
```
Con campos (servicio 807, `Requires.Custom` = `ULTRA ID`):
```
<PARAMETERS><ID>807</ID><QNT>1</QNT><CUSTOMFIELD>eyJVTFRSQSBJRCI6InUtMTIzIn0=</CUSTOMFIELD></PARAMETERS>
                                      ^ base64('{"ULTRA ID":"u-123"}')
```
Código [S:334-351]:
```php
$params = @simplexml_load_string($request->parameters);
if (!$params || !isset($params->ID)) {
    return $this->error('Parameter or Service <ID> missing.');
}
$serviceId = (int)$params->ID;
$IMEI = null;
$fields = [];
$QNT = (int)$params->QNT ?: 1;
if(isset($params->IMEI) && !empty($params->IMEI)){
    $IMEI = (string)$params->IMEI;
}
if(!empty($params->CUSTOMFIELD)){
    $fields = (string)$params->CUSTOMFIELD;
}
$permission = orderCreatePermission($customer->id, $serviceId, $QNT, 'Api', $fields, $IMEI);
```
- `simplexml_load_string` sobre el texto crudo: si mandamos base64 o JSON, falla y responde
  `Parameter or Service <ID> missing.` El nombre de la raíz no importa; los hijos distinguen mayúsculas (`<id>` no sirve).
- `QNT` ausente o 0 → 1.
- `IMEI` ausente o vacío → `null`.
- `CUSTOMFIELD` se pasa como texto a `orderCreatePermission`. Cómo lo decodifica la versión actual: **no confirmado**.
  La versión anterior lo exigía en base64 de JSON, con las claves = `fieldname` [V:313-335]:
  ```php
  if (!$this->isBase64($customField)) { return $this->error('CUSTOMFIELD must be base64 encoded.', ...); }
  $incommingFields = json_decode(base64_decode($customField), true);
  if (json_last_error() !== JSON_ERROR_NONE) { return $this->error('CUSTOMFIELD must decode to valid JSON.', ...); }
  ...
  $requiredFields = $serviceFields->pluck('name')->toArray();
  foreach ($requiredFields as $field) {
      if (empty($incommingFields[$field])) { return $this->error("$field is required.", ...); }
  }
  ```
  y el cliente oficial lo arma igual: `base64_encode(json_encode($order['fields'] ?? ''))` [C:264].

**Respuestas:**
```php
// [S:361-375]
if($permission['permittedOrder'] === 'createPaidOrder'){
    $order = createPaidOrder($customer->id, $serviceId, $permission['price'], $QNT, $permission['fields']);
    return $this->success([ 'SUCCESS' => [[ 'MESSAGE' => 'Order received', 'REFERENCEID' => $order->id ]] ]);
}
else{
    return $this->error('Not enough balance');
}
```
- OK: `{"SUCCESS":[{"MESSAGE":"Order received","REFERENCEID":104001}],"apiversion":"1.0"}` — `REFERENCEID` es **entero**
  (el id de la orden en su base; ids globales compartidos con todos sus clientes).
- Sin saldo: `{"ERROR":[{"MESSAGE":"Not enough balance"}],...}` (versión actual, sin "!"). La versión anterior decía
  `Not enough balance!` [V:351]. Si el chequeo de saldo vive dentro de `orderCreatePermission`, el texto puede ser otro
  → comparar con `/not enough balance/i`.
- Otros rechazos (de `orderCreatePermission`, textos de [V], **no confirmados** en la versión actual):
  `Service not found or inactive.` [V:303], `IMEI field is required.` [V:309], `CUSTOMFIELD must be base64 encoded.`,
  `CUSTOMFIELD must decode to valid JSON.`, `<fieldname> is required.` [V:332], `Balance process error!` [V:342].

### 4.4 `placebulkorder` (varias órdenes)

**Pedido:** `parameters` = base64(JSON). La clave de cada ítem es **nuestra referencia**; el servidor solo la usa para
indexar la respuesta (no la guarda). Cliente oficial [C:261-265]:
```php
foreach($orders as $order){
    $params[$order['id']]['ID'] = $order['api_server_id'];
    $params[$order['id']]['QNT'] = $order['qnt'];
    $params[$order['id']]['CUSTOMFIELD'] = base64_encode(json_encode($order['fields'] ?? ''));
}
// y en intGsmThemeApi [C:19]:  $jsonParams = $para ? base64_encode(json_encode($para)) : '';
```
Servidor [S:388-446]:
```php
if(!isset($request->parameters) && empty($request->parameters)){ return $this->error('Parameters required for bulk orders.'); }
if (!isBase64($encodedParams)) { return $this->error('Parameters must be encoded with base64.'); }
$parameters = json_decode(base64_decode($encodedParams), true);
if (json_last_error() !== JSON_ERROR_NONE) { return $this->error('Parameters must be a valid JSON.'); }
if (!is_array($parameters)) { return $this->error('Parameters must be a valid JSON array.'); }
foreach ($parameters as $refId => $orderRequest) {
    $serviceId = $orderRequest['ID'] ?? null;
    $qnt    = $orderRequest['QNT'] ?? 1;
    $fields = $orderRequest['CUSTOMFIELD'] ?? [];
    if (!$serviceId) { $bulkReturn['SUCCESS'][$refId] = ['status' => 'error', 'message' => 'Missing targeted service id.']; continue; }
    $permission = orderCreatePermission($customer->id, $serviceId, $qnt, 'Api', $fields);   // ¡sin IMEI!
    if (!$permission['permitted']) { $bulkReturn['SUCCESS'][$refId] = ['status' => 'error', 'message' => $permission['message']]; continue; }
    if ($permission['permittedOrder'] === 'createPaidOrder') {
        $order = createPaidOrder(...);
        $bulkReturn['SUCCESS'][$refId] = ['status' => 'success', 'message' => 'Order received', 'referenceid' => $order->id];
    } else {
        $bulkReturn['SUCCESS'][$refId] = ['status' => 'error', 'message' => 'Not enough balance'];
    }
}
```
**Respuesta** (ojo: `SUCCESS` es un **objeto**, no un array, y las claves internas van en **minúsculas**) [C:273-286]:
```json
{"SUCCESS":{"7":{"status":"success","message":"Order received","referenceid":4},
            "8":{"status":"error","message":"Not enough balance"}},"apiversion":"1.0"}
```
- Cada ítem se valida y cobra por separado: una respuesta bulk puede mezclar éxitos y errores.
- No acepta IMEI (no lo pasa a `orderCreatePermission`): solo sirve para servicios sin IMEI.
- Detalle de PHP: si nuestras claves son exactamente `0,1,…,n-1` en orden, `json_encode` devuelve `SUCCESS` como
  **array** `[…]`; con cualquier otra clave, como objeto. Usar claves no numéricas (p. ej. `"AT-…"`) para que siempre
  sea objeto.
- Sin try/catch: una excepción aquí da HTTP 500/HTML (ver §2), posiblemente después de cobrar algunos ítems.

### 4.5 `getimeiorder` (una orden)

**Pedido:** `<PARAMETERS><ID>104001</ID></PARAMETERS>` (XML plano, `ID` = REFERENCEID).
```php
// [S:221-245]
$params = simplexml_load_string($request->parameters);
if (!$params || !isset($params->ID)) { return $this->error('Parameter required.'); }
$order = CustomerOrder::where('customer_id', $customer->id)->find((int)$params->ID);
if (!$order) { return $this->error('Order ID not found!'); }
$statusMap = [ 'Success' => 4, 'Rejected' => 3, 'In Process' => 1, 'Waiting Action' => 0 ];
$status = $statusMap[$order->service_status] ?? 0;
return $this->success([ 'SUCCESS' => [[ 'STATUS' => $status, 'CODE' => $order->service_comments ]] ]);
```
- OK: `{"SUCCESS":[{"STATUS":4,"CODE":"User: … | Pass: …"}],"apiversion":"1.0"}` — `STATUS` entero, sin `MESSAGE`.
- `CODE` = comentario de la orden **en cualquier estado** (puede ser `null` o texto mientras espera).
- **Referencia inexistente (o de otro cliente): `{"ERROR":[{"MESSAGE":"Order ID not found!"}],"apiversion":"1.0"}`.**
- Sin `@` delante de `simplexml_load_string`: si mandamos algo que no es XML, Laravel convierte el warning en excepción y
  llega como `ERROR` con el texto `simplexml_load_string(): Entity: line 1: parser error : …` (no confirmado en vivo).

### 4.6 `getimeiorderbulk` (varias órdenes)

**Pedido:** `parameters` = base64(JSON) de `{ "<nuestraRef>": {"ID": <REFERENCEID>}, ... }` [C:314-316]:
```php
foreach($orders as $order){ $params[$order['id']]['ID'] = $order['referenceid']; }
```
Servidor [S:257-318] (mismas 4 validaciones de base64/JSON que `placebulkorder`), por ítem:
```php
$order = CustomerOrder::where('customer_id', $customer->id)->where('id', $para['ID'])->first();
if($order){
    if($order->service_status == 'Success'){        ... ['STATUS' => 4, 'CODE' => $order->service_comments]
    elseif($order->service_status == 'Rejected'){   ... ['STATUS' => 3, 'CODE' => $order->service_comments]
    elseif($order->service_status == 'In Process'){ ... ['STATUS' => 1, 'CODE' => '']
    else{                                           ... ['STATUS' => 0, 'CODE' => '']
}
else{
    $bulkReturn[$refId]['SUCCESS'][] = [ 'STATUS' => 0, 'CODE' => '' ];
}
```
**Respuesta** (sin envoltorio `SUCCESS` de primer nivel; nuestras claves van arriba) [C:324-341]:
```json
{"7":{"SUCCESS":[{"STATUS":4,"CODE":"Done! Send your next order"}]},
 "8":{"SUCCESS":[{"STATUS":0,"CODE":""}]},"apiversion":"1.0"}
```
- **Referencia inexistente → `{"SUCCESS":[{"STATUS":0,"CODE":""}]}`, idéntico a "esperando".** El bulk NO sirve para
  saber si una orden existe; para eso, `getimeiorder` (da `Order ID not found!`).
- Si un ítem no trae `ID`, toda la llamada falla con `ERROR` (`Undefined array key "ID"`, texto de PHP; no confirmado).

## 5. Estados de la orden

| `service_status` (interno) | STATUS | CODE en `getimeiorder` | CODE en `getimeiorderbulk` |
|---|---|---|---|
| `Waiting Action` (o cualquier valor desconocido) | 0 | comentario (suele ser `null`) | `""` |
| `In Process` | 1 | comentario | `""` |
| `Rejected` | 3 | comentario = motivo | comentario |
| `Success` | 4 | comentario = **la entrega** (cuenta) | comentario |

No hay STATUS 2. El formato de la entrega (`User: … | Pass: …`) lo escribe el proveedor a mano o su integración:
**no hay contrato**, puede traer otro texto, HTML o saltos de línea (no confirmado; la única muestra real es la compra
manual en la web). Según [V:374], una orden nace `Waiting Action`, o directamente `Success` si el servicio es de
inventario (`process_type === 'Inventory'`), lo que explicaría la entrega en ~10 s.

## 6. Saldo: cobro y devolución

- **Se cobra al crear la orden**, dentro de la misma llamada a `placeimeiorder`/`placebulkorder`. La versión actual lo
  hace en `createPaidOrder()` (no público; el nombre lo indica). La versión anterior lo muestra explícito [V:349-410]:
  ```php
  $balanceProcess = PriceHelper::balanceProcess($price, $customer, $service);
  if(!$balanceProcess){ return $this->error('Not enough balance!', $version, 400); }
  // Decrement balance
  Customer::find($customer->id)->decrement('balance', $price);
  ... CustomerOrder::create([... 'invoice_status' => 'paid', 'service_price' => $price, 'service_status' => ... 'Waiting Action' ...]);
  InsertHelper::insertStatement($customer, 'Place Order (Api)', 'Debit', $order->service_price, ...);
  InsertHelper::customerOrderEmailNotification(...);
  // Instant API Process
  if($service->process_type == 'Api'){ InstantApiSupportHelper::apiProcess($service->id, $order->id); }
  ```
  Consecuencias: (a) el cobro ocurre **antes** de mandar correos y de llamar al proveedor de ellos, todo dentro del mismo
  `try`; si algo de eso falla, la respuesta es un `ERROR` con el texto de la excepción **aunque la orden ya esté cobrada**.
  (b) Si el servicio es de tipo `Api`, el servidor llama a su propio proveedor **antes de contestarnos** → la respuesta
  puede tardar o cortarse con la orden ya cobrada.
- Precio: `ApiHelper::calculatePrice($service->id, $customer->id, $quantity)` [V:338] → depende de la cantidad (supongo
  costo × QNT; no confirmado). `MINQNT`/`MAXQNT` **no se validaban** en [V]; en la versión actual no se sabe.
- **Devolución al rechazar: no está en este código** (la hace el panel del proveedor al pasar la orden a `Rejected`).
  Lo confirma solo la observación de Peter (17-nov: "el proveedor sí devuelve el saldo cuando rechaza").

## 7. Duplicados e idempotencia

- **No hay ninguna protección.** Ni el controlador actual ni [V] buscan pedidos repetidos; cada `placeimeiorder` válido
  crea y cobra una orden nueva.
- **No se puede mandar una referencia propia que el servidor guarde.** En `placeimeiorder` no hay campo para eso. En
  `placebulkorder` la clave del ítem (`$refId`) solo se usa para armar la respuesta; `createPaidOrder` no la recibe.
- Por eso: **si `placeimeiorder` no contesta (timeout, socket cortado, HTML, `ERROR` con texto desconocido), NO
  reintentar**: la orden puede existir y estar cobrada. Formas de comprobarlo con la API:
  1. `accountinfo.creditraw` antes y después (baja = se cobró). Con un solo pedido en vuelo a la vez es concluyente.
  2. `getimeiorder` por id, probando los ids siguientes al último REFERENCEID conocido: los de otros clientes dan
     `Order ID not found!`, los nuestros responden. No usar el bulk para esto (inexistente = STATUS 0). Los ids son
     globales: cuántos probar depende del volumen del proveedor (no confirmado).
- Errores "limpios" (salen antes del cobro según [S]/[V]): `Authentication Failed`, `Invalid Action`,
  `Parameter or Service <ID> missing.`, `Not enough balance`, `Service not found or inactive.`, `IMEI field is required.`,
  `CUSTOMFIELD must …`, `<campo> is required.`, `Balance process error!`. Cualquier otro texto = **en duda**.

## 8. Qué mandar para un servicio REMOTE (alquiler)

- Sin `Requires.Custom` (p. ej. 556): `<PARAMETERS><ID>556</ID><QNT>1</QNT></PARAMETERS>`. **No mandar IMEI ni
  CUSTOMFIELD.** El IMEI solo se exige cuando `service_type === 'IMEI'` [V:307]; para REMOTE no hay inputs que llenar
  [S:165]. `QNT` puede omitirse (vale 1).
- Con `Requires.Custom` (p. ej. `ULTRA ID`): agregar `<CUSTOMFIELD>` = base64('{"ULTRA ID":"…"}'). La clave es el
  `fieldname` exacto. Valor vacío o `"0"` cuenta como faltante (`empty()` de PHP) → `ULTRA ID is required.`
- En bulk lo mismo: `{"AT-1":{"ID":556,"QNT":1}}` (CUSTOMFIELD opcional; el cliente oficial manda `base64('""')`
  cuando no hay campos).

## 9. Lo que NO se pudo confirmar con el código

1. Mensajes de autenticación de la versión actual (`isValidIncommingApi` no es público). Se asume `Authentication Failed`.
2. Cómo valida hoy `orderCreatePermission` (IMEI, CUSTOMFIELD, campos requeridos, QNT/MINQNT/MAXQNT, servicio
   inactivo) y su texto exacto de "sin saldo". Se asume igual a [V].
3. Que `createPaidOrder` descuente el saldo (lo indica el nombre y [V], no el código actual).
4. La devolución al rechazar (no está en el código público; solo la observación de Peter).
5. El formato de `CODE` en una entrega real por API.
6. Límites de frecuencia aparte de los 5 minutos de `imeiservicelist`, y si hay protección por IP o WAF delante
   (una página HTML/Cloudflare con HTTP 200 o 5xx es posible).
7. La versión que corre en vivo difiere de la publicada (ver `Requires.Custom: null`, §0).

## 10. Cómo lo imita `mock.mjs`

Mismo transporte, mismos textos y formas de esta guía, HTTP 200 en errores. Donde el código no es público usa lo de
[V]. Diferencias deliberadas: `QNT < 1` se trata como 1; precio = costo × QNT; el reembolso se aplica cuando la orden
pasa a `Rejected`. Controles en `POST /__control` (ver el comentario de `aplicarControl()` en `mock.mjs`).
