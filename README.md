# 🎸 Battle of Bands

Tournoi musical : 32 artistes s'affrontent, tu votes pour ton préféré !

## Installation

### Prérequis
- [Node.js](https://nodejs.org) v18+ (LTS recommandé)

### Démarrage

```bash
# 1. Installer les dépendances
cd server && npm install
cd ../client && npm install

# 2. Peupler la base de données (504 artistes)
cd server && npm run seed

# 3. Lancer le backend (terminal 1)
cd server && npm run dev

# 4. Lancer le frontend (terminal 2)
cd client && npm run dev
```

Ouvre http://localhost:5173 dans ton navigateur.

## Structure

```
BattleOfBands/
├── server/          # API Node.js + Express + SQLite
│   ├── db/          # Base de données & seed
│   ├── routes/      # artists, tournament, rankings
│   └── data/        # artists.json (504 artistes)
└── client/          # Frontend React + Vite
    └── src/
        ├── pages/   # HomePage, TournamentPage, RankingsPage
        └── components/  # Header, MatchView, Bracket, WinnerScreen
```

## API

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/artists/categories` | Toutes les catégories disponibles |
| GET | `/api/artists/random?category_type=genre&category_value=Rock` | 32 artistes aléatoires |
| POST | `/api/tournament/start` | Démarrer un tournoi |
| POST | `/api/tournament/:id/match` | Voter pour un match |
| GET | `/api/tournament/:id` | État du tournoi |
| GET | `/api/rankings` | Classement global |

## Catégories

**Genres :** Rock, Pop, Metal, Punk, Hip-Hop, Jazz, Blues, Country, Electronic, R&B, Reggae, Folk, Classical, Alternative, Indie, Soul, Funk, Latin, K-Pop, J-Pop

**Pays :** 30+ pays

**Langues :** Anglais, Français, Espagnol, Portugais, Allemand, Suédois, Norvégien, Japonais, Coréen, Italien, Néerlandais
