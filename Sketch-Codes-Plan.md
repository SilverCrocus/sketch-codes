# Sketch‑Codes — Game Design Plan
*(Codenames × Skribbl, timer‑free edition)*

---

## 1. Concept Overview
Sketch‑Codes is a two‑player cooperative word‑guessing game.  
Each round, one player **draws** a single sketch hinting at multiple target words while the partner **guesses** by clicking tiles on a 5 × 5 word grid.  
It borrows the **double‑key** mechanic from *Codenames Duet* but replaces verbal clues with doodles.  
**No turn timer** → play at a relaxed pace and banter freely.

---

## 2. Game Setup
| Item | Details |
|------|---------|
| **Word Grid** | 25 random PG‑friendly words shared by both players. |
| **Key Cards** | • Player A: 9 green targets, 3 assassins, 13 neutral/opp.<br>• Player B: same structure.<br>• 3 greens + 1 assassin overlap between keys. |
| **Visible Info** | Each player sees **only their own key** plus board reveals so far. |
| **Start Turn** | Choose a random player to draw first. |

---

## 3. Turn Flow (no timer)
1. **Drawing Phase**  
   * Active player draws on a free‑hand canvas.  
   * No letters, numbers, arrows, or written symbols.  
   * They click “Done” when satisfied.
2. **Guess Phase**  
   * Partner clicks 1 tile at a time, up to *N + 1* guesses (N = intended words).  
   * After each click the server reveals the tile’s colour **using the guesser’s key**.  
   * Turn ends on the first non‑green reveal **or** when guesser stops voluntarily.
3. **Swap Roles** – Other player becomes drawer.

---

## 4. Win / Loss Conditions
* **Win** – All 15 shared‑team green tiles (A’s 9 + B’s 9 with overlaps) revealed.  
* **Loss** – Any assassin revealed **or** turns exhausted (default = 9 drawings each, configurable).

---

## 5. UI Components
| Component | Purpose |
|-----------|---------|
| **WordGrid** | 5 × 5 clickable tiles with dynamic colour states. |
| **DrawingCanvas** | `react‑konva` surface; strokes broadcast live to partner. |
| **KeySidebar** | Mini 5 × 5 card showing *your* private colours only. |
| **TurnBanner** | “Ning is drawing…” / “Your guess” indicator. |
| **GuessFeed** | List of past guesses with icons ✅ 🟦 🔴 ☠️. |
| **EndgameModal** | Reveal both keys, offer rematch. |

---

## 6. Game State Model (Pydantic)
```python
class Stroke(BaseModel):
    points: list[list[float]]  # [[x,y], …]
    color: str = "#000000"
    width: int = 2

class GameState(BaseModel):
    grid: list[str]           # 25 words
    key_a: list[str]          # 'G' 'N' 'A'
    key_b: list[str]
    revealed: list[str]       # '', 'G_A', 'G_B', 'A', 'N'
    turn: Literal['A', 'B']
    strokes: list[Stroke] = []
    turn_count: int = 0
    finished: bool = False
```

---

## 7. WebSocket Message Types
| Type | Payload |
|------|---------|
| `BOARD` | `{ words: [...] }` |
| `STROKE` | `{ points:[[x,y],...], color, width }` |
| `GUESS` | `{ index:int }` |
| `RESULT` | `{ index:int, colour:'G'|'N'|'A' }` |
| `END_TURN` | `{}` |
| `REVEAL` | entire key data after game end |
| `CHAT` *(optional)* | plain text banter |

---

## 8. Tech Stack
* **Backend** – Python 3.12, FastAPI, `fastapi‑websocket‑pubsub`, Pydantic v2, Redis (active games), PostgreSQL (history).  
* **Frontend** – React + TypeScript, Vite, TailwindCSS, `react‑konva`, Zustand (client state).  
* **Deployment** – Docker → Fly.io or Railway (WebSocket‑friendly).

---

## 9. Development Roadmap
| Day | Milestone | Status | Notes |
|-----|-----------|--------|-------|
| **1** | Repo scaffold; serve static React app; `/ws` echo. | ✅ Done | Basic Vite frontend serving `index.html` and `App.tsx`. Backend `main.py` exists. `/ws` echo TBD. |
| **2** | WordGrid component + random word endpoint. | ✅ Done | `WordGrid.tsx` fetches words from backend `/api/words`. Backend serves placeholder words. |
| **2a** | **Lobby/Game Creation Flow (Initial)** | ✅ Done | - `HomePage.tsx` & `GamePage.tsx` created.<br>- `react-router-dom` installed.<br>- Frontend routes (`/` and `/game/:gameId`) set up.<br>- `WordGrid` moved into `GamePage`.<br>- "Create Game" navigation implemented (frontend `gameId` generation).<br>- Backend: `/api/create_game` endpoint & basic in-memory game session management implemented.<br>- Frontend: "Join Game" UI and logic implemented. | 
| **3** | DrawingCanvas ↔ realtime strokes. | 🚧 Partially Done / Needs Debugging | Basic drawing sending and receiving implemented. WebSocket connection stability issues encountered (client reports disconnections). Current focus is on stabilizing this. | 
| **4** | Guess logic & colour feedback. | ⏳ To Do |  | 
| **5** | Key generator w/ correct overlaps; win/loss detection. | ⏳ To Do |  | 
| **5a** | Eraser Functionality for DrawingCanvas | ⏳ To Do | Implement ability to erase strokes or parts of strokes. Consider if this has game mechanic implications (e.g., costs a turn/token). | 
| **5b** | "Submit Drawing" Mechanism | ⏳ To Do | Allow a player to finalize their drawing, potentially locking the canvas for them and notifying other players. | 
| **6** | UI polish (sidebar, banners, mobile). | ⏳ To Do | May include UI for eraser/submit if not done prior. | 
| **7** | Persistent game history, rematch flow, dark‑mode toggle. | ⏳ To Do |  | 

---

## 10. Nice‑to‑Have Enhancements
* Eraser costs 1 guess token.  
* Colour brushes for easier multi‑word hints (optional rule).  
* “Undo last stroke” limited to once per turn.  
* Spectator mode for future group play.  
* Emoji reactions that float across the board on big wins.

---

*Enjoy building Sketch‑Codes and may your stick‑figures guide Ning to victory!*  

### Phase 1: Core Game Setup & Basic Drawing (Complete)

-   [x] **Backend**: Basic FastAPI setup.
-   [x] **Backend**: WebSocket endpoint (`/ws`) for real-time communication.
-   [x] **Backend**: Game creation endpoint (`/api/create_game`) - **DONE (Now uses memorable IDs)**
-   [x] **Backend**: Store active games and connected clients in memory.
-   [x] **Frontend**: Basic React setup with Vite.
-   [x] **Frontend**: `HomePage` to create or join a game.
-   [x] **Frontend**: `GamePage` to display the game.
-   [x] **Frontend**: Connect to WebSocket on `GamePage` mount.
-   [x] **Frontend**: Basic drawing capability using Konva.js on `DrawingCanvas` component.
-   [x] **Real-time Sync**: Broadcast drawing data (strokes) to all clients in the same game room.
-   [x] **Stability**: Ensure WebSocket connection uses server-generated `game_id` - **DONE**
-   [x] **UX**: Game IDs are memorable (e.g., "FunnyCat123") - **DONE**
-   [x] **UX**: Joining a game via ID is case-insensitive - **DONE**

### Phase 2: Core Gameplay Features

-   [ ] **Drawing Tools:**
    -   [ ] Color Picker
    -   [ ] Brush Size Selector
    -   [ ] **Eraser Tool** 
    -   [ ] Clear Canvas Button
-   [ ] **Word Management:**
    -   [ ] Word list storage (e.g., in a Python file or simple text file).
