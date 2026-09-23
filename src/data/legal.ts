// Contenido legal de la web (lo consume src/pages/LegalPage.tsx).
//
// Objetivo: que al revisar el sitio se vea un negocio serio y legítimo —
// software y créditos para técnicos profesionales de reparación— con reglas
// claras de uso, privacidad, pagos y, sobre todo, una política de uso aceptable
// que prohíbe expresamente el uso en equipos robados o sin autorización.
// Redactado para AriadGSM (marca, Perú). Contacto: raugsm.69@gmail.com.

export type LegalBlock = { p: string } | { ul: string[] }

export type LegalSection = {
  id: string
  title: string
  blocks: LegalBlock[]
}

export const legalUpdated = "23 de septiembre de 2026"
export const legalContact = "raugsm.69@gmail.com"

export const legalSections: LegalSection[] = [
  {
    id: "terminos",
    title: "Términos y Condiciones",
    blocks: [
      {
        p: "Estos Términos y Condiciones regulan el uso de Ari-Tool y de los servicios de AriadGSM (“AriadGSM”, “nosotros”), una marca operada desde Perú. Al crear una cuenta o usar el servicio, aceptás estos términos.",
      },
      {
        p: "Ari-Tool es un software de escritorio y un sistema de créditos destinado a técnicos profesionales de reparación y mantenimiento de equipos móviles. La cuenta es personal e intransferible y sos responsable de toda la actividad realizada con ella.",
      },
      {
        p: "Créditos: el servicio funciona con créditos prepagos. 1 crédito equivale a 1 USD. Los créditos se usan para ejecutar procesos del software y no tienen valor ni uso fuera de la plataforma.",
      },
      {
        p: "Uso permitido: el software se ofrece exclusivamente para uso profesional y legítimo, sobre equipos que el técnico está autorizado a intervenir. El uso indebido está prohibido y se detalla en la Política de Uso Aceptable.",
      },
      {
        p: "Responsabilidad: cada proceso queda a cargo del técnico que lo ejecuta. AriadGSM no se responsabiliza por pérdida de datos, daños al equipo ni consecuencias derivadas de un uso incorrecto o no autorizado. El servicio se brinda “tal cual”, sin garantías implícitas.",
      },
      {
        p: "Cambios y suspensión: podemos actualizar estos términos y el servicio; los cambios se publican en esta página. Podemos suspender o cerrar cuentas que incumplan estos términos.",
      },
      {
        p: "Ley aplicable: estos términos se rigen por las leyes de la República del Perú.",
      },
    ],
  },
  {
    id: "privacidad",
    title: "Política de Privacidad",
    blocks: [
      {
        p: "En AriadGSM cuidamos tus datos. Esta política explica qué información recopilamos y cómo la usamos.",
      },
      {
        p: "Datos que recopilamos: el correo electrónico y los datos de la cuenta que registrás; el historial de créditos y de procesos realizados; y datos técnicos mínimos necesarios para operar el servicio y protegerlo.",
      },
      {
        p: "Pagos: las recargas de créditos se procesan a través de un proveedor de pagos externo (pasarela de pago). AriadGSM no almacena los datos de tu billetera ni tus claves privadas; solo registramos la confirmación del pago para acreditar tus créditos.",
      },
      {
        p: "Uso de los datos: usamos tu información para brindar el servicio, dar soporte, prevenir fraude y cumplir obligaciones legales. No vendemos tus datos a terceros.",
      },
      {
        p: "Tus derechos: podés solicitar acceso, corrección o eliminación de tus datos escribiéndonos a raugsm.69@gmail.com. Conservamos los datos el tiempo necesario para operar el servicio y cumplir la ley.",
      },
    ],
  },
  {
    id: "reembolsos",
    title: "Política de Reembolsos",
    blocks: [
      {
        p: "Los créditos de Ari-Tool son prepagos. Una vez realizada la recarga, los créditos se acreditan de inmediato en tu cuenta y no son reembolsables.",
      },
      {
        p: "Antes de recargar, revisá el monto y el paquete: la compra es final. Los créditos no vencen y quedan disponibles en tu cuenta para cuando los uses.",
      },
      {
        p: "Errores de pago: si te cobraron dos veces, el pago no se acreditó o hubo un error técnico en la transacción, escribinos a raugsm.69@gmail.com con el comprobante y lo revisamos y corregimos de buena fe.",
      },
      {
        p: "Los pagos con criptomonedas son irreversibles por su propia naturaleza; por eso es importante confirmar el monto antes de pagar.",
      },
    ],
  },
  {
    id: "uso-aceptable",
    title: "Política de Uso Aceptable",
    blocks: [
      {
        p: "Ari-Tool es una herramienta profesional. Al usarla, el técnico declara y garantiza que:",
      },
      {
        ul: [
          "Está autorizado por el propietario legítimo del equipo para realizar el servicio.",
          "El equipo no proviene de robo, hurto, pérdida ni de ninguna actividad ilícita.",
          "Cumple con todas las leyes y regulaciones aplicables en su país.",
          "Usa el software únicamente para fines legítimos de reparación, mantenimiento y servicio técnico.",
        ],
      },
      {
        p: "Está estrictamente prohibido usar el servicio para intervenir equipos robados, perdidos o reportados, o para eludir la legítima propiedad de un dispositivo. AriadGSM puede suspender de inmediato, y sin reembolso, cualquier cuenta que incumpla esta política, y colabora con las autoridades ante requerimientos legales.",
      },
      {
        p: "La responsabilidad por el origen del equipo y por la legalidad de cada proceso recae por completo en el técnico que lo ejecuta.",
      },
    ],
  },
]
