# 🔥 Flame in Freefall — Guía de conceptos fundamentales

**Hackathon:** 14 – 15 de noviembre de 2026 · **Entrega:** 15 de noviembre, 11:59 p. m. (máximo)
**Desafío:** *Flame in Freefall: AI-Powered Fire Safety Insights from Microgravity Combustion Data*

> **Objetivo de esta guía:** que llegues al hackathon entendiendo el *problema*, la *física*, los *datos* y la *tecnología* que hay detrás, para que el tiempo del evento se use en construir y no en averiguar qué es una "llama de difusión".

---

## Índice

1. [Descifrando el enunciado frase por frase](#1-descifrando-el-enunciado-frase-por-frase)
2. [Fundamentos de la combustión](#2-fundamentos-de-la-combustión)
3. [La gravedad y el fuego: por qué todo cambia en el espacio](#3-la-gravedad-y-el-fuego-por-qué-todo-cambia-en-el-espacio)
4. [Fenómenos clave del fuego en microgravedad](#4-fenómenos-clave-del-fuego-en-microgravedad)
5. [Seguridad contra incendios en naves y hábitats](#5-seguridad-contra-incendios-en-naves-y-hábitats)
6. [Los experimentos de la NASA que debes conocer](#6-los-experimentos-de-la-nasa-que-debes-conocer)
7. [Dónde están los datos y qué forma tienen](#7-dónde-están-los-datos-y-qué-forma-tienen)
8. [La parte de IA: resumir, rankear e interpretar](#8-la-parte-de-ia-resumir-rankear-e-interpretar)
9. [El dashboard: qué debería mostrar](#9-el-dashboard-qué-debería-mostrar)
10. [Glosario rápido](#10-glosario-rápido)
11. [Plan de preparación hasta el 14 de noviembre](#11-plan-de-preparación-hasta-el-14-de-noviembre)
12. [Preguntas de autoevaluación](#12-preguntas-de-autoevaluación)

---

## 1. Descifrando el enunciado frase por frase

| Frase del enunciado | Qué significa en la práctica |
|---|---|
| *"For decades, NASA has studied how flames behave in microgravity"* | Hay **décadas de experimentos** (torres de caída, aviones parabólicos, transbordador, Estación Espacial Internacional, naves de carga). La materia prima ya existe. |
| *"gathering a trove of experimental data"* | Los datos son **muchos y heterogéneos**: tablas numéricas, videos de llamas, imágenes, series temporales de sensores, artículos científicos, reportes técnicos. |
| *"humans gear up to return to the Moon and press on to Mars"* | El **para qué**: misiones Artemis (Luna) y futuras misiones a Marte. Los hallazgos deben traducirse a decisiones de seguridad para esas misiones. |
| *"the volume of results makes them hard to find, compare, and understand"* | El **problema real** no es de física, es de **información**: buscar, comparar e interpretar. Es un problema de ingeniería de datos + IA. |
| *"interactive, super intelligence (SI) powered dashboard"* | Un **tablero interactivo** con IA (en la práctica: modelos de lenguaje, búsqueda semántica, ML). "SI" es el término del enunciado; no te obsesiones con él, piensa en "IA avanzada". |
| *"summarizes, ranks, and interprets"* | Las **tres funciones obligatorias**. Tu proyecto debe demostrar claramente cada una. |
| *"fire safety insights for human space exploration"* | El **entregable de valor**: conclusiones accionables ("este material es peligroso a X % de oxígeno", "este supresor funciona mejor en tal condición"). |

### 🧭 Analogía para entender el reto

Imagina que la NASA tiene una **biblioteca gigante sin bibliotecario**: miles de libros (experimentos) escritos por diferentes autores, en distintos formatos, sin índice común. Un astronauta o ingeniero que diseña un hábitat lunar necesita responder: *"¿qué tan peligroso es este material si se incendia en la Luna?"*. Hoy tendría que leer decenas de papers.

**Tu misión es construir el bibliotecario inteligente**: alguien que ya leyó todo, te resume lo importante, te dice qué estudios son más relevantes para tu pregunta (ranking) y te explica qué significan para tu misión (interpretación).

---

## 2. Fundamentos de la combustión

### 2.1 El triángulo (y tetraedro) del fuego

Para que exista fuego se necesitan tres cosas a la vez:

```
            CALOR
            /    \
           /      \
  COMBUSTIBLE —— OXIDANTE (O₂)
```

- **Combustible:** lo que se quema (papel, plástico, tela, combustible líquido, cables).
- **Oxidante:** normalmente el oxígeno del aire.
- **Calor (fuente de ignición):** chispa, cortocircuito, superficie caliente.

El **tetraedro del fuego** agrega una cuarta pata: la **reacción química en cadena**. Algunos extintores no quitan calor ni oxígeno, sino que "rompen" esa cadena química.

> 🔑 **Idea clave:** apagar un fuego = quitar al menos una de las patas. En el espacio, cómo llega el oxígeno a la llama cambia radicalmente (ver sección 3).

**Analogía:** el fuego es como una fogata de amigos que necesita tres invitados: si uno no llega (combustible, oxígeno o calor), la fiesta se acaba.

### 2.2 La combustión es una reacción química

Ejemplo con metano:

```
CH₄ + 2 O₂  →  CO₂ + 2 H₂O + calor
```

La reacción libera energía (es **exotérmica**). Ese calor calienta más combustible, que libera más vapores, que se queman... es un ciclo que se **autosostiene** mientras haya los tres elementos.

### 2.3 Tipos de llama: premezclada vs. de difusión

| Tipo | Cómo funciona | Ejemplo cotidiano |
|---|---|---|
| **Premezclada** | El combustible y el oxígeno se mezclan **antes** de quemarse. | La llama azul de la estufa de gas. |
| **De difusión** | Combustible y oxígeno están **separados** y se encuentran en la llama, donde se mezclan por difusión. | Una vela, un fósforo, un incendio de cortina. |

> 🔑 Casi todos los **incendios accidentales** son llamas de **difusión**. Por eso la mayoría de experimentos de seguridad de la NASA estudian este tipo.

**Analogía:** la llama premezclada es un batido ya licuado: lo tomas directo. La llama de difusión es como comer pan y beber café por separado: la "mezcla" ocurre en tu boca (la zona de la llama).

### 2.4 Otros conceptos que aparecerán en los datos

- **Hollín (soot):** partículas de carbono que no terminaron de quemarse. Son las que hacen que la llama se vea **amarilla/naranja** (brillan por el calor). Más hollín = más radiación térmica y más humo tóxico.
- **Combustión latente o sin llama (smoldering):** combustión lenta, sin llama visible, típica de espumas, algodón o aislantes. Peligrosa porque **no se ve** y puede generar mucho monóxido de carbono (CO) antes de convertirse en llama.
- **Pirólisis:** descomposición de un sólido por el calor, que libera gases combustibles. Un sólido realmente no "arde": arden los gases que suelta.
- **Extinción:** el momento en que la llama no puede sostenerse (por falta de oxígeno, exceso de pérdida de calor o demasiado o muy poco flujo de aire).
- **Límite de inflamabilidad:** la condición frontera (por ejemplo, % de oxígeno mínimo) por debajo de la cual algo no puede seguir quemándose.
- **Tasa de quemado (burning rate):** qué tan rápido se consume el combustible.
- **Velocidad de propagación de llama (flame spread rate):** qué tan rápido avanza el fuego sobre una superficie (cm/s o mm/s). Es **uno de los datos más importantes** para seguridad.

---

## 3. La gravedad y el fuego: por qué todo cambia en el espacio

### 3.1 En la Tierra: la flotación lo controla todo

Cuando una vela arde en la Tierra:

1. Los gases calientes de la llama son **menos densos** que el aire frío.
2. La gravedad hace que el aire frío (más pesado) "empuje" hacia arriba al aire caliente → **flotación (buoyancy)**.
3. Los gases calientes suben, y por abajo entra **aire fresco con oxígeno**.
4. Resultado: una corriente constante (**convección natural**) que alimenta la llama y le da su **forma de lágrima** alargada hacia arriba.

**Analogía:** la llama en la Tierra funciona como una **chimenea** o un **globo aerostático**: el aire caliente sube solo, y eso crea una "aspiradora" natural que trae oxígeno fresco desde abajo. La gravedad es el ventilador gratuito del fuego.

### 3.2 En microgravedad: el ventilador se apaga

En la estación espacial no hay "arriba" ni "abajo". El aire caliente **no sube**. Consecuencias:

- **No hay convección natural.** El oxígeno solo llega a la llama por **difusión molecular** (las moléculas se mueven al azar y poco a poco), o por **ventilación forzada** (ventiladores de la nave).
- La difusión es muy lenta: según un científico del experimento FLEX de la NASA, el oxígeno llega a la llama y los productos se alejan unas **100 veces más despacio** que con el flujo de flotación en la Tierra.
- La llama se vuelve **esférica** (en una vela o una gota de combustible), más **tenue**, más **azul** y más **fría**.
- Los productos de la combustión (CO₂, vapor) **se quedan alrededor** de la llama, "ahogándola" parcialmente.

**Analogía:** imagina que estás en un cuarto lleno de gente esperando que te pasen comida. En la Tierra hay una **banda transportadora** (convección) que trae platos sin parar. En microgravedad la banda se apaga y la comida solo llega si alguien camina despacio hasta ti (difusión). Comes menos y más lento: la llama "pasa hambre".

### 3.3 Pero ojo: microgravedad ≠ más seguro

Sería tentador pensar: "si la llama pasa hambre, en el espacio el fuego es menos peligroso". **Falso**, por varias razones:

1. **Las naves tienen ventiladores.** Un flujo de aire suave (unos pocos cm/s) puede alimentar la llama de forma óptima. Hay condiciones en las que un material **arde en microgravedad con menos oxígeno** del que necesitaría en la Tierra.
2. **Los materiales se prueban en la Tierra.** Un material que "pasa" la prueba de inflamabilidad en 1 g podría comportarse distinto en microgravedad (ver sección 5.4).
3. **No hay a dónde huir.** En una nave el volumen es pequeño, el aire es limitado y la evacuación es casi imposible.
4. **El humo no sube.** Los detectores de techo no sirven igual; el humo se queda donde se genera o viaja con la ventilación. Además, en microgravedad las partículas de humo pueden tener tamaños distintos a los de la Tierra, lo que afecta a los detectores.
5. **Combustión latente invisible:** sin flotación, el humo y el calor no "anuncian" el fuego tan rápido.

### 3.4 ¿Cómo se consigue microgravedad para experimentar?

"Microgravedad" no es ausencia de gravedad: es estar en **caída libre**. Todo cae junto, así que nada "pesa" respecto a lo demás.

| Plataforma | Duración de microgravedad | Ejemplo |
|---|---|---|
| **Torre de caída** | 2 – 5 s | Zero Gravity Research Facility (NASA Glenn): pozo de 132 m, ~5,2 s de caída libre. |
| **Vuelo parabólico** | ~20 s por parábola | Aviones que suben y bajan en arcos ("vomit comet"). |
| **Cohete suborbital** | Algunos minutos | Experimentos de corta duración. |
| **Estación Espacial (ISS)** | Ilimitado | Combustion Integrated Rack (CIR): cámara sellada para experimentos de llama. |
| **Nave de carga desechable** | Minutos – horas | Experimentos Saffire en naves Cygnus, después de dejar la ISS (sin tripulación, se pueden quemar muestras grandes). |

**Analogía:** cuando un ascensor baja muy rápido, sientes que "flotas" un instante. Una torre de caída es ese ascensor llevado al extremo. La ISS es un ascensor que **cae para siempre** alrededor de la Tierra sin chocar nunca con ella (porque se mueve de lado muy rápido).

### 3.5 Gravedad parcial: Luna y Marte

| Lugar | Gravedad | Relación con la Tierra |
|---|---|---|
| Tierra | 9,81 m/s² | 1 g |
| Marte | 3,71 m/s² | ≈ 0,38 g |
| Luna | 1,62 m/s² | ≈ 0,17 g |
| ISS | ≈ 0 | microgravedad |

En la Luna y Marte **sí hay flotación**, pero más débil. Eso produce llamas con comportamientos intermedios, y en algunos casos la gravedad parcial puede ser **más peligrosa** que la microgravedad o que 1 g, porque hay suficiente flujo para alimentar bien la llama pero no tanto como para enfriarla o "soplarla". Este es un tema de investigación activa y una **gran oportunidad** de "insight" para tu dashboard: muchos datos son de 0 g o 1 g, y extrapolar a la Luna y Marte es justo lo que las misiones necesitan.

---

## 4. Fenómenos clave del fuego en microgravedad

### 4.1 Llamas esféricas

Una vela o una gota de combustible en microgravedad forma una **llama esférica** alrededor. Es el caso "ideal" para la ciencia, porque sin gravedad el problema es simétrico y más fácil de modelar matemáticamente.

**Analogía:** en la Tierra la llama es una gota de agua cayendo (forma de lágrima). En el espacio es una burbuja de jabón flotando (esfera perfecta).

### 4.2 Llamas frías (cool flames) 🧊🔥

El descubrimiento más famoso: en el experimento **FLEX** (ISS), gotas de heptano siguieron "quemándose" **después de que la llama visible se apagó**.

- **Llama caliente normal:** ~1500 – 2000 K, visible.
- **Llama fría:** ~500 – 800 K, casi invisible, química distinta (reacciones de baja temperatura).

¿Por qué importa para seguridad? Porque una llama fría puede:
- Pasar **desapercibida** para cámaras y sensores ópticos.
- Generar productos químicos tóxicos o reactivos.
- **Reencenderse** como llama caliente.

**Analogía:** es como unas brasas que parecen apagadas en una parrilla, pero si soplas, revive el fuego. Solo que aquí la brasa es un gas.

### 4.3 Propagación de llama: flujo opuesto vs. flujo concurrente

Cuando el fuego se extiende sobre una superficie (por ejemplo una tela), hay dos situaciones:

```
FLUJO OPUESTO (opposed flow)          FLUJO CONCURRENTE (concurrent flow)
  aire →→→                               aire →→→
  ← llama avanza contra el aire         llama avanza con el aire →
  [==========🔥.........]                 [.........🔥==========]
```

- **Opuesto:** la llama avanza "contra el viento". Suele ser más lenta y estable.
- **Concurrente:** la llama avanza "a favor del viento". El aire empuja los gases calientes hacia el material sin quemar, precalentándolo → puede **acelerarse** y crecer mucho.

Los experimentos **Saffire** quemaron muestras de hasta casi 1 m de largo en ambas configuraciones, algo imposible en la ISS con tripulación.

**Analogía:** caminar en una playa contra el viento (opuesto) vs. con el viento a la espalda (concurrente). Con viento a favor avanzas más rápido sin esfuerzo.

### 4.4 Límites de inflamabilidad y el "peor caso"

Para cada material existe una frontera:

- **LOI / LOC (Limiting Oxygen Index / Concentration):** el % mínimo de oxígeno en el que el material puede seguir ardiendo.
- En microgravedad, ese límite **depende mucho de la velocidad del aire**:
  - Aire muy lento → la llama "pasa hambre" y se apaga (extinción por falta de oxígeno / radiación).
  - Aire muy rápido → la llama se "sopla" (extinción por enfriamiento).
  - **En el medio hay un punto óptimo** donde el material es **más inflamable que nunca**.

Esto se suele representar en un **mapa de inflamabilidad**: eje X = velocidad del aire, eje Y = % de oxígeno, y una curva en forma de "U" separa "arde" de "no arde". Es una **visualización perfecta** para tu dashboard.

```
 % O₂
  ↑   ARDE
  |  \           /
  |   \         /
  |    \_______/   ← curva límite (forma de U)
  |   NO ARDE
  +----------------------→ velocidad del aire (cm/s)
        lento   óptimo   rápido
```

**Analogía:** una fogata se apaga si no hay nada de viento (se ahoga) y se apaga si soplas con un secador a máxima potencia, pero con un abanico suave arde de maravilla.

### 4.5 Ignición

¿Cuánta energía (o qué temperatura) se necesita para encender un material? En microgravedad, el calor de una fuente no se disipa por convección, así que algo cercano a un cable recalentado puede **calentarse más** de lo esperado. El experimento **SoFIE** estudia justo ignición y extinción de sólidos.

### 4.6 Humo y detección

Sin flotación:
- El humo **no sube** a un detector en el techo.
- Las partículas pueden tener **tamaños distintos** → los detectores ópticos calibrados en la Tierra pueden fallar.
- Experimentos como **SAME** (Smoke Aerosol Measurement Experiment) midieron humo de materiales típicos de naves.

### 4.7 Supresión (apagar el fuego)

Opciones y retos en el espacio:

| Agente | Cómo apaga | Reto en el espacio |
|---|---|---|
| **CO₂** | Desplaza oxígeno, inerta. | Aumenta CO₂ en cabina (tóxico para la tripulación); hay que filtrarlo después. |
| **Nitrógeno / helio (inertes)** | Diluyen oxígeno. | FLEX estudió su efectividad. |
| **Agua nebulizada (water mist)** | Enfría y desplaza oxígeno. | En microgravedad el agua no cae: flota en gotas. |
| **Apagar ventilación + aislar** | Corta el flujo de oxígeno. | Primer paso estándar en la ISS. |

---

## 5. Seguridad contra incendios en naves y hábitats

### 5.1 La estrategia en capas

La NASA piensa la seguridad contra incendios en capas (como un queso suizo con varias rebanadas):

1. **Prevención:** escoger materiales poco inflamables, controlar fuentes de ignición, limitar cantidad de material combustible.
2. **Detección:** sensores de humo, de gases (CO, HCl, HCN), cámaras.
3. **Supresión:** extintores portátiles, apagar ventilación, aislar el módulo.
4. **Recuperación:** limpiar la atmósfera, máscaras de oxígeno, evaluar daños.

Tu dashboard puede **organizar los hallazgos según estas capas**: "¿qué dicen los datos sobre prevención? ¿y sobre detección?".

### 5.2 Atmósferas de las naves (dato muy importante)

| Hábitat | Presión | % O₂ | Nota |
|---|---|---|---|
| ISS | ~101 kPa (14,7 psi) | ~21 % | Como al nivel del mar. |
| Atmósfera de exploración propuesta (Artemis y similares) | ~56,5 kPa (8,2 psi) | ~34 % | Menos presión facilita las caminatas espaciales, pero **más % de oxígeno = mayor inflamabilidad**. |

> 🔑 **Insight potencial:** muchos datos históricos son con aire normal (21 % O₂). Las misiones a la Luna y Marte podrían usar atmósferas **enriquecidas en oxígeno**. Un dashboard que diga "con 34 % de O₂ este material pasa de 'seguro' a 'riesgoso'" sería muy valioso.

### 5.3 Lecciones de incidentes históricos

- **Apolo 1 (1967):** incendio en la cápsula durante una prueba en tierra; atmósfera de oxígeno puro a presión elevada + materiales inflamables. Murieron tres astronautas. Lección: **atmósfera y materiales** son críticos.
- **Mir (1997):** un generador químico de oxígeno se incendió en la estación rusa; el humo llenó la estación. Lección: los **equipos de soporte vital** pueden ser fuentes de fuego, y el humo en microgravedad se dispersa de forma peligrosa.

### 5.4 Cómo se certifican materiales: la prueba NASA-STD-6001 (Test 1)

En la Tierra, los materiales para naves se prueban encendiéndolos **desde abajo** (la configuración más severa en 1 g, porque la llama sube y precalienta el material). Si la llama se propaga menos de cierta distancia, el material pasa.

**El problema:** esa prueba se basa en la gravedad terrestre. Los datos de microgravedad sugieren que hay condiciones (flujo suave, más oxígeno) en las que un material "aprobado" podría arder. Comparar **resultados de prueba en Tierra vs. comportamiento en microgravedad** es otra fuente de insights.

### 5.5 Luna y Marte: retos nuevos

- **Gravedad parcial** (sección 3.5).
- **Polvo lunar/marciano:** abrasivo, puede entrar a equipos y generar calentamiento o chispas.
- **Hábitats más grandes y de larga duración:** más material combustible acumulado.
- **Lejanía:** en Marte no hay rescate rápido; el hábitat debe ser **autónomo** ante un incendio.

---

## 6. Los experimentos de la NASA que debes conocer

Estos son los nombres que verás una y otra vez en los datos. Apréndete al menos las siglas y el tema:

| Sigla | Nombre completo | Tema principal | Dónde |
|---|---|---|---|
| **FLEX / FLEX-2** | Flame Extinguishment Experiment | Gotas de combustible, supresión con gases inertes, **descubrió las llamas frías**. | ISS |
| **CFI** | Cool Flames Investigation | Llamas frías en profundidad. | ISS |
| **BASS / BASS-II** | Burning and Suppression of Solids | Combustión y extinción de **sólidos** (plásticos, telas). | ISS |
| **ACME** | Advanced Combustion via Microgravity Experiments | Conjunto de estudios de llamas gaseosas (eficiencia, hollín, llamas esféricas, campos eléctricos, emulador de tasa de quemado). | ISS |
| **SoFIE (y SoFIE-GEL)** | Solid Fuel Ignition and Extinction | Ignición, crecimiento y límites de extinción de sólidos. | ISS |
| **Saffire I – VI** | Spacecraft Fire Safety Experiment | **Incendios grandes** (muestras de ~1 m) en naves Cygnus sin tripulación. | Nave Cygnus |
| **SAME / SAME-R** | Smoke Aerosol Measurement Experiment | Humo: tamaño de partículas, detección. | ISS |
| **SPICE** | Smoke Point in Coflow Experiment | Cuándo una llama empieza a producir hollín/humo. | ISS |
| **DAFT** | Dust and Aerosol Measurement Feasibility Test | Medición de partículas en cabina. | ISS |
| **Confined Combustion** | — | Cómo influyen las **paredes** cercanas en el fuego. | ISS |
| **CIR** | Combustion Integrated Rack | No es un experimento: es el **laboratorio/cámara** de la ISS donde se hacen muchos de los anteriores. | ISS |

**Analogía:** piensa en estos experimentos como **temporadas de una serie**. FLEX es la temporada de "gotas y extintores", BASS la de "sólidos", Saffire la de "incendios grandes en el set real", SAME la de "humo". Tu dashboard es la plataforma de streaming que te recomienda qué temporada ver según tu pregunta.

---

## 7. Dónde están los datos y qué forma tienen

### 7.1 Fuentes probables

1. **NASA Physical Sciences Informatics (PSI)** — `psi.nasa.gov`
   Base de datos oficial de experimentos de ciencias físicas en gravedad reducida (ISS, transbordador, naves libres y estudios en tierra). Incluye datos crudos y analizados de experimentos de combustión como FLEX, BASS, ACME, Saffire, SAME, SPICE y CFI. **Probablemente la fuente principal.** Regístrate y explórala antes del hackathon.
2. **NASA Technical Reports Server (NTRS)** — `ntrs.nasa.gov`
   Miles de reportes técnicos y papers. Ideal para la parte de texto/resúmenes.
3. **NASA Task Book** — descripciones de proyectos de investigación, objetivos y resultados resumidos.
4. **Repositorios de imágenes y video de NASA** — fotos y videos de llamas.
5. **Papers académicos** (Combustion and Flame, Proceedings of the Combustion Institute, etc.).
6. **Recursos del propio hackathon:** casi seguro los organizadores publicarán enlaces; revísalos apenas salgan.

### 7.2 Tipos de datos que encontrarás

| Tipo | Ejemplo | Cómo lo usaría la IA |
|---|---|---|
| **Tablas numéricas** | Experimento, combustible, % O₂, presión, velocidad de flujo, ¿se extinguió?, velocidad de propagación | Gráficas, filtros, modelos de ML, mapas de inflamabilidad |
| **Series temporales** | Diámetro de una gota vs. tiempo, temperatura vs. tiempo | Detectar fases (ignición, quemado, extinción) |
| **Imágenes/videos** | Fotos de la llama cada X ms | Medir tamaño/color de la llama (visión por computador) — ambicioso para 2 días |
| **Texto** | Papers, reportes, resúmenes | Resúmenes con LLM, extracción de hallazgos, búsqueda semántica |
| **Metadatos** | Fecha, plataforma, investigador, gravedad | Filtros y rankings |

### 7.3 Ejemplo de cómo podría verse una tabla limpia

> ⚠️ Los valores son **ilustrativos**, solo para que veas la estructura, no son datos reales.

| experimento | material/combustible | gravedad | O₂ (%) | presión (kPa) | flujo (cm/s) | resultado | vel. propagación (mm/s) |
|---|---|---|---|---|---|---|---|
| BASS | PMMA (acrílico) | 0 g | 21 | 101 | 10 | ardió | 0,8 |
| BASS | PMMA | 0 g | 17 | 101 | 5 | se extinguió | — |
| Saffire | tela algodón-fibra de vidrio | 0 g | 21 | 101 | 20 | ardió | 2,5 |
| FLEX | heptano (gota) | 0 g | 15 | 101 | 0 | llama fría | — |

**Consejo:** el 80 % del trabajo en proyectos de datos es **limpiar y unificar**. Diferentes experimentos usan unidades y nombres distintos. Antes del hackathon, piensa en un **esquema común** (como la tabla de arriba) al que vas a "traducir" todo.

**Analogía:** cada experimento habla un idioma distinto (uno mide en psi, otro en kPa; uno dice "extinguished", otro "flameout"). Tu primer trabajo es ser el **traductor** que pone a todos a hablar el mismo idioma.

---

## 8. La parte de IA: resumir, rankear e interpretar

### 8.1 ¿Qué es "Super Intelligence (SI)" aquí?

Es la forma en que el enunciado llama a la IA. En la práctica, para un hackathon de 2 días, significa combinar:

- **Modelos de lenguaje grandes (LLM)** vía API (Claude, GPT, Gemini, Llama, etc.) para leer, resumir y explicar.
- **Búsqueda semántica** (embeddings) para encontrar estudios relevantes.
- **Machine learning clásico** (opcional) para predecir, agrupar o detectar patrones en los datos numéricos.

### 8.2 El pipeline completo (de datos crudos a insight)

```
 [Fuentes]         [Ingesta]        [Procesamiento]           [IA]                    [Dashboard]
 PSI, NTRS   →   descargar,    →   limpiar, unificar,   →  resumir, rankear,    →   gráficas, chat,
 papers, CSV     scraping,          extraer tablas,          interpretar,             filtros, tarjetas
                 PDFs               chunking de texto        embeddings + RAG         de insights
```

### 8.3 Conceptos de IA que debes dominar

**a) Embeddings (vectores semánticos)**
Convierten un texto en una lista de números que representa su **significado**. Textos con significado parecido quedan "cerca".

*Analogía:* es como darle a cada texto unas **coordenadas GPS en un mapa de ideas**. "Extinción de llama con nitrógeno" y "supresión con gas inerte" quedan en el mismo barrio aunque usen palabras distintas.

**b) Base de datos vectorial**
Guarda esos embeddings y permite buscar "los 5 textos más cercanos a mi pregunta". Ejemplos: Chroma, FAISS, Pinecone, pgvector.

**c) RAG (Retrieval-Augmented Generation)**
1. El usuario pregunta: *"¿Qué materiales son más peligrosos con flujo de aire bajo?"*
2. El sistema **busca** los fragmentos relevantes (retrieval).
3. Se los pasa al LLM junto con la pregunta.
4. El LLM **responde basándose en esos fragmentos** y los cita.

*Analogía:* un estudiante que presenta un examen **a libro abierto**: en vez de inventar, busca la página correcta y responde con base en ella. Eso reduce las "alucinaciones".

**d) Chunking**
Dividir documentos largos en trozos (por ejemplo, 500 – 1000 palabras) para poder indexarlos y buscarlos.

**e) Alucinaciones**
Cuando el LLM inventa datos con total seguridad. **En seguridad espacial esto es inaceptable.** Mitigación:
- Siempre mostrar **la fuente** (experimento, paper, página).
- Pedirle al modelo que diga "no hay datos suficientes" cuando aplique.
- Separar visualmente **datos medidos** de **interpretaciones de la IA**.

**f) Extracción estructurada**
Usar el LLM para convertir texto libre en datos estructurados (JSON). Ejemplo:

```text
Texto: "En el experimento BASS-II, las muestras de PMMA no sostuvieron la llama
por debajo de 16% de oxígeno con un flujo de 5 cm/s."

JSON extraído:
{
  "experimento": "BASS-II",
  "material": "PMMA",
  "oxigeno_limite_pct": 16,
  "flujo_cm_s": 5,
  "hallazgo": "límite de extinción"
}
```

Esto te permite pasar de "una pila de PDFs" a "una tabla comparable".

### 8.4 Las tres funciones obligatorias, con ejemplos

#### 🟦 RESUMIR
Convertir un experimento o paper largo en una **tarjeta** corta y estándar:

> **BASS-II — Combustión de sólidos**
> **Qué se probó:** plásticos y telas bajo distintos niveles de oxígeno y flujo de aire en la ISS.
> **Hallazgo principal:** algunos materiales ardieron en condiciones en que se esperaba que no lo hicieran.
> **Relevancia para misiones:** selección de materiales en cabina.
> **Fuente:** [enlace]

*Ejemplo de prompt:*
```
Eres un ingeniero de seguridad contra incendios de la NASA. Resume el siguiente
documento en: (1) qué se probó, (2) condiciones (gravedad, % O2, presión, flujo),
(3) hallazgo principal, (4) implicación para hábitats lunares o marcianos.
Usa solo información del texto. Si un dato no aparece, escribe "no reportado".
```

#### 🟨 RANKEAR
Ordenar hallazgos según **qué tan útiles son para una pregunta o misión**. Necesitas **criterios explícitos**. Ejemplo de puntaje:

```
Puntaje = 0,35 × relevancia_semántica
        + 0,25 × aplicabilidad_a_la_misión   (¿condiciones parecidas a Luna/Marte?)
        + 0,20 × severidad_del_riesgo         (¿qué tan grave es el hallazgo?)
        + 0,10 × calidad_de_datos             (¿cuántas pruebas? ¿datos crudos disponibles?)
        + 0,10 × recencia
```

*Ejemplo:* pregunta = "riesgo de incendio en hábitat lunar con atmósfera de 34 % O₂".

| Hallazgo | Relevancia | Aplicabilidad | Severidad | Calidad | Recencia | **Total** |
|---|---|---|---|---|---|---|
| Material X arde a menor O₂ en flujo bajo | 0,9 | 0,8 | 0,9 | 0,7 | 0,8 | **0,85** |
| Llamas frías en gotas de heptano | 0,5 | 0,4 | 0,6 | 0,9 | 0,6 | **0,55** |
| Tamaño de partículas de humo | 0,6 | 0,7 | 0,5 | 0,8 | 0,7 | **0,64** |

*(Valores ilustrativos.)* Lo importante es que **el usuario pueda ver por qué** algo quedó primero (transparencia) e idealmente **ajustar los pesos** con sliders.

*Analogía:* es como el sistema de **reseñas de Rappi o Google Maps**: no solo ves "el mejor restaurante", ves por qué (precio, distancia, calificación) y puedes filtrar según lo que te importa.

#### 🟥 INTERPRETAR
Ir más allá del dato y decir **qué significa para la decisión**:

> **Dato:** "Material X sostuvo la llama a 17 % O₂ con flujo de 5 cm/s en microgravedad."
> **Interpretación:** "Como la atmósfera de exploración propuesta tiene ~34 % O₂, muy por encima del límite observado, el material X tendría un margen de seguridad bajo. Recomendación: revisar su uso cerca de ductos de ventilación (flujo bajo y constante)."
> **Nivel de confianza:** medio — los datos son de 0 g y 101 kPa, no de gravedad lunar ni de 56,5 kPa.

> 🔑 La interpretación es la parte que más **valor** agrega y la que más **cuidado** requiere. Mostrar siempre la **incertidumbre** y las **condiciones de los datos** te hará ver profesional ante los jurados.

---

## 9. El dashboard: qué debería mostrar

### 9.1 Usuarios posibles (piensa para quién diseñas)

- **Ingeniero de diseño de hábitats:** "¿qué materiales evitar?"
- **Planificador de misión:** "¿qué atmósfera es más segura?"
- **Astronauta/entrenador:** "¿cómo se comporta un fuego y cómo respondo?"
- **Investigador:** "¿qué condiciones no se han probado todavía?" (detección de **vacíos de conocimiento**, ¡muy buen insight!)

### 9.2 Componentes sugeridos

| Componente | Qué muestra | Función que cubre |
|---|---|---|
| **Buscador/chat con IA** | Preguntas en lenguaje natural con respuestas citadas | Resumir + interpretar |
| **Catálogo de experimentos** | Tarjetas resumen por experimento | Resumir |
| **Ranking de hallazgos** | Lista ordenada con puntaje y criterios ajustables | Rankear |
| **Mapa de inflamabilidad** | Gráfico % O₂ vs. flujo, coloreado "arde/no arde" | Interpretar |
| **Filtros** | Gravedad, material, % O₂, presión, experimento, año | Comparar |
| **Simulador de escenario** | "Hábitat lunar, 34 % O₂, 56,5 kPa" → hallazgos relevantes y nivel de riesgo | Interpretar + rankear |
| **Mapa de vacíos** | Combinaciones de condiciones sin datos | Interpretar |
| **Línea de tiempo** | Experimentos a lo largo de las décadas | Contexto |

### 9.3 Ejemplo de flujo de uso (para tu demo)

1. El usuario elige el escenario **"Hábitat en Marte"** (0,38 g, atmósfera enriquecida).
2. El dashboard muestra los **10 hallazgos más relevantes** rankeados.
3. El usuario hace clic en uno → ve la **tarjeta resumen**, la **gráfica** de los datos y la **fuente**.
4. Pregunta en el chat: *"¿Qué supresor funcionó mejor para sólidos?"* → respuesta con citas.
5. El panel de **interpretación** genera recomendaciones con nivel de confianza.

### 9.4 Stack técnico sugerido (rápido de construir en 2 días)

| Capa | Opciones rápidas |
|---|---|
| Frontend/dashboard | **Streamlit** (lo más rápido en Python), Dash/Plotly, o React + Chart.js |
| Procesamiento | Python, pandas, PyPDF / pdfplumber |
| IA | API de un LLM + embeddings; LangChain o LlamaIndex (opcionales) |
| Vectores | Chroma o FAISS (locales, sin configurar servidores) |
| Gráficas | Plotly (interactivas) |
| Despliegue | Streamlit Community Cloud, Hugging Face Spaces, Vercel |

> 💡 Si ya sabes Python y Chart.js, **Streamlit + Plotly + un LLM vía API** es probablemente la ruta con menos fricción para tener algo funcional y vistoso a tiempo.

---

## 10. Glosario rápido

| Término | Definición corta |
|---|---|
| **Microgravedad** | Estado de caída libre donde los efectos de la gravedad son mínimos. |
| **Flotación (buoyancy)** | Fuerza que hace subir a lo menos denso (aire caliente) por acción de la gravedad. |
| **Convección natural** | Movimiento de aire causado por la flotación. |
| **Convección forzada** | Movimiento de aire causado por ventiladores. |
| **Difusión** | Movimiento lento de moléculas de mayor a menor concentración. |
| **Llama de difusión** | Llama donde combustible y oxígeno se mezclan en la propia llama. |
| **Llama premezclada** | Llama donde se mezclan antes de quemar. |
| **Llama fría (cool flame)** | Combustión de baja temperatura, casi invisible. |
| **Hollín (soot)** | Partículas de carbono sin quemar; dan color amarillo y producen humo. |
| **Smoldering** | Combustión lenta sin llama. |
| **Pirólisis** | Descomposición térmica de un sólido que libera gases combustibles. |
| **LOI / LOC** | % mínimo de oxígeno para que algo siga ardiendo. |
| **Flame spread rate** | Velocidad de avance de la llama sobre un material. |
| **Opposed / concurrent flow** | Llama avanza contra / a favor del flujo de aire. |
| **Extinción** | Fin de la llama por falta de oxígeno, calor o exceso de flujo. |
| **PMMA** | Acrílico (plexiglás); material de prueba muy común. |
| **CIR** | Combustion Integrated Rack, laboratorio de combustión de la ISS. |
| **PSI** | Physical Sciences Informatics, base de datos de la NASA. |
| **NTRS** | NASA Technical Reports Server, repositorio de reportes. |
| **LLM** | Modelo de lenguaje grande (IA que lee y genera texto). |
| **Embedding** | Representación numérica del significado de un texto. |
| **RAG** | Técnica: buscar fuentes y luego generar respuesta basada en ellas. |
| **Chunking** | Partir documentos en trozos para indexarlos. |
| **Alucinación** | Respuesta inventada por la IA. |

---

## 11. Plan de preparación hasta el 14 de noviembre

Tienes **3 semanas**. Propuesta:

### Semana 1 (24 – 31 oct): entender
- [ ] Leer esta guía completa y resolver las preguntas de la sección 12.
- [ ] Ver videos cortos de NASA sobre llamas en microgravedad (busca "NASA flames microgravity", "FLEX cool flames", "Saffire").
- [ ] Crear cuenta en **psi.nasa.gov** y explorar los experimentos de combustión: ¿qué archivos tienen? ¿CSV, PDF, video?
- [ ] Buscar en **NTRS** 5 – 10 papers sobre FLEX, BASS y Saffire y leer solo sus *abstracts*.

### Semana 2 (1 – 7 nov): prototipar sin presión
- [ ] Descargar 1 – 2 datasets reales y cargarlos en pandas.
- [ ] Hacer un mini RAG con 5 – 10 PDFs (embeddings + Chroma + LLM) y preguntarle cosas.
- [ ] Probar un prompt de resumen estructurado (sección 8.4) sobre 3 papers.
- [ ] Probar Streamlit con una gráfica Plotly de ejemplo.
- [ ] Definir con tu equipo **roles**: datos, IA, frontend, presentación/pitch.

### Semana 3 (8 – 13 nov): alistar el terreno
- [ ] Plantilla del proyecto lista (repositorio, entorno, dependencias, API keys funcionando).
- [ ] Esquema común de datos definido (sección 7.3).
- [ ] Lista de 3 – 5 "insights" candidatos que te gustaría demostrar.
- [ ] Bosquejo (en papel o Figma) del dashboard.
- [ ] Revisar las **reglas del hackathon**: ¿se permite código previo? ¿qué entregables piden (video, repo, presentación)?

### Durante el hackathon (14 – 15 nov)
- **Día 1 mañana:** datos + esquema. **Día 1 tarde:** IA (resumen + RAG).
- **Día 2 mañana:** ranking + interpretación + dashboard. **Día 2 tarde:** pulir, demo, video, pitch.
- **Regla de oro:** tener una versión que funcione de principio a fin **temprano** el día 2, y mejorar desde ahí. No dejes la entrega para las 11:50 p. m.

---

## 12. Preguntas de autoevaluación

Si puedes responderlas sin mirar, estás listo:

1. ¿Por qué una llama de vela es esférica en la ISS y alargada en la Tierra?
2. ¿Qué diferencia hay entre una llama premezclada y una de difusión? ¿Cuál es más común en incendios accidentales?
3. ¿Por qué un fuego en microgravedad **no** es necesariamente menos peligroso?
4. ¿Qué es una llama fría y qué experimento la descubrió?
5. Explica la forma de "U" del mapa de inflamabilidad.
6. ¿Por qué una atmósfera con 34 % de oxígeno a baja presión preocupa a los ingenieros?
7. ¿Qué diferencia a los experimentos Saffire de los que se hacen dentro de la ISS?
8. ¿Qué es RAG y por qué reduce las alucinaciones?
9. Propón tres criterios para rankear hallazgos y justifica sus pesos.
10. ¿Qué diferencia hay entre resumir, rankear e interpretar? Da un ejemplo de cada uno con datos de combustión.

---

## Fuentes consultadas

- NASA Scientific Visualization Studio — *NASA Studies Fire in Microgravity*: https://svs.gsfc.nasa.gov/31394
- NASA — Physical Sciences Informatics (PSI) research opportunity: https://science.nasa.gov/physical-sciences-informatics-psi/nasa-psi-research-opportunity/
- NASA — *Collaborating Through Data: Inside the PSI Users Group*: https://science.nasa.gov/uncategorized/collaborating-through-data-inside-the-psi-users-group/
- NASA ISS Science Blog — *Flights of Flames for Fire Safety in Space* (Sandra Olson): https://blogs.nasa.gov/ISS_Science_Blog/?p=327
- Space.com — sobre SoFIE, FLEX, ACME y Saffire: https://www.space.com/fire-safety-experiment-cygnus-ng-17-launch
- Big Think — *How does fire behave in microgravity?*: https://develop.bigthink.com/?p=40678
- Portal PSI: https://psi.nasa.gov · NTRS: https://ntrs.nasa.gov
