# Canasta

Juego de **Rummy Canasta** 1v1 para jugar en el navegador. Sin servidor: solo
HTML + CSS + JS estático (apto para GitHub Pages). El multijugador en tiempo
real (P2P con WebRTC vía PeerJS) se agrega en el próximo commit.

## Estado actual

- ✅ Motor del juego con reglas configuradas:
  - 11 cartas por jugador, 2 mazos + 4 jokers (108 cartas).
  - Robo del pozo: **siempre** par natural en mano + tope.
  - Bajada inicial escalonada: 50 / 90 / 120 (según puntaje acumulado).
  - Corte: requiere al menos una canasta (limpia o sucia).
  - Canastas: limpia 500, sucia 300. Bonus corte 100. 3 rojos 100c/u (+400 si los 4).
  - 3 negros bloquean el pozo y solo se bajan al cortar.
- ✅ UI hot-seat (ambos jugadores en la misma pantalla, se ve la mano del turno).
- ⏳ Multijugador P2P (próximo commit).

## Cómo correrlo localmente

```bash
# desde la raíz del repo
python3 -m http.server 8000
# abrir http://localhost:8000
```

(Cualquier servidor estático sirve. No abrir con `file://` porque los
módulos ES requieren HTTP.)

## Arquitectura

```
index.html
css/style.css
js/
  engine/
    cards.js       # cartas, valores, helpers (isWild, isJoker, …)
    deck.js        # mazo 108 cartas + shuffle determinista (seed)
    rules.js       # validar melds, robo, corte, mínimos
    scoring.js     # puntaje fin de mano
    game.js        # estado + acciones (drawStock, takeDiscard, meld…)
  ui/
    render.js      # render del estado
    main.js        # bootstrap + binding de botones
```

El motor es **state-in / state-out**: cada acción retorna `{ok}` o `{error}`.
Esto facilita el modelo *host-authoritative* del próximo commit: el host corre
las acciones, el cliente envía intents y recibe el estado resultante.
