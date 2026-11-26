# Fundamentos de JavaScript — Agenda de la sesión

**Formato:** Charla interactiva con código en vivo · **Duración:** ~90 minutos
**Público:** Desarrolladores que empiezan con JavaScript (o vienen de otro lenguaje)
**Material:** `index.html` (se abre en cualquier navegador moderno, sin instalación y sin conexión)

| Archivo | Propósito |
|---------|-----------|
| `index.html` | Presentación interactiva principal (33 diapositivas) |
| `ejercicios/` | Ejercicios por sección, enlazados desde la diapositiva correspondiente (ver abajo) |
| `errores-y-asincronia.html` | Bloque opcional 07 · Errores y asincronía (se abre desde la última diapositiva) |
| `cheatsheet.html` | Resumen en una página + referencia de sintaxis (imprimible) |
| `quiz.html` | Quiz final de 6 preguntas con puntaje |
| `qa.html` | Preguntas, recursos y próximos pasos |
| `assets/` | Estilos, scripts y logos compartidos: mantenla junto a los archivos HTML |

### Ejercicios y dónde se enlazan

| Página | Ejercicio | Enlace desde la diapositiva |
|--------|-----------|-----------------------------|
| `ejercicios/sintaxis-y-variables.html` | Quiz: hoisting | “var, let y const” |
| `ejercicios/operadores.html` | Coerción de tipos: ¡adivina! | “== vs ===” |
| `ejercicios/funciones.html` | Quiz: la trampa de los closures | “Alcance y closures” |
| `ejercicios/funciones.html` | Reto: `isPalindrome(text)` | “this y funciones flecha” |
| `ejercicios/objetos-y-arrays.html` | Reto: `getAdultNames(people)` | “Métodos de array” |
| `ejercicios/asincronia.html` | Quiz: el event loop | Tema “El event loop” de `errores-y-asincronia.html` |

Cada ejercicio tiene un enlace “← Volver a la diapositiva” que regresa exactamente a la diapositiva de origen, y sus notas para el presentador aparecen como un bloque desplegable.

---

## Objetivos

Al terminar la sesión, los asistentes deberían poder:

1. Leer y escribir la sintaxis básica de JavaScript con confianza.
2. Elegir correctamente entre `const`, `let` y `var`.
3. Reconocer los tipos de datos principales y cómo se copian los valores (valor vs. referencia).
4. Usar los operadores de forma segura, especialmente `===`, `&&`, `||`, `??` y `?.`, y evitar las trampas de la coerción.
5. Escribir funciones en los tres estilos y entender parámetros, alcance y closures.
6. Manipular objetos y arrays con idioms modernos (desestructuración, spread, `map`/`filter`/`reduce`).
7. Manejar errores y tener un primer modelo mental del código asíncrono.

---

## Agenda

| #  | Bloque                    | Tiempo | Conceptos clave                                                                                         | Elemento interactivo                         |
|----|---------------------------|--------|---------------------------------------------------------------------------------------------------------|----------------------------------------------|
| 00 | Introducción              | 5 min  | Qué es JS, historia, ECMAScript, dónde se ejecuta, cómo ejecutar código                                 | Editor “Hola JS”                             |
| 01 | Sintaxis y variables      | 10 min | Sentencias vs. expresiones, comentarios, identificadores, `var` / `let` / `const`, alcance de bloque, hoisting, TDZ | Editores + quiz de hoisting       |
| 02 | Tipos de datos            | 10 min | 7 primitivos + objetos, `typeof`, números, `NaN`, BigInt, strings y template literals, valor vs. referencia | Editores                                 |
| 03 | Operadores                | 15 min | Aritméticos, asignación, `++`, comparación `==` vs `===`, coerción, lógicos y cortocircuito, truthy/falsy, `?:`, `??`, `?.`, spread, precedencia | Matriz de igualdad, tarjetas de coerción, probador de truthiness, laboratorio de operadores |
| 04 | Control de flujo          | 8 min  | `if / else`, `switch`, `for`, `while`, `for…of`, `for…in`, `break` / `continue`                          | Editores (demo de protección contra bucles infinitos) |
| 05 | Funciones                 | 20 min | Declaraciones vs. expresiones vs. flechas, parámetros por defecto y rest, valores de retorno, alcance, closures, funciones de orden superior, callbacks, `this` | Editores, quiz de closures, reto de código |
| 06 | Objetos y arrays          | 10 min | Objetos literales, acceso con punto/corchetes, métodos, desestructuración, spread, métodos de array, encadenamiento, mutación | Editores + reto de código |
| 07 | Errores y asincronía *(opcional)* | 7 min  | `try / catch / finally`, `throw`, errores propios, event loop, Promesas, `async / await`                  | Página aparte, enlazada desde la última diapositiva |
| 08 | Cierre                    | 5 min  | Hoja de referencia, quiz final, recursos, preguntas                                                      | Quiz con puntaje                             |
|    | **Total**                 | **83 min** + 7 opcional |                                                                                                     |                                              |

> ¿Te quedas corto de tiempo? Comprime **Control de flujo** (la mayoría lo conoce de otros lenguajes) y omite el segundo reto de código. ¿Te sobra tiempo? Abre el bloque opcional **07 · Errores y asincronía** o convierte el quiz final en una votación grupal.

---

## Puntos a tratar por bloque

### 00 · Introducción (5 min)
- Nació en 1995 (Brendan Eich, Netscape, ~10 días). JavaScript ≠ Java.
- ECMAScript es el estándar; ES2015 (“ES6”) modernizó el lenguaje; desde entonces hay versiones anuales.
- Se ejecuta en navegadores, servidores (Node.js, Deno, Bun), móviles, escritorio, IoT.
- Características: tipado dinámico, un solo hilo con event loop, multiparadigma.
- Demo: ejecuta el primer editor; muestra la consola de las DevTools (F12).

### 01 · Sintaxis y variables (10 min)
- Sentencias, expresiones, bloques, comentarios, punto y coma (ASI), mayúsculas/minúsculas, reglas de nombres.
- `const` por defecto, `let` para reasignar, evita `var`.
- `const` protege la referencia, no el valor (los objetos aún pueden cambiar).
- Hoisting: `var` → `undefined`; `let`/`const` → Zona Muerta Temporal; las declaraciones de función se elevan completas.
- Quiz: predecir la salida de `var` y `let` elevados.

### 02 · Tipos de datos (10 min)
- `string`, `number`, `bigint`, `boolean`, `undefined`, `null`, `symbol` + `object`.
- `typeof null === "object"` (bug histórico); para arrays usa `Array.isArray`.
- Punto flotante (`0.1 + 0.2`), `NaN !== NaN`, `Number.isNaN`, conversión de strings, BigInt.
- Template literals, métodos comunes de string, los strings son inmutables.
- Los primitivos se copian por valor; los objetos por referencia. `{} === {}` es `false`.

### 03 · Operadores (15 min)
- Aritméticos, `%`, `**`, asignación compuesta, `++` prefijo vs. sufijo.
- `+` con strings concatena; los demás operadores aritméticos convierten a número.
- `==` vs `===`: explora la matriz de igualdad en vivo. Regla: usa siempre `===`.
- Tarjetas “¡adivina!” de coerción: deja que el público responda antes de revelar.
- Los operadores lógicos devuelven *valores*, no solo booleanos; evaluación en cortocircuito.
- Los 8 valores falsy; todo lo demás es truthy (incluidos `"0"`, `[]`, `{}`).
- Operadores modernos: ternario, `??` vs `||`, encadenamiento opcional, asignación lógica, spread.
- Laboratorio de operadores + tabla de precedencia.

### 04 · Control de flujo (8 min)
- `if / else if / else`, `switch` con fall-through y `break`.
- `for`, `while`, `do…while`, `for…of` (valores) vs. `for…in` (claves), `break` / `continue`.
- Demo: escribe `while (true) {}`; el editor lo detiene a los 4 segundos.

### 05 · Funciones (20 min)
- Tres formas de definir funciones; diferencias de hoisting; reglas de las funciones flecha.
- Parámetros por defecto, rest y desestructurados; retorno implícito de `undefined`.
- Alcance léxico y closures (fábrica de contadores, fábrica de funciones).
- Quiz de closures: `var` vs `let` dentro de un bucle con `setTimeout`.
- Funciones de primera clase y de orden superior, callbacks, composición.
- `this`: métodos normales vs. funciones flecha, pérdida de `this`, `bind`.
- Reto: `isPalindrome(text)` con pruebas en vivo.

### 06 · Objetos y arrays (10 min)
- Objetos literales, notación de punto vs. corchetes, métodos, agregar/eliminar claves, `Object.keys`.
- Desestructuración (renombrado + valores por defecto), propiedades abreviadas, combinación con spread.
- `map`, `filter`, `reduce`, `find`, `some`, `every`, encadenamiento.
- Métodos que mutan (`push`, `sort`) vs. que no mutan (copia con spread).
- Reto: `getAdultNames(people)`.

### 07 · Errores y asincronía (7 min, opcional)
- Ya no forma parte de la presentación principal: está en `errores-y-asincronia.html`, enlazada desde la última diapositiva y desde la tarjeta 07 de la agenda. Úsala si sobra tiempo o como material de repaso.
- `try / catch / finally`, `throw`, tipos de error incorporados, subclases propias de `Error`.
- Event loop: código síncrono → microtareas (Promesas) → macrotareas (temporizadores).
- Promesas (`then` / `catch`) y `async / await` con `try / catch`.

### 08 · Cierre (5 min)
- La última diapositiva enlaza tres páginas independientes, cada una con un enlace “Volver a la presentación”:
  - **Hoja de referencia** (`cheatsheet.html`): tarjetas de resumen + referencia de sintaxis, imprimible.
  - **Quiz final** (`quiz.html`): 6 preguntas con puntaje en vivo.
  - **Preguntas y recursos** (`qa.html`): MDN, javascript.info, Eloquent JavaScript, You Don't Know JS, próximos pasos.

---

## Controles del presentador (index.html)

| Tecla                       | Acción                                   |
|-----------------------------|------------------------------------------|
| `→` / `Espacio` / `AvPág`   | Diapositiva siguiente                    |
| `←` / `RePág`               | Diapositiva anterior                     |
| `Inicio` / `Fin`            | Primera / última diapositiva             |
| `M`                         | Menú de diapositivas (saltar a cualquiera) |
| `N`                         | Mostrar/ocultar notas del presentador    |
| `F`                         | Pantalla completa                        |
| `Ctrl` + `Enter`            | Ejecutar el código del editor enfocado   |
| `Esc`                       | Salir del editor / cerrar paneles        |

Todos los bloques de código son editables. El código se ejecuta en un Web Worker aislado con un límite de 4 segundos, así que los bucles infinitos no pueden congelar la presentación. El hash de la URL (`#12`) guarda la diapositiva actual, de modo que al recargar no pierdes tu lugar.

> Nota: los mensajes de error que genera el propio motor de JavaScript (p. ej. `TypeError: Assignment to constant variable.`) aparecen en inglés, igual que en cualquier navegador.
