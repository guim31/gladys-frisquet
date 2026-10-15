# Frisquet Connect

## Presentación

Esta integración conecta Gladys con su **caldera Frisquet** equipada con la **caja Frisquet
Connect**, a través del mismo servicio en línea que la aplicación «Frisquet Connect». En Gladys
encontrará:

- cada **zona de calefacción** (Zona 1, Zona 2, Zona 3 según su instalación) con su temperatura
  ambiente, su consigna, sus consignas confort / reducida / antihielo y su modo;
- la **caldera**: temperatura exterior (si hay una sonda conectada), agua caliente sanitaria
  (encendido / apagado y modo), alarmas, modo vacaciones, espera y **consumo de gas** de
  calefacción y agua caliente;
- un **widget** para el panel que cambia el modo con un toque, **acciones de escena** y un
  **disparador** de alarmas.

Integración comunitaria, **sin relación con Frisquet**. Frisquet Connect no tiene API pública: la
integración habla el idioma de la aplicación oficial, según el trabajo de los proyectos citados en
el README. **Desarrollada sin el hardware ni una cuenta: sus comentarios son bienvenidos**, sobre
todo si un modo o una orden no se comporta como en la aplicación.

## Requisitos

- Una caldera Frisquet con la **caja Frisquet Connect** instalada y emparejada.
- Una cuenta en la aplicación **Frisquet Connect** (correo electrónico y contraseña) que vea su
  caldera.
- Gladys Assistant **5.2.0 o posterior** (el modo de las zonas usa los preajustes de termostato
  añadidos en 5.2.0).
- Acceso a Internet para Gladys: todo pasa por el servicio en línea de Frisquet, nada por la red
  local.

## Configuración

1. En Gladys, **Integraciones → Frisquet Connect → Configuración**.
2. Introduzca el **correo electrónico** y la **contraseña** de la aplicación Frisquet Connect.
3. Elija el **idioma de los nombres** (francés por defecto). Los nombres de las funciones se fijan
   al añadir un dispositivo: cambie el idioma antes.
4. Elija el **intervalo de lectura**: cada 5 minutos (por defecto), 10 o 15 minutos.
5. Guarde y pulse **Probar la conexión**: el mensaje indica el número de calderas y zonas
   encontradas.
6. Pestaña **Descubrir**: añada la caldera y las zonas que le interesen.

Si su cuenta tiene varias calderas (una casa y un piso, por ejemplo), aparecen todas; el nombre de
cada zona empieza entonces por el nombre de su instalación.

## Qué hace cada dispositivo

### La caldera

| Función                         | Qué muestra o hace                                                           |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Temperatura exterior            | La sonda exterior, si está conectada.                                        |
| Agua caliente                   | Encendido / apagado del agua caliente. «Encendido» recupera el último modo.  |
| Modo de agua caliente           | MAX, Eco, Eco programado, Eco+, Eco+ programado, Apagado (según la caldera). |
| Alarma / Alarma activa          | El texto de la alarma que muestra Frisquet, y un indicador sí / no.          |
| Modo vacaciones                 | Activo mientras unas vacaciones programadas están en curso (solo lectura).   |
| Caldera en espera               | La caldera está en espera.                                                   |
| Gas calefacción / agua caliente | Gas consumido este mes y este año, en kWh, según el cálculo de Frisquet.     |

Las notas del instalador (por ejemplo un recordatorio permanente sobre el suelo radiante) no son
averías: se ignoran.

### Las zonas de calefacción

| Función                                 | Qué muestra o hace                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Temperatura ambiente                    | La temperatura medida por la sonda de ambiente de la zona.                                                                                        |
| Consigna                                | La consigna aplicada ahora mismo. Cambiarla modifica de forma duradera la consigna del modo en curso (confort o reducido), como en la aplicación. |
| Consigna confort / reducida / antihielo | Las tres consignas de la zona, de 5 a 30 °C en pasos de 0,5 °C.                                                                                   |
| Modo                                    | **Programación** (sigue el programa semanal), **Confort**, **Reducido** o **Antihielo** permanente. En Gladys, «Reducido» aparece como «Eco».     |
| Derogación en curso                     | Hay una derogación activa (un modo forzado hasta el próximo cambio del programa).                                                                 |
| Refuerzo                                | Solo si la zona lo ofrece: calefacción reforzada temporal.                                                                                        |
| Modo actual                             | Una frase: «Confort (programación)», «Reducido (derogación)», «Antihielo (vacaciones)»…                                                           |

Elegir **Programación** también termina una derogación en curso.

## Ritmo, plazos y cuotas

- La caja Connect transmite el estado de la caldera al servicio de Frisquet **por radio, cada pocos
  minutos**. Leer más a menudo no aportaría nada: la integración lee cada 5 minutos por defecto (10
  o 15 si lo prefiere), y el consumo de gas (mensual) cada 6 horas.
- El servicio acepta una orden de inmediato, pero la caldera solo la aplica en su próximo
  intercambio con la caja: **cuente unos minutos**. Gladys muestra al instante el valor solicitado y
  luego la integración vuelve a leer la caldera 20 segundos y 3 minutos después.
- El servicio limita el número de peticiones: la integración espacia sus llamadas al menos medio
  segundo y solo lee las calderas con un dispositivo añadido en Gladys. Tras una contraseña
  rechazada espera 30 minutos antes de volver a intentarlo por sí sola (para no bloquear su
  cuenta); corregir la configuración vuelve a empezar de inmediato.
- Un valor que no cambia se vuelve a publicar cada 6 horas, para que Gladys no lo muestre como
  antiguo.

## Widget

Añada el widget **Calefacción Frisquet** a un panel.

- **Sin ajuste** (o con una caldera): todas las zonas de un vistazo, la temperatura y la consigna
  de cada una, y una línea por zona con su modo actual.
- **Con una zona elegida**: su temperatura y su consigna en directo, el modo actual, las consignas
  confort / reducida / antihielo, la temperatura exterior y cuatro botones: **Programación**,
  **Confort**, **Reducido** y **Derogación** (que invierte el periodo en curso hasta el próximo
  cambio del programa, como la tecla de derogación de la caldera) o **Fin derogación**. El modo
  activo lleva una marca.

El modo antihielo no tiene botón en el widget, para que un toque desafortunado nunca corte el
confort: elíjalo en el dispositivo o con una escena.

## Escenas

### Disparador

- **Alarma de la caldera Frisquet** — ha aparecido una nueva alarma en la caldera (fallo, caja
  Connect desconectada…). Elija la caldera o déjelo vacío para todas. El texto de la alarma está en
  la variable «Alarma». Una alarma ya presente al instalar o reiniciar no dispara nada.

### Acciones

- **Modo de calefacción Frisquet** — elija una zona, o una caldera para todas sus zonas, y el modo:
  volver a la programación, confort / reducido / antihielo permanente, confort o reducido hasta el
  próximo cambio (derogación), o fin de la derogación.
- **Agua caliente Frisquet** — elija la caldera y el modo: Encendido (último modo), Apagado, MAX,
  Eco, Eco programado, Eco+, Eco+ programado.

Las consignas se ajustan con la acción estándar de Gladys «Controlar un dispositivo».

## Ejemplos de escenas

- **Fin de semana fuera**: cuando la alarma de la casa pasa a modo ausente, **Modo de calefacción
  Frisquet** en la caldera con «Antihielo permanente» y luego **Agua caliente Frisquet** en
  «Apagado». Al volver, «Volver a la programación» y «Encendido».
- **Vuelta antes de lo previsto**: cuando su teléfono vuelve a la zona de la casa un día laborable,
  «Confort hasta el próximo cambio» en la zona del salón.
- **Avisar de una avería**: disparador **Alarma de la caldera Frisquet** y luego un mensaje de
  Telegram «Caldera: {{triggerEvent.data.alarm}}».
- **Horas valle**: a las 22 h, consigna reducida a 17 °C; a las 6 h, consigna confort a 20 °C
  (acción «Controlar un dispositivo»).

## Solución de problemas

- **«Frisquet Connect rechazó el correo electrónico o la contraseña»**: compruébelos iniciando
  sesión en la aplicación Frisquet Connect y corrija la configuración.
- **«Frisquet Connect no responde»**: el servicio no está disponible o está en mantenimiento; la
  integración vuelve a intentarlo sola. La alarma «Box Frisquet Connect déconnectée» indica que la
  caja ya no llega a Internet (caja desenchufada, Wi-Fi caído).
- **Una orden no cambia nada**: espere unos minutos (vea los plazos más arriba). Si el valor vuelve
  al anterior al cabo de 5 minutos, infórmelo con los registros.
- **«Sin valor reciente»** en el consumo de gas: puede que su cuenta no lo proporcione; todo lo
  demás funciona sin él.
- **Registros**: en funcionamiento normal la integración no escribe nada. Para el detalle, ponga
  `LOG_LEVEL` en `debug`. El token y la contraseña nunca aparecen en los registros.

## Límites

- **Desarrollada sin el hardware ni una cuenta**: las respuestas del servicio proceden de otros
  proyectos comunitarios que las registraron en calderas reales. Comentarios bienvenidos.
- El **modo vacaciones** es de solo lectura: cómo programarlo a través del servicio no está
  documentado. Prográmelo en la aplicación o en la caldera, o use «Antihielo permanente».
- La **derogación** es una orden sin número de zona en el servicio de Frisquet: en una instalación
  con varias zonas puede aplicarse a la zona 1 o a todas, según la caldera. A comprobar en su casa.
- El **programa semanal** no se puede modificar desde Gladys (solo se sigue).
- El **consumo de gas** es el que calcula Frisquet, por mes: no es un contador de gas y no se envía
  al seguimiento energético de Gladys, que lo contaría como electricidad.
- El **modo de agua caliente** de las instalaciones solares no está gestionado.
- Todo pasa por Internet: sin el servicio de Frisquet, Gladys deja de ver la caldera (la caldera
  sigue calentando con normalidad).
